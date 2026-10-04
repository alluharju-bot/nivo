import { beforeAll, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import init from 'replicad-opencascadejs';
import { setOC, makeBox, drawRectangle, drawCircle, Plane, type Sketch } from 'replicad';
import { sectionBodies } from './sections';
import { makeBody, freshProject, parseProject } from '../model/project';
import { sectionFrame, type Section } from '../model/sections';
import { bodyFromShape, createShape, meshBody } from './kernel';
import { sectionSheet } from '../drawing/sectionSvg';
import { translateMesh } from './translateMesh';

beforeAll(async () => {
  setOC(
    await init({
      wasmBinary: readFileSync(new URL(import.meta.resolve('replicad-opencascadejs/wasm'))),
    }),
  );
}, 30_000);

test('CAD plane intersections preserve a hollow solid', () => {
  const outer = makeBox([0, 0, 0], [600, 600, 2400]);
  const inner = makeBox([18, 18, 18], [582, 582, 2401]);
  const shell = outer.cut(inner);
  const plane = new Plane([300, 300, 1200], [1, 0, 0], [0, 0, 1]);
  const face = (drawRectangle(2000, 2000).sketchOnPlane(plane) as Sketch).face();
  const section = shell.intersect(face);
  const faces = section.faces;
  try {
    expect(faces).toHaveLength(1);
    const holes = faces[0].innerWires();
    expect(holes).toHaveLength(1);
    holes.forEach((w) => w.delete());
    expect(section.mesh().triangles.length).toBeGreaterThan(0);
  } finally {
    faces.forEach((f) => f.delete());
    section.delete();
    face.delete();
    plane.delete();
    shell.delete();
    inner.delete();
    outer.delete();
  }
});

function capArea(result: ReturnType<typeof sectionBodies>) {
  let area = 0;
  for (const cap of result.caps)
    for (let i = 0; i < cap.triangles.length; i += 3) {
      const [a, b, c] = cap.triangles
        .slice(i, i + 3)
        .map((index) => cap.vertices.slice(index * 3, index * 3 + 3));
      const u = b.map((n, k) => n - a[k]),
        v = c.map((n, k) => n - a[k]);
      area +=
        Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ) / 2;
    }
  return area;
}

test('18 mm cabinet walls, circular openings and flipped/oblique cuts preserve the true voids', () => {
  const outer = makeBox([0, 0, 0], [600, 600, 2400]),
    inner = makeBox([18, 18, 18], [582, 582, 2401]);
  const shell = outer.cut(inner),
    body = bodyFromShape(makeBody(), shell);
  const section: Section = {
    id: 'cut',
    name: 'A–A',
    frame: sectionFrame('z', [300, 300, 1200]),
    flipped: false,
    dimensions: [],
  };
  try {
    const result = sectionBodies([body], section, true);
    expect(capArea(result)).toBeCloseTo(600 * 600 - 564 * 564, 4);
    expect(result.caps[0].paths).toHaveLength(2);
    expect(result.caps[0].paths.every((path) => /Z/i.test(path))).toBe(true);
    const flipped = sectionBodies([body], { ...section, flipped: true }, true);
    expect(capArea(flipped)).toBeCloseTo(capArea(result), 4);
    const angled = {
      ...section,
      frame: {
        origin: [300, 300, 1200] as [number, number, number],
        normal: [Math.SQRT1_2, 0, Math.SQRT1_2] as [number, number, number],
        u: [0, 1, 0] as [number, number, number],
      },
    };
    expect(capArea(sectionBodies([body], angled, true))).toBeCloseTo(
      (600 * 600 - 564 * 564) * Math.SQRT2,
      3,
    );
    const a = result.anchors[0],
      b = result.anchors.find((p) => Math.abs(p.point[0] - a.point[0]) > 500)!;
    const dimension = { id: 'd', start: a, end: b, axis: 'horizontal' as const, offset: 400 };
    const saved = { ...section, dimensions: [dimension] },
      project = { ...freshProject(), bodies: [body], sections: [saved] };
    const sheet = sectionSheet(project, saved, result, 20);
    expect(sheet.orphanCount).toBe(0);
    expect(sheet.svg).toContain('fill-rule="evenodd"');
    expect(sheet.svg).toContain('data-mm="600"');
    const restored = parseProject(JSON.stringify(project));
    expect(restored.sections).toEqual([saved]);
    expect(
      sectionSheet({ ...project, bodies: [{ ...body, origin: [10, 0, 0] }] }, saved, result, 20)
        .orphanCount,
    ).toBe(1);
  } finally {
    shell.delete();
    inner.delete();
    outer.delete();
  }
  const box = makeBox([0, 0, 0], [600, 600, 100]),
    hole = (drawCircle(80).sketchOnPlane('XY') as Sketch).extrude(120).translate([300, 300, -10]),
    cut = box.cut(hole);
  try {
    const perforated = bodyFromShape(makeBody(), cut),
      result = sectionBodies(
        [perforated],
        { ...section, frame: sectionFrame('z', [0, 0, 50]) },
        true,
      );
    expect(result.caps[0].paths).toHaveLength(2);
    expect(result.caps[0].paths.join(' ')).toMatch(/A/);
    expect(capArea(result)).toBeGreaterThan(600 * 600 - Math.PI * 80 * 80 - 100);
    expect(capArea(result)).toBeLessThan(600 * 600 - Math.PI * 80 * 80 + 100);
  } finally {
    cut.delete();
    hole.delete();
    box.delete();
  }
});

test('a plane coincident with a face still exports in section coordinates', () => {
  const body = makeBody(600, 400, 200, [100, 200, 300]);
  const section: Section = {
    id: 'face',
    name: 'B–B',
    frame: sectionFrame('z', [250, 300, 500]),
    flipped: false,
    dimensions: [],
  };
  const result = sectionBodies([body], section, true);
  expect(capArea(result)).toBeCloseTo(600 * 400, 4);
  // The plane frame is translated relative to the original box sketch plane.
  expect(result.caps[0].paths.join(' ')).toContain('-150');
  expect(result.caps[0].paths.join(' ')).toContain('450');
});

test('building door openings and rounded panel sections retain exact contours', () => {
  const wall = makeBox([0, 0, 0], [6000, 200, 2800]),
    door = makeBox([1000, -10, -10], [1900, 210, 2100]),
    opened = wall.cut(door);
  const panel = makeBox([0, 0, 0], [600, 18, 2400]),
    rounded = panel.fillet(2);
  try {
    const section: Section = {
      id: 'wall',
      name: 'Seinä',
      frame: sectionFrame('y', [0, 100, 0]),
      flipped: false,
      dimensions: [],
    };
    const result = sectionBodies([bodyFromShape(makeBody(), opened)], section, true);
    expect(capArea(result)).toBeCloseTo(6000 * 2800 - 900 * 2100, 2);
    expect(
      result.anchors.some(
        (a) => Math.abs(a.point[0] - 1000) < 1e-5 && Math.abs(a.point[2] - 2100) < 1e-5,
      ),
    ).toBe(true);
    const roundedResult = sectionBodies(
      [bodyFromShape(makeBody(), rounded)],
      { ...section, frame: sectionFrame('z', [0, 0, 1200]) },
      true,
    );
    expect(roundedResult.caps[0].paths.join(' ')).toMatch(/A/);
    expect(Math.abs(capArea(roundedResult) - (600 * 18 - (4 - Math.PI) * 4))).toBeLessThan(1);
  } finally {
    rounded.delete();
    panel.delete();
    opened.delete();
    door.delete();
    wall.delete();
  }
});

test('repeated parts retain independent CAD faces and anchors while sharing display topology', () => {
  const source = makeBox([0, 0, 0], [600, 400, 100]),
    rounded = source.fillet(10);
  try {
    for (const body of [makeBody(600, 400, 100), bodyFromShape(makeBody(), rounded)]) {
      const shape = createShape(body);
      try {
        const mesh = meshBody(body, shape),
          delta: [number, number, number] = [1300, 2500, -35];
        const moved = {
          ...body,
          id: 'copy',
          origin: body.origin.map((n, i) => n + delta[i]) as [number, number, number],
        };
        const cached = translateMesh(mesh, moved.id, delta),
          exactShape = createShape(moved);
        try {
          const exact = meshBody(moved, exactShape);
          expect(cached.volume).toBeCloseTo(exact.volume, 3);
          expect(cached.faces.map((f) => f.ref)).toEqual(exact.faces.map((f) => f.ref));
          for (const vertex of cached.verticesCAD) {
            expect(vertex.anchor.bodyId).toBe('copy');
            expect(
              exact.verticesCAD.some(
                (v) => Math.hypot(...v.point.map((n, i) => n - vertex.point[i])) < 1e-5,
              ),
            ).toBe(true);
          }
          expect(cached.normals).toBe(mesh.normals);
          expect(cached.triangles).toBe(mesh.triangles);
          expect(mesh.verticesCAD.every((v) => v.anchor.bodyId === body.id)).toBe(true);
        } finally {
          exactShape.delete();
        }
      } finally {
        shape.delete();
      }
    }
  } finally {
    rounded.delete();
    source.delete();
  }
});

test('section projection uses actual cut contours', () => {
  const body = makeBody(600, 600, 2400);
  const result = sectionBodies(
    [body],
    {
      id: 's',
      name: 'A–A',
      frame: sectionFrame('z', [0, 0, 1200]),
      flipped: false,
      dimensions: [],
    },
    true,
  );
  expect(result.caps).toHaveLength(1);
  expect(result.anchors).toHaveLength(4);
  result.projection!.viewBox.forEach((n, i) => expect(n).toBeCloseTo([0, -600, 600, 600][i], 4));
  expect(result.caps[0].paths[0]).toMatch(/Z/i);
});
