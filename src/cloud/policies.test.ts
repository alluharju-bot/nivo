import { beforeAll, afterAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111',
  bob = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const file = `${alice}/44444444-4444-4444-8444-444444444444.nivo`;
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key); insert into auth.users values('${alice}'),('${bob}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text); alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
 grant usage on schema auth,storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated;
 `);
  await db.exec(
    readFileSync(
      new URL('../../supabase/migrations/202610130001_nivo_cloud.sql', import.meta.url),
      'utf8',
    ),
  );
}, 30000);
afterAll(() => db.close());
async function as(user: string, sql: string) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}';`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role;');
  }
}
const commit = (owner: string, revision: number, name = 'Project', path = file) =>
  `select * from public.nivo_commit_project('${owner}','${id}',${revision},'${'a'.repeat(64)}','${path}','${name}',1)`;
it('RLS isolates files and metadata, and all writes use owner-checked compare-and-swap', async () => {
  await as(alice, `insert into storage.objects values('nivo-projects','${file}')`);
  const first = await as(alice, commit(alice, 0));
  expect(first.rows).toHaveLength(1);
  expect((await as(bob, 'select * from public.nivo_projects')).rows).toHaveLength(0);
  expect((await as(bob, 'select * from storage.objects')).rows).toHaveLength(0);
  await expect(as(bob, commit(alice, 1))).rejects.toThrow('Not authorized');
  await expect(as(bob, commit(bob, 0))).rejects.toThrow('Invalid project revision or path');
  await expect(
    as(bob, `insert into storage.objects values('nivo-projects','${file}')`),
  ).rejects.toThrow();
  await expect(as(alice, `update public.nivo_projects set name='bypass'`)).rejects.toThrow(
    'permission denied',
  );
  expect((await as(alice, commit(alice, 0))).rows).toHaveLength(0);
  expect((await as(alice, commit(alice, 1, 'Updated'))).rows).toHaveLength(1);
  expect((await as(alice, commit(alice, 1, 'Stale overwrite'))).rows).toHaveLength(0);
  expect((await as(alice, 'select name from public.nivo_projects')).rows).toEqual([
    { name: 'Updated' },
  ]);
  expect((await as(alice, `delete from storage.objects returning *`)).rows).toHaveLength(0);
  await expect(
    as(alice, commit(alice, 2, 'Missing', `${alice}/55555555-5555-4555-8555-555555555555.nivo`)),
  ).rejects.toThrow('Project file missing');
  await db.exec(`set role anon; set request.jwt.claim.sub='';`);
  await expect(db.query(commit(alice, 2))).rejects.toThrow('permission denied');
  await expect(db.query('select * from public.nivo_projects')).rejects.toThrow('permission denied');
  await db.exec('reset role;');
});
