import { expect, it } from 'vitest';
import { freshProject, makeBody } from '../model/project';
import { projectRevision } from '../storage/projectRevision';
import { prepareSnapshot } from './prepareSnapshot';

it('preserves portable cloud hashes, saved defaults and remote identity', async () => {
  const project = { ...freshProject(), bodies: [makeBody(48, 98, 2700)] };
  const saved = JSON.stringify({ ...project, updatedAt: '2001-01-01T00:00:00.000Z' });
  const hash = await prepareSnapshot({ project, saved, remoteId: 'remote-one' });
  expect(hash).toBe(await projectRevision({ ...project, id: 'remote-one' }));
  expect(await prepareSnapshot({ project, saved, remoteId: 'remote-two' })).not.toBe(hash);
});

it('rejects another tab’s saved edit rather than overwriting it with the visible model', async () => {
  const project = freshProject();
  await expect(
    prepareSnapshot({
      project,
      saved: JSON.stringify({ ...project, name: 'Another tab' }),
      remoteId: 'remote',
    }),
  ).rejects.toThrow('toisessa välilehdessä');
});
