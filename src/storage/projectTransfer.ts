import { parseProject, type Project } from '../model/project';
import { safeFilename, downloadFile } from './projects';

export type TransferRevision = { format: 1; projectId: string; revision: string };
export type ProjectTransfer = { project: Project; transfer?: TransferRevision };

import { projectRevision } from './projectRevision';
export { projectRevision } from './projectRevision';

export async function createProjectTransfer(project: Project): Promise<File> {
  const transfer: TransferRevision = {
    format: 1,
    projectId: project.id,
    revision: await projectRevision(project),
  };
  return new File(
    [JSON.stringify({ ...project, transfer })],
    `${safeFilename(project.name)}.nivo`,
    { type: 'application/json' },
  );
}
export async function readProjectTransfer(text: string): Promise<ProjectTransfer> {
  const project = parseProject(text),
    metadata = JSON.parse(text).transfer;
  if (!metadata) return { project };
  if (
    metadata.format !== 1 ||
    metadata.projectId !== project.id ||
    typeof metadata.revision !== 'string' ||
    metadata.revision !== (await projectRevision(project))
  )
    throw new Error(
      'Jaetun tiedoston versiotieto ei vastaa sisältöä. Pyydä lähettäjää jakamaan projekti uudelleen.',
    );
  return { project, transfer: { format: 1, projectId: project.id, revision: metadata.revision } };
}
export async function compareTransferredProject(
  local: Project | undefined,
  incoming: ProjectTransfer,
): Promise<'new' | 'same' | 'different'> {
  if (!incoming.transfer || !local || local.id !== incoming.transfer.projectId) return 'new';
  return (await projectRevision(local)) === incoming.transfer.revision ? 'same' : 'different';
}
export function downloadTransfer(file: File) {
  downloadFile(file, file.name, file.type);
}
