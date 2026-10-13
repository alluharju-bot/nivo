import { z } from 'zod';
import type { CloudBinding } from './types';
const schema = z.object({
  scope: z.string(),
  localId: z.string(),
  remoteId: z.string().uuid(),
  baseHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  baseRevision: z.number().int().positive().optional(),
});
const key = (scope: string, localId: string) => JSON.stringify([scope, localId]);
let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('nivo-cloud', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('bindings');
    r.onsuccess = () => {
      r.result.onversionchange = () => {
        r.result.close();
        database = undefined;
      };
      resolve(r.result);
    };
    r.onerror = () => {
      database = undefined;
      reject(new Error('Pilven paikallista jonotietoa ei voitu avata.'));
    };
  }));
}
export async function readBinding(
  scope: string,
  localId: string,
): Promise<CloudBinding | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('bindings').objectStore('bindings').get(key(scope, localId));
    r.onsuccess = () => {
      try {
        resolve(r.result ? schema.parse(r.result) : undefined);
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
  });
}
export async function writeBinding(binding: CloudBinding) {
  const db = await open();
  const parsed = schema.parse(binding);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('bindings', 'readwrite');
    tx.objectStore('bindings').put(parsed, key(binding.scope, binding.localId));
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function removeBinding(scope: string, localId: string) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('bindings', 'readwrite');
    tx.objectStore('bindings').delete(key(scope, localId));
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
