import { expect, it } from 'vitest';
import { freshProject, uid, type Project } from '../model/project';
import { projectRevision } from '../storage/projectTransfer';
import { synchronizeProject } from './sync';
import type { CloudBinding, CloudHead, CloudRemote } from './types';
function service() {
  const projects = new Map<string, { head: CloudHead; project: Project }>();
  let writes = 0;
  const remote: CloudRemote = {
    head: async (id) => projects.get(id)?.head,
    list: async () => [...projects.values()].map((p) => p.head),
    read: async (h) => projects.get(h.id)!.project,
    write: async (p, hash, expected) => {
      const old = projects.get(p.id);
      if (old?.head.revision !== expected) return;
      writes++;
      const head = {
        id: p.id,
        name: p.name,
        hash,
        revision: (expected ?? 0) + 1,
        object_path: 'fixture',
        updated_at: new Date().toISOString(),
        parts: p.bodies.length,
      };
      projects.set(p.id, { head, project: p });
      return head;
    },
  };
  return {
    remote,
    projects,
    get writes() {
      return writes;
    },
  };
}
const binding = (project: Project): CloudBinding => ({
  scope: 'test|alice',
  localId: project.id,
  remoteId: uid(),
});
it('uploads once, acknowledges a lost response safely and ignores timestamps', async () => {
  const s = service(),
    p = freshProject();
  let b = binding(p);
  await expect(
    synchronizeProject(p, b, s.remote, async () => {
      throw new Error('disk');
    }),
  ).rejects.toThrow('disk');
  expect(s.writes).toBe(1);
  expect(
    (
      await synchronizeProject(p, b, s.remote, async (next) => {
        b = next;
      })
    ).kind,
  ).toBe('synced');
  expect(
    (
      await synchronizeProject(
        { ...p, updatedAt: new Date().toISOString() },
        b,
        s.remote,
        async (next) => {
          b = next;
        },
      )
    ).kind,
  ).toBe('synced');
  expect(s.writes).toBe(1);
});
it('distinguishes a remote update from concurrent edits without overwriting either', async () => {
  const s = service(),
    p = freshProject();
  let a = binding(p);
  await synchronizeProject(p, a, s.remote, async (n) => {
    a = n;
  });
  const b = { ...a, scope: 'second-device', localId: uid() };
  await synchronizeProject({ ...p, name: 'Desktop' }, a, s.remote, async (n) => {
    a = n;
  });
  expect(
    (
      await synchronizeProject(p, b, s.remote, async () => {
        throw new Error('must not ack');
      })
    ).kind,
  ).toBe('remote');
  expect(
    (
      await synchronizeProject({ ...p, name: 'MacBook' }, b, s.remote, async () => {
        throw new Error('must not ack');
      })
    ).kind,
  ).toBe('conflict');
  expect(s.projects.get(a.remoteId)?.project.name).toBe('Desktop');
  expect(s.writes).toBe(2);
});
it('a version changes between checking and committing: CAS preserves the newer remote version', async () => {
  const s = service(),
    p = freshProject();
  let b = binding(p);
  await synchronizeProject(p, b, s.remote, async (n) => {
    b = n;
  });
  const original = s.remote.write;
  s.remote.write = async (p, h, v) => {
    await original({ ...p, name: 'Other' }, 'a'.repeat(64), v);
    return original(p, h, v);
  };
  expect((await synchronizeProject({ ...p, name: 'Mine' }, b, s.remote, async () => {})).kind).toBe(
    'conflict',
  );
  expect(s.projects.get(b.remoteId)?.project.name).toBe('Other');
});
it('offline failure leaves the base unchanged and can retry; missing acknowledged data never resurrects silently', async () => {
  const s = service(),
    p = freshProject();
  let b = binding(p);
  const base = b;
  const offline = {
    ...s.remote,
    write: async () => {
      throw new Error('offline');
    },
  };
  await expect(
    synchronizeProject(p, b, offline, async (n) => {
      b = n;
    }),
  ).rejects.toThrow('offline');
  expect(b).toBe(base);
  await synchronizeProject(p, b, s.remote, async (n) => {
    b = n;
  });
  s.projects.clear();
  expect((await synchronizeProject(p, b, s.remote, async () => {})).kind).toBe('missing');
});
it('acknowledges only the in-flight snapshot, so edits made during upload remain dirty', async () => {
  const s = service(),
    p = freshProject();
  let b = binding(p);
  const oldHash = await projectRevision({ ...p, id: b.remoteId });
  let release!: () => void;
  const original = s.remote.write;
  s.remote.write = async (...args) => {
    await new Promise<void>((r) => {
      release = r;
    });
    return original(...args);
  };
  const pending = synchronizeProject(p, b, s.remote, async (n) => {
    b = n;
  });
  while (!release) await new Promise((r) => setTimeout(r, 1));
  const edited = { ...p, name: 'New edits' };
  release();
  await pending;
  expect(b.baseHash).toBe(oldHash);
  s.remote.write = original;
  await synchronizeProject(edited, b, s.remote, async (n) => {
    b = n;
  });
  expect(s.writes).toBe(2);
});
