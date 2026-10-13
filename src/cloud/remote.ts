import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseProject, type Project } from '../model/project';
import { projectRevision } from '../storage/projectTransfer';
import type { CloudHead, CloudRemote } from './types';
const bucket = 'nivo-projects';
const maxBytes = 50 * 1024 * 1024;
const headSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  revision: z.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  object_path: z.string(),
  updated_at: z.string(),
  parts: z.number().int().min(0),
});
const columns = 'id,name,revision,hash,object_path,updated_at,parts';
export function supabaseRemote(client: SupabaseClient, owner: string): CloudRemote {
  async function guard() {
    const { data, error } = await client.auth.getSession();
    if (error || data.session?.user.id !== owner)
      throw new Error('Kirjaudu uudelleen jatkaaksesi pilvisynkronointia.');
  }
  function checked(value: unknown) {
    const h = headSchema.parse(value);
    if (
      !h.object_path.startsWith(`${owner}/`) ||
      !/^[a-f0-9-]+\/[a-f0-9-]+\.nivo$/.test(h.object_path)
    )
      throw new Error('Pilvitallenteen osoite ei vastaa käyttäjää.');
    return h;
  }
  return {
    async head(id) {
      await guard();
      const { data, error } = await client
        .from('nivo_projects')
        .select(columns)
        .eq('owner_id', owner)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? checked(data) : undefined;
    },
    async list() {
      await guard();
      const result: CloudHead[] = [];
      for (let start = 0; ; start += 200) {
        const { data, error } = await client
          .from('nivo_projects')
          .select(columns)
          .eq('owner_id', owner)
          .order('updated_at', { ascending: false })
          .order('id')
          .range(start, start + 199);
        if (error) throw error;
        result.push(...data.map(checked));
        if (data.length < 200) return result;
      }
    },
    async read(head) {
      await guard();
      checked(head);
      const { data, error } = await client.storage.from(bucket).download(head.object_path);
      if (error) throw error;
      if (data.size > maxBytes) throw new Error('Pilvitallenne ylittää 50 Mt kokorajan.');
      const project = parseProject(await data.text());
      if (project.id !== head.id || (await projectRevision(project)) !== head.hash)
        throw new Error(
          'Pilvitallenteen sisältö ei vastaa sen versiotietoa. Paikallinen malli säilyi.',
        );
      await guard();
      return project;
    },
    async write(project: Project, hash: string, expected) {
      await guard();
      const content = new Blob([JSON.stringify(project)], { type: 'application/json' });
      if (content.size > maxBytes)
        throw new Error('Projekti ylittää pilven 50 Mt kokorajan. Paikallinen tallenne säilyy.');
      const path = `${owner}/${crypto.randomUUID()}.nivo`;
      const upload = await client.storage
        .from(bucket)
        .upload(path, content, { upsert: false, contentType: 'application/json' });
      if (upload.error) throw upload.error;
      // Keep an uncertain upload after network failure: the server may have
      // committed it. Never delete a blob another device may now be reading.
      await guard();
      const { data, error } = await client.rpc('nivo_commit_project', {
        p_owner: owner,
        p_id: project.id,
        p_expected: expected ?? 0,
        p_hash: hash,
        p_path: path,
        p_name: project.name,
        p_parts: project.bodies.length,
      });
      if (error) throw error;
      return data?.length ? checked(data[0]) : undefined;
    },
  };
}
