import { projectRevision } from '../storage/projectTransfer';
import type { Project } from '../model/project';
import type { CloudBinding, CloudRemote, SyncResult } from './types';

/** Acknowledgements advance only to the exact uploaded snapshot, never to a
 * later edit that arrived while the network request was in flight. */
export async function synchronizeProject(
  project: Project,
  binding: CloudBinding,
  remote: CloudRemote,
  acknowledge: (binding: CloudBinding) => Promise<void>,
  verifiedHash?: string,
): Promise<SyncResult> {
  const snapshot = { ...project, id: binding.remoteId };
  const hash = verifiedHash ?? (await projectRevision(snapshot));
  const head = await remote.head(binding.remoteId);
  if (!head && binding.baseRevision) return { kind: 'missing' };
  if (head?.hash === hash) {
    await acknowledge({ ...binding, baseHash: hash, baseRevision: head.revision });
    return { kind: 'synced', head };
  }
  if (head && head.revision !== binding.baseRevision)
    return { kind: hash === binding.baseHash ? 'remote' : 'conflict', head };
  const saved = await remote.write(snapshot, hash, binding.baseRevision);
  if (!saved) {
    const latest = await remote.head(binding.remoteId);
    return latest ? { kind: 'conflict', head: latest } : { kind: 'missing' };
  }
  await acknowledge({ ...binding, baseHash: hash, baseRevision: saved.revision });
  return { kind: 'synced', head: saved };
}
