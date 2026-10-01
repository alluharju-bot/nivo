import { parseProject, type Project } from '../model/project';

let database: Promise<IDBDatabase> | undefined;
function openDB() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('nivo', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(new Error('Selaintallennus ei ole käytettävissä.'));
    };
  }));
}
export async function saveLocal(project: Project, history?: string): Promise<boolean> {
  const db = await openDB();
  const write = (withHistory: boolean) =>
    new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('projects', 'readwrite');
      const store = transaction.objectStore('projects');
      store.put(JSON.stringify(project), 'active');
      if (withHistory && history) store.put(history, 'history');
      else store.delete('history');
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(new Error('Automaattitallennus epäonnistui. Lataa projektitiedosto talteen.'));
    });
  try {
    await write(true);
    return !!history;
  } catch {
    // If the history exhausts quota, still save the current model atomically.
    await write(false);
    return false;
  }
}
export async function loadLocalSession(): Promise<
  { project: Project; history?: string } | undefined
> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly'),
      store = transaction.objectStore('projects');
    const request = store.get('active'),
      history = store.get('history');
    transaction.oncomplete = () => {
      try {
        resolve(
          request.result
            ? {
                project: parseProject(request.result),
                history: typeof history.result === 'string' ? history.result : undefined,
              }
            : undefined,
        );
      } catch (e) {
        reject(e);
      }
    };
    transaction.onerror = transaction.onabort = () =>
      reject(new Error('Edellistä projektia ei voitu palauttaa.'));
  });
}
export function downloadFile(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export const safeFilename = (name: string) =>
  name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Nivo-projekti';
