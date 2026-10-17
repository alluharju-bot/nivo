import type { SurfaceDraft } from './history';
import { checkMesh } from './mesh';
import { assertSelection } from './editing';

export interface RecoveryRecord {
  version: 1;
  projectId: string;
  bodyId: string;
  sourceStamp: string;
  name: string;
  hideOriginal: boolean;
  updatedAt: number;
  draft: SurfaceDraft;
}
const key = (projectId: string, bodyId: string) => JSON.stringify([projectId, bodyId]);
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nivo-surface-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Työversion paikallinen tallennus ei ole käytettävissä.'));
    request.onblocked = () => reject(new Error('Toinen välilehti estää työversion tallennuksen.'));
  });
}
let queue: Promise<unknown> = Promise.resolve();
function mutate(projectId: string, bodyId: string, value?: RecoveryRecord) {
  const task = queue
    .catch(() => {})
    .then(async () => {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite'),
          store = tx.objectStore('drafts');
        if (value) store.put(value, key(projectId, bodyId));
        else store.delete(key(projectId, bodyId));
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(
            new Error('Työversiota ei voitu varmistaa. Selaimen tallennustila voi olla täynnä.'),
          );
        };
      });
    });
  queue = task;
  return task;
}
export function checkRecovery(record: RecoveryRecord) {
  if (record.version !== 1 || !record.draft || typeof record.name !== 'string')
    throw new Error('Keskeneräisen työversion tallennusmuotoa ei tunnisteta.');
  const d = record.draft;
  checkMesh(d.mesh);
  assertSelection(d.mesh, d.selection);
  if ((d.loops?.length ?? 0) > 16) throw new Error('Työversiossa on liian monta silmukkavalintaa.');
  d.loops?.forEach((ids) => assertSelection(d.mesh, ids));
  for (const map of Object.values(d.maps))
    if (
      map &&
      (!Number.isInteger(map.size) ||
        map.size < 1 ||
        map.size > 1024 ||
        !(map.pixels instanceof Uint8ClampedArray) ||
        map.pixels.length !== map.size * map.size * 4)
    )
      throw new Error('Työversion pintakartta on vioittunut.');
}
export function saveRecovery(record: RecoveryRecord) {
  checkRecovery(record);
  return mutate(record.projectId, record.bodyId, record);
}
export function removeRecovery(projectId: string, bodyId: string) {
  return mutate(projectId, bodyId);
}
export async function readRecovery(projectId: string, bodyId: string) {
  await queue.catch(() => {});
  const db = await openDB();
  return new Promise<RecoveryRecord | undefined>((resolve, reject) => {
    const tx = db.transaction('drafts'),
      request = tx.objectStore('drafts').get(key(projectId, bodyId));
    tx.oncomplete = () => {
      db.close();
      try {
        const record = request.result as RecoveryRecord | undefined;
        if (record) {
          checkRecovery(record);
          if (record.projectId !== projectId || record.bodyId !== bodyId)
            throw new Error('Työversio kuuluu toiseen osaan.');
        }
        resolve(record);
      } catch (e) {
        reject(e);
      }
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(new Error('Keskeneräisen työn lukeminen epäonnistui.'));
    };
  });
}
