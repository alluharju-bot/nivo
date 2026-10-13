import { parseProject, type Project } from '../model/project';
import { safeFilename, downloadFile } from './projects';

export type TransferRevision = { format: 1; projectId: string; revision: string };
export type ProjectTransfer = { project: Project; transfer?: TransferRevision };

// Content-based revisions are portable across devices and independent of clock skew.
// Ignore save timestamps; normalize parsed defaults and property order before hashing.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export async function projectRevision(project: Project): Promise<string> {
  const normalized = parseProject(JSON.stringify(project));
  const bytes = new TextEncoder().encode(
    JSON.stringify(canonical({ ...normalized, updatedAt: undefined })),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
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
