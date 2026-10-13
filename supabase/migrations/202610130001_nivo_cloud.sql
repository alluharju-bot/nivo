-- Nivo's own Supabase project is recommended. No changes to other applications.
begin;
create table public.nivo_projects (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  name text not null check (length(name) between 1 and 120),
  revision bigint not null check (revision > 0),
  hash text not null check (hash ~ '^[a-f0-9]{64}$'),
  object_path text not null,
  parts integer not null check (parts between 0 and 10000),
  updated_at timestamptz not null default now(),
  primary key (owner_id,id)
);
alter table public.nivo_projects enable row level security;
revoke all on public.nivo_projects from public, anon, authenticated;
grant select on public.nivo_projects to authenticated;
create policy nivo_read_own_projects on public.nivo_projects
  for select to authenticated using ((select auth.uid()) = owner_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('nivo-projects','nivo-projects',false,52428800,array['application/json']);
create policy nivo_read_own_files on storage.objects for select to authenticated
  using (bucket_id='nivo-projects' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy nivo_insert_own_files on storage.objects for insert to authenticated
  with check (bucket_id='nivo-projects' and name ~ ('^' || (select auth.uid())::text || '/[a-f0-9-]+\.nivo$'));
-- Immutable uploads: no client UPDATE/DELETE policy.

-- Only this compare-and-swap function can advance a project. The owner is
-- checked explicitly; SECURITY DEFINER has a fixed empty search_path.
create function public.nivo_commit_project(
  p_owner uuid, p_id uuid, p_expected bigint, p_hash text,
  p_path text, p_name text, p_parts integer
) returns setof public.nivo_projects
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.uid() <> p_owner then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_expected < 0 or p_path !~ ('^' || p_owner::text || '/[a-f0-9-]+\.nivo$') then
    raise exception 'Invalid project revision or path' using errcode='22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id='nivo-projects' and name=p_path) then
    raise exception 'Project file missing' using errcode='22023';
  end if;
  if p_expected=0 then
    return query insert into public.nivo_projects (owner_id,id,name,revision,hash,object_path,parts)
      values(p_owner,p_id,p_name,1,p_hash,p_path,p_parts)
      on conflict (owner_id,id) do nothing returning *;
  else
    return query update public.nivo_projects
      set name=p_name,revision=revision+1,hash=p_hash,object_path=p_path,parts=p_parts,updated_at=now()
      where owner_id=p_owner and id=p_id and revision=p_expected returning *;
  end if;
end;
$$;
revoke all on function public.nivo_commit_project(uuid,uuid,bigint,text,text,text,integer) from public,anon;
grant execute on function public.nivo_commit_project(uuid,uuid,bigint,text,text,text,integer) to authenticated;
commit;
