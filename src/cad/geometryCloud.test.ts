import { beforeAll, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { parseProject } from '../model/project';
import { createShape, meshBody, pushPullFace, shapeIsValid } from './kernel';
import { removeEdgeTreatment } from './details';

beforeAll(
  async () =>
    setOC(
      await init({
        wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
      }),
    ),
  30_000,
);

// Private user geometry remains outside the repository and published assets.
it.skipIf(!process.env.NIVO_GEOMETRY_MODEL)(
  'resizes planar faces in the private regression project, with and without retained rounds',
  () => {
    const project = parseProject(readFileSync(process.env.NIVO_GEOMETRY_MODEL!, 'utf8'));
    for (const original of project.bodies) {
      let plain = original;
      while (plain.edgeTreatment) plain = removeEdgeTreatment(plain);
      for (const body of plain === original ? [original] : [original, plain]) {
        const before = JSON.stringify(body),
          shape = createShape(body);
        try {
          expect(shapeIsValid(shape)).toBe(true);
          const mesh = meshBody(body, shape);
          for (const face of mesh.faces.filter((f) => f.planar))
            for (const distance of [-1, 1]) {
              const next = pushPullFace(body, face.ref, distance),
                result = createShape(next);
              try {
                expect(shapeIsValid(result), `${body.name} ${face.ref} ${distance}`).toBe(true);
                const volume = meshBody(next, result).volume;
                expect((volume - mesh.volume) * Math.sign(distance)).toBeGreaterThan(0);
              } finally {
                result.delete();
              }
            }
          expect(JSON.stringify(body)).toBe(before);
        } finally {
          shape.delete();
        }
      }
    }
  },
  120_000,
);
