import { parseProject, uid, type Project } from '../model/project';
export type RevisionEntry = {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  parts: number;
};
// Separate database: adding revision storage never blocks an open modeling tab's autosave.
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('nivo-revisions', 1);
    r.onupgradeneeded = () => {
      r.result
        .createObjectStore('entries', { keyPath: 'id' })
        .createIndex('projectId', 'projectId');
      r.result.createObjectStore('snapshots');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error('Versiotallennus ei ole käytettävissä.'));
  });
}
export async function listRevisions(projectId: string): Promise<RevisionEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction('entries').objectStore('entries').index('projectId').getAll(projectId);
    r.onsuccess = () =>
      resolve((r.result as RevisionEntry[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    r.onerror = () => reject(r.error);
    r.transaction!.oncomplete = () => db.close();
  });
}
export async function saveRevision(project: Project, name: string): Promise<RevisionEntry> {
  const entry = {
    id: uid(),
    projectId: project.id,
    name: name.trim().slice(0, 120) || 'Vertailuversio',
    createdAt: new Date().toISOString(),
    parts: project.bodies.length,
  };
  const data = JSON.stringify(project);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['entries', 'snapshots'], 'readwrite');
    tx.objectStore('entries').put(entry);
    tx.objectStore('snapshots').put(data, entry.id);
    tx.oncomplete = () => {
      db.close();
      resolve(entry);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error('Versiota ei voitu tallentaa. Selaimen tallennustila saattaa olla täynnä.'));
    };
  });
}
export async function readRevision(id: string): Promise<Project> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction('snapshots').objectStore('snapshots').get(id);
    r.onsuccess = () => {
      try {
        if (typeof r.result !== 'string') throw new Error('Versiota ei löytynyt.');
        resolve(parseProject(r.result));
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
    r.transaction!.oncomplete = () => db.close();
  });
}
export async function deleteRevision(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['entries', 'snapshots'], 'readwrite');
    tx.objectStore('entries').delete(id);
    tx.objectStore('snapshots').delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error('Version poistaminen epäonnistui.'));
    };
  });
}
