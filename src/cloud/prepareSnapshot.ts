import { parseProject, type Project } from '../model/project';
import { projectRevision } from '../storage/projectRevision';

export type SnapshotRequest = { project: Project; saved: string; remoteId: string };

/** Keep the portable hash format and the other-tab check unchanged. This work
 * belongs in a worker: validation and canonical JSON can take hundreds of ms. */
export async function prepareSnapshot({ project, saved, remoteId }: SnapshotRequest) {
  if ((await projectRevision(parseProject(saved))) !== (await projectRevision(project)))
    throw new Error(
      'Projektia on muutettu toisessa välilehdessä. Avaa uusin paikallinen versio ennen synkronointia.',
    );
  return projectRevision({ ...project, id: remoteId });
}
