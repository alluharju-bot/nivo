import { describe, expect, it } from 'vitest';
import { freshProject, makeBody } from '../model/project';
import {
  compareTransferredProject,
  createProjectTransfer,
  projectRevision,
  readProjectTransfer,
} from './projectTransfer';

describe('portable project versions', () => {
  it('keeps geometry, materials and project identity in a normal .nivo file', async () => {
    const project = { ...freshProject(), bodies: [makeBody(123, 48, 1000)] };
    const file = await createProjectTransfer(project);
    const received = await readProjectTransfer(await file.text());
    expect(file.name).toMatch(/\.nivo$/);
    expect(received.project.id).toBe(project.id);
    expect(received.project.bodies).toEqual(project.bodies);
    expect(received.transfer?.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(await compareTransferredProject(undefined, received)).toBe('new');
    expect(await compareTransferredProject(project, received)).toBe('same');
    expect(
      await compareTransferredProject(
        { ...project, name: 'Muokattu toisella laitteella' },
        received,
      ),
    ).toBe('different');
  });
  it('does not treat clock differences and property order as edits', async () => {
    const project = freshProject();
    const reversed = Object.fromEntries(Object.entries(project).reverse()) as typeof project;
    expect(await projectRevision({ ...reversed, updatedAt: '2001-01-01T00:00:00.000Z' })).toBe(
      await projectRevision(project),
    );
  });
  it('accepts old project files and rejects mismatched version metadata', async () => {
    const project = freshProject();
    expect((await readProjectTransfer(JSON.stringify(project))).transfer).toBeUndefined();
    const file = JSON.parse(await (await createProjectTransfer(project)).text());
    file.name = 'Changed outside Nivo';
    await expect(readProjectTransfer(JSON.stringify(file))).rejects.toThrow('versiotieto');
    file.transfer.format = 2;
    await expect(readProjectTransfer(JSON.stringify(file))).rejects.toThrow('versiotieto');
  });
});
