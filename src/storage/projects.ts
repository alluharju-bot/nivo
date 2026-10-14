import { parseProject, type Project } from '../model/project';
import { reidentifyProject } from '../model/projectImport';

export type LibraryEntry = {
  id: string;
  name: string;
  updatedAt: string;
  parts: number;
  kind: 'project' | 'part';
  thumbnail?: string;
};
type StoredSession = { project: string; history?: string; revision: number };
export type LocalSession = { project: Project; history?: string };
const revisions = new Map<string, number>();
let database: Promise<IDBDatabase> | undefined;
function openDB() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('nivo', 2);
    request.onupgradeneeded = () => {
      const db = request.result,
        tx = request.transaction!;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
      const sessions = db.createObjectStore('sessions');
      const entries = db.createObjectStore('entries', { keyPath: 'id' });
      const old = tx.objectStore('projects');
      const active = old.get('active'),
        history = old.get('history');
      history.onsuccess = () => {
        if (typeof active.result !== 'string') return;
        try {
          const project = parseProject(active.result);
          sessions.put(
            { project: active.result, history: history.result, revision: 1 },
            project.id,
          );
          entries.put(metadata(project));
          old.put(project.id, 'activeId');
          old.delete('active');
          old.delete('history');
        } catch {
          tx.abort();
        }
      };
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      database = undefined;
      reject(new Error('Selaintallennus ei ole käytettävissä.'));
    };
    request.onblocked = () => {
      database = undefined;
      reject(new Error('Sulje muut Nivo-välilehdet tallennuksen päivittämiseksi.'));
    };
  }));
}
function metadata(project: Project, previous?: LibraryEntry): LibraryEntry {
  return {
    ...previous,
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    parts: project.bodies.length,
    kind: previous?.kind ?? 'project',
  };
}
export async function saveLocal(
  project: Project,
  history?: string,
  options?: {
    kind?: LibraryEntry['kind'];
    thumbnail?: string;
    activate?: boolean;
  },
): Promise<boolean> {
  const db = await openDB();
  const serialized = JSON.stringify(project);
  const write = (withHistory: boolean) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['projects', 'sessions', 'entries'], 'readwrite');
      const sessions = tx.objectStore('sessions'),
        entries = tx.objectStore('entries');
      const current = sessions.get(project.id),
        entry = entries.get(project.id);
      let conflict = false,
        nextRevision = 0;
      entry.onsuccess = () => {
        const saved = current.result as StoredSession | undefined;
        if (saved && revisions.get(project.id) !== saved.revision) {
          conflict = true;
          tx.abort();
          return;
        }
        nextRevision = (saved?.revision ?? 0) + 1;
        sessions.put(
          {
            project: serialized,
            history: withHistory ? history : undefined,
            revision: nextRevision,
          } satisfies StoredSession,
          project.id,
        );
        entries.put({
          ...metadata(project, entry.result),
          ...(options?.kind ? { kind: options.kind } : {}),
          ...(options?.thumbnail ? { thumbnail: options.thumbnail } : {}),
        });
        if (options?.activate !== false) tx.objectStore('projects').put(project.id, 'activeId');
      };
      tx.oncomplete = () => {
        revisions.set(project.id, nextRevision);
        resolve();
      };
      let transactionError: DOMException | null = null;
      tx.onerror = (event) => {
        transactionError = (event.target as IDBRequest).error;
      };
      tx.onabort = () =>
        reject(
          conflict
            ? new Error(
                'Projektia on muutettu toisessa välilehdessä. Tallenna tämä versio tiedostoksi tai kirjastoon kopiona ennen jatkamista.',
              )
            : (tx.error ??
                transactionError ??
                new Error('Automaattitallennus epäonnistui. Lataa projektitiedosto talteen.')),
        );
    });
  try {
    await write(true);
    return !!history;
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') throw error;
    await write(false);
    return false;
  }
}
export async function loadLocalSession(
  id?: string,
  trackRevision = true,
): Promise<LocalSession | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'sessions'], 'readonly');
    let saved: StoredSession | undefined,
      projectId = id;
    const read = (key?: string) => {
      projectId = key;
      if (!key) return;
      const request = tx.objectStore('sessions').get(key);
      request.onsuccess = () => {
        saved = request.result;
      };
    };
    if (id) read(id);
    else {
      const active = tx.objectStore('projects').get('activeId');
      active.onsuccess = () => read(active.result);
    }
    tx.oncomplete = () => {
      try {
        if (!saved || !projectId) {
          resolve(undefined);
          return;
        }
        const project = parseProject(saved.project);
        if (trackRevision) revisions.set(projectId, saved.revision);
        resolve({ project, history: saved.history });
      } catch (e) {
        reject(e);
      }
    };
    tx.onabort = tx.onerror = () => reject(new Error('Projektia ei voitu palauttaa.'));
  });
}
/** Validate the whole batch first, then commit independent library copies atomically.
 * Importing parts must never replace a project, its history or the active session. */
export async function importLibraryParts(files: File[]): Promise<number> {
  if (!files.length) return 0;
  if (files.length > 50 || files.reduce((sum, file) => sum + file.size, 0) > 64_000_000)
    throw new Error('Tuo kerralla enintään 50 osatiedostoa, yhteensä enintään 64 Mt.');
  const incoming: { project: Project; serialized: string }[] = [];
  for (const file of files) {
    try {
      if (!file.name.toLowerCase().endsWith('.nivo'))
        throw new Error('Valitse Nivo-osatiedosto (.nivo).');
      const project = reidentifyProject(parseProject(await file.text()));
      if (!project.bodies.length) throw new Error('Tiedostossa ei ole osia.');
      project.updatedAt = new Date().toISOString();
      incoming.push({ project, serialized: JSON.stringify(project) });
    } catch (error) {
      throw new Error(`${file.name}: ${(error as Error).message} Mitään osia ei tuotu.`);
    }
  }
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['sessions', 'entries'], 'readwrite');
    for (const { project, serialized } of incoming) {
      tx.objectStore('sessions').add(
        { project: serialized, revision: 1 } satisfies StoredSession,
        project.id,
      );
      tx.objectStore('entries').add({ ...metadata(project), kind: 'part' });
    }
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(
        new Error(
          'Osia ei voitu tallentaa selaimeen. Mitään osia ei tuotu. Tarkista tallennustila.',
        ),
      );
  });
  for (const { project } of incoming) revisions.set(project.id, 1);
  return incoming.length;
}
/** Cloud verification needs the exact saved project, but not a parsed model or
 * undo graph on the UI thread. Parsing and hashing happen in its own worker. */
export async function loadSavedProject(id: string): Promise<string | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('sessions').objectStore('sessions').get(id);
    request.onsuccess = () => resolve((request.result as StoredSession | undefined)?.project);
    request.onerror = () => reject(new Error('Paikallista tallennusta ei voitu tarkistaa.'));
  });
}
/** Listing never parses CAD geometry or undo histories. */
export async function listLocalProjects(): Promise<LibraryEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction('entries').objectStore('entries').getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as LibraryEntry[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    request.onerror = () => reject(request.error);
  });
}
export async function deleteLocalProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'sessions', 'entries'], 'readwrite');
    const active = tx.objectStore('projects').get('activeId');
    let isActive = false;
    active.onsuccess = () => {
      if (active.result === id) {
        isActive = true;
        tx.abort();
        return;
      }
      tx.objectStore('sessions').delete(id);
      tx.objectStore('entries').delete(id);
    };
    tx.oncomplete = () => {
      revisions.delete(id);
      resolve();
    };
    tx.onabort = tx.onerror = () =>
      reject(
        new Error(
          isActive
            ? 'Avaa toinen projekti ennen tämän poistamista.'
            : 'Projektin poistaminen epäonnistui.',
        ),
      );
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

export async function updateThumbnail(id: string, thumbnail: string) {
  if (thumbnail.length > 120_000) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('entries', 'readwrite'),
      store = tx.objectStore('entries');
    const entry = store.get(id);
    entry.onsuccess = () => {
      if (entry.result) store.put({ ...entry.result, thumbnail });
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
