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
export async function saveLocal(project: Project): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite');
    transaction.objectStore('projects').put(JSON.stringify(project), 'active');
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () =>
      reject(new Error('Automaattitallennus epäonnistui. Lataa projektitiedosto talteen.'));
  });
}
export async function loadLocal(): Promise<Project | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('projects', 'readonly').objectStore('projects').get('active');
    request.onsuccess = () => {
      try {
        resolve(request.result ? parseProject(request.result) : undefined);
      } catch (e) {
        reject(e);
      }
    };
    request.onerror = () => reject(new Error('Edellistä projektia ei voitu palauttaa.'));
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
