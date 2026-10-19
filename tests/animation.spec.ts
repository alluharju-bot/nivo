import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnimationMixer, LoopOnce, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ready, save, view } from './helpers';
import { projected } from './precision-helpers';
import { freshProject, makeBody, type Project } from '../src/model/project';
import {
  ensureAnimationNodes,
  evaluateAnimation,
  putKey,
  type AnimationClip,
} from '../src/model/animation';
const panel = (page: Page) => page.getByTestId('animation-panel');
const left = { ...makeBody(100, 10, 180, [0, 0, 0], 'LEFT_DOOR'), groupId: 'left-group' };
const pin = { ...makeBody(10, 15, 10, [80, 0, 170], 'LEFT_LOCK'), groupId: 'left-group' };
const right = makeBody(100, 10, 180, [110, 0, 0], 'RIGHT_DOOR');
function project() {
  return {
    ...freshProject(),
    bodies: [left, pin, right],
    groups: [
      { id: 'left-group', name: 'LEFT_DOOR_GROUP', hidden: false, kind: 'assembly' as const },
    ],
  };
}
async function load(page: Page, p: Project) {
  await ready(page);
  await page.getByTestId('project-file').setInputFiles({
    name: 'blast-door.nivo',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.getByTestId('viewport')).toHaveAttribute(
    'data-mesh-count',
    String(p.bodies.length),
  );
  await view(page, p.bodies);
}
async function open(page: Page) {
  const button = page.getByRole('button', { name: 'Animaatio', exact: true });
  if (await button.isVisible()) await button.click();
  else await page.getByLabel('Työtila', { exact: true }).selectOption('motion');
  await expect(page.getByTestId('animation-timeline')).toBeVisible();
}
async function select(page: Page, name: string) {
  await panel(page).getByLabel('Animaation kohde').selectOption({ label: name });
}
async function time(page: Page, value: number) {
  await page.getByLabel('Animaation aika', { exact: true }).fill(String(value));
}
async function key(page: Page) {
  await panel(page).getByRole('button', { name: 'Lisää / päivitä avain', exact: true }).click();
  await expect(page.getByTestId('viewport')).not.toHaveAttribute('data-busy', 'true');
}
const matrices = async (page: Page) =>
  new Map<string, number[]>(
    JSON.parse(
      (await page.getByTestId('viewport').getAttribute('data-animation-matrices')) ?? '[]',
    ),
  );

test('authors independent door and child tracks, scrubs, undoes, plays and restores the unchanged model', async ({
  page,
}, info) => {
  const p = project();
  await load(page, p);
  await open(page);
  await panel(page).getByRole('button', { name: 'Luo animaatioklippi' }).click();
  await select(page, '▣ LEFT_DOOR_GROUP');
  await key(page);
  await time(page, 1);
  await panel(page).getByLabel('Animaatio position Y').fill('-100');
  await key(page);
  await time(page, 3.5);
  await panel(page).getByLabel('Animaatio position X').fill('-100');
  await key(page);
  await time(page, 0);
  await select(page, 'RIGHT_DOOR');
  await key(page);
  await time(page, 3.5);
  await panel(page).getByLabel('Animaatio position X').fill('300');
  await key(page);
  await time(page, 0);
  await select(page, 'LEFT_LOCK');
  await key(page);
  await time(page, 0.35);
  await panel(page).getByLabel('Animaatio position Z').fill('75');
  await key(page);
  await time(page, 1);
  const saved = await save(page);
  expect(saved.animation!.clips[0].tracks.map((t) => t.keys.length).sort()).toEqual([2, 2, 3]);
  expect(saved.bodies.map((b) => b.feature)).toEqual(p.bodies.map((b) => b.feature));
  expect(saved.bodies.map((b) => b.origin)).toEqual(p.bodies.map((b) => b.origin));
  const builds = await page.getByTestId('viewport').getAttribute('data-geometry-builds');
  await page.screenshot({ path: info.outputPath('mechanical-animation.png') });
  await page.getByRole('button', { name: 'Peru', exact: true }).click();
  expect(
    (await save(page)).animation!.clips[0].tracks.find(
      (t) => t.nodeId === saved.animation!.nodes.find((n) => n.bodyId === pin.id)!.id,
    )!.keys,
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Palauta', exact: true }).click();
  await time(page, 3.5);
  expect((await matrices(page)).get(left.id)![12]).toBeCloseTo(-150);
  await time(page, 0);
  expect((await matrices(page)).get(left.id)![12]).toBeCloseTo(0);
  await page.getByLabel('Animaation toistonopeus').selectOption('2');
  await page.getByRole('button', { name: 'Toista animaatio', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-animation-time', '3.5', {
    timeout: 10000,
  });
  expect(await page.getByTestId('viewport').getAttribute('data-geometry-builds')).toBe(builds);
  expect((await save(page)).bodies).toEqual(saved.bodies);
  await page.getByLabel('Animaation toistonopeus').selectOption('-2');
  await page.getByRole('button', { name: 'Toista animaatio', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-animation-time', '0', {
    timeout: 10000,
  });
  await panel(page).getByRole('button', { name: 'Sulje animaatio', exact: true }).click();
  await expect(page.getByTestId('animation-timeline')).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-mesh-count', '3');
  await open(page);
  expect((await save(page)).animation).toEqual(saved.animation);
});

test('uses the modelling move, rotate and scale controls for draft poses only', async ({
  page,
}) => {
  await load(page, project());
  await open(page);
  await panel(page).getByRole('button', { name: 'Luo animaatioklippi' }).click();
  await select(page, 'RIGHT_DOOR');
  await key(page);
  await time(page, 2);
  const before = await save(page);
  await panel(page).getByRole('button', { name: 'Kierrä · R', exact: true }).click();
  await page.getByTestId('rotation-angle').fill('90');
  await page.getByTestId('rotation-angle').press('Enter');
  await expect(panel(page).getByLabel('Animaatio rotation Z')).toHaveValue('90');
  await panel(page).getByRole('button', { name: 'Skaalaa · L', exact: true }).click();
  await page.getByTestId('scale-factor').fill('1.2');
  await page.getByTestId('scale-factor').press('Enter');
  await expect(panel(page).getByLabel('Animaatio scale X')).toHaveValue('1.2');
  await panel(page).getByRole('button', { name: 'Siirrä · M', exact: true }).click();
  const at = await projected(page),
    point = at(160, 5, 180);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 40, point.y, { steps: 5 });
  await page.mouse.up();
  expect((await save(page)).bodies).toEqual(before.bodies);
  await key(page);
  const after = await save(page),
    keys = after.animation!.clips[0].tracks[0].keys;
  expect(keys).toHaveLength(2);
  expect(keys[1].pose.scale[0]).toBeCloseTo(1.2);
  expect(Math.abs(keys[1].pose.rotation[2])).toBeCloseTo(Math.SQRT1_2);
  expect(keys[1].pose.position).not.toEqual(keys[0].pose.position);
});

function animatedProject() {
  const p: Project = project(),
    data = ensureAnimationNodes(p);
  let clip: AnimationClip = {
    id: 'blast-open',
    name: 'BLAST_DOOR_OPEN',
    duration: 3.5,
    loop: false,
    tracks: [],
    markers: [{ id: 'release', name: 'LOCK_RELEASE', time: 0.35 }],
  };
  for (const n of data.nodes.filter(
    (n) => n.groupId || n.bodyId === pin.id || n.bodyId === right.id,
  )) {
    const offset = n.groupId ? [-150, -100, 0] : n.bodyId === pin.id ? [0, 0, -5] : [150, -100, 0];
    clip = putKey(clip, n.id, {
      id: `${n.id}-0`,
      time: 0,
      pose: n.rest,
      interpolation: n.bodyId === pin.id ? 'step' : 'smooth',
    });
    clip = putKey(clip, n.id, {
      id: `${n.id}-1`,
      time: n.bodyId === pin.id ? 0.35 : 3.5,
      pose: {
        ...n.rest,
        position: n.rest.position.map((v, i) => v + offset[i]) as [number, number, number],
        rotation:
          n.bodyId === right.id
            ? new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2).toArray()
            : n.rest.rotation,
        scale: n.bodyId === right.id ? [1.1, 1, 1] : [1, 1, 1],
      },
      interpolation: 'linear',
    });
  }
  p.animation = { ...data, clips: [clip] };
  return p;
}
test('exports a playable GLB with hierarchy, TRS, easing and metadata', async ({ page }, info) => {
  const p = animatedProject();
  await load(page, p);
  await page.getByRole('button', { name: 'Vie 3D-malli', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('combobox')
    .filter({ has: page.locator('option[value="glb"]') })
    .selectOption('glb');
  const download = page.waitForEvent('download');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Vie tiedosto|Lataa|Vie malli/ })
    .click();
  const bytes = await readFile((await (await download).path())!);
  await writeFile(info.outputPath('blast-door.glb'), bytes);
  await writeFile(join(tmpdir(), 'nivo-blast-door.glb'), bytes);
  const expected = [0, 0.35, 0.8, 1.7, 3.5, 1, 0].map((t) => ({
    time: t,
    bodies: p.bodies.map((body) => ({
      id: body.id,
      name: body.name,
      position: new Vector3(...body.origin)
        .applyMatrix4(
          evaluateAnimation(p.animation!, p.animation!.clips[0], t).bodyMatrices.get(body.id)!,
        )
        .multiplyScalar(0.001)
        .toArray(),
    })),
  }));
  await writeFile(join(tmpdir(), 'nivo-animation-expected.json'), JSON.stringify(expected));
  const json = JSON.parse(
    bytes
      .subarray(20, 20 + bytes.readUInt32LE(12))
      .toString()
      .trim(),
  );
  expect(json.animations[0].name).toBe('BLAST_DOOR_OPEN');
  expect(json.animations[0].channels).toHaveLength(9);
  expect(
    json.animations[0].samplers.some((s: { interpolation: string }) => s.interpolation === 'STEP'),
  ).toBe(true);
  const loaded = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    '',
  );
  const objects = new Map<string, Object3D>();
  loaded.scene.traverse((o) => {
    if (o.userData.nivoId) objects.set(o.userData.nivoId, o);
  });
  const mixer = new AnimationMixer(loaded.scene),
    action = mixer.clipAction(loaded.animations[0]);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const conversion = new Matrix4()
    .makeRotationX(-Math.PI / 2)
    .multiply(new Matrix4().makeScale(0.001, 0.001, 0.001));
  for (const t of [0, 0.35, 0.8, 1.7, 3.5, 1, 0]) {
    action.reset().play();
    mixer.setTime(t);
    loaded.scene.updateMatrixWorld(true);
    const evaluation = evaluateAnimation(p.animation!, p.animation!.clips[0], t);
    for (const body of p.bodies) {
      const object = objects.get(body.id)!;
      const expected = new Vector3(...body.origin)
        .applyMatrix4(evaluation.bodyMatrices.get(body.id)!)
        .applyMatrix4(conversion);
      const actual = object.getWorldPosition(new Vector3());
      expect(
        actual.distanceTo(expected),
        JSON.stringify({
          t,
          body: body.name,
          actual: actual.toArray(),
          expected: expected.toArray(),
        }),
      ).toBeLessThan(0.00002);
    }
  }
});

test('edits keys by drag and fields, copies and deletes them, and picks a real pivot', async ({
  page,
}, info) => {
  const p = project();
  await load(page, p);
  await open(page);
  await panel(page).getByRole('button', { name: 'Luo animaatioklippi' }).click();
  await select(page, 'RIGHT_DOOR');
  await key(page);
  await panel(page).getByRole('button', { name: 'Poimi pivot', exact: true }).click();
  const corner = (await projected(page))(110, 0, 180);
  await page.mouse.move(corner.x, corner.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-snap-visible', 'true');
  await page.mouse.click(corner.x, corner.y);
  const pivoted = await save(page);
  expect(
    evaluateAnimation(pivoted.animation!, undefined, 0)
      .world.get(pivoted.animation!.nodes.find((n) => n.bodyId === right.id)!.id)!
      .elements.slice(12, 15),
  ).toEqual([110, 0, 180]);
  await time(page, 1);
  await panel(page).getByLabel('Animaatio rotation Z').fill('90');
  await key(page);
  const saved = await save(page),
    track = saved.animation!.clips[0].tracks[0],
    id = track.keys[1].id;
  const diamond = page.getByTestId(`animation-key-${id}`);
  await diamond.click();
  await panel(page).getByLabel('Avaimen interpolointi').selectOption('linear');
  await panel(page).getByLabel('Avaimen aika').fill('1.5');
  await panel(page).getByLabel('Avaimen aika').press('Enter');
  await expect(page.getByLabel('Animaation aika', { exact: true })).toHaveValue('1.5');
  const box = (await diamond.boundingBox())!,
    lane = (await diamond.locator('..').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + lane.width / 7, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(panel(page).getByLabel('Avaimen aika')).toHaveValue('2');
  await panel(page).getByRole('button', { name: 'Kopioi avain', exact: true }).click();
  await time(page, 3);
  await panel(page).getByRole('button', { name: 'Liitä avain tähän aikaan', exact: true }).click();
  const copied = await save(page);
  expect(copied.animation!.clips[0].tracks[0].keys.map((k) => k.time)).toEqual([0, 2, 3]);
  await page
    .getByTestId(`animation-key-${copied.animation!.clips[0].tracks[0].keys[2].id}`)
    .click();
  await panel(page).getByRole('button', { name: 'Poista avain', exact: true }).click();
  expect((await save(page)).animation!.clips[0].tracks[0].keys.map((k) => k.time)).toEqual([0, 2]);
  await view(page, p.bodies, 'front');
  await page.screenshot({ path: info.outputPath('timeline-pivot.png') });
});

test('opens the Blast Door example and returns to its rest pose after playback', async ({
  page,
}, info) => {
  const p = JSON.parse(await readFile('public/examples/blast-door.nivo', 'utf8')) as Project;
  await load(page, p);
  await open(page);
  await view(page, p.bodies, 'front');
  await time(page, 1.7);
  await expect(page.locator('.animation-track')).toHaveCount(6);
  await page.screenshot({ path: info.outputPath('blast-door-timeline.png') });
  const before = await save(page);
  await page.getByLabel('Animaation toistonopeus').selectOption('2');
  await page.getByRole('button', { name: 'Toista animaatio', exact: true }).click();
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-animation-time', '3.5');
  expect((await matrices(page)).get('LEFT_DOOR_MESH')![12]).toBeCloseTo(-700);
  expect((await matrices(page)).get('RIGHT_DOOR_MESH')![12]).toBeCloseTo(700);
  await page.getByRole('button', { name: 'Pysäytä animaatio', exact: true }).click();
  expect((await matrices(page)).get('LEFT_DOOR_MESH')![12]).toBeCloseTo(0);
  await panel(page).getByRole('button', { name: 'Sulje animaatio', exact: true }).click();
  expect((await save(page)).bodies).toEqual(before.bodies);
});

test('picks the posed geometry beyond its original bounds and rebases its pivot safely', async ({
  page,
}) => {
  const p = animatedProject();
  await load(page, p);
  await open(page);
  await select(page, 'RIGHT_DOOR');
  await time(page, 3.5);
  await view(page, p.bodies);
  const evaluation = evaluateAnimation(p.animation!, p.animation!.clips[0], 3.5);
  const moved = new Vector3(110, 0, 180).applyMatrix4(evaluation.bodyMatrices.get(right.id)!);
  const target = (await projected(page))(moved.x, moved.y, moved.z);
  await panel(page).getByRole('button', { name: 'Poimi pivot', exact: true }).click();
  await page.mouse.move(target.x, target.y);
  await expect(page.getByTestId('viewport')).toHaveAttribute('data-snap-visible', 'true');
  await page.mouse.click(target.x, target.y);
  const saved = await save(page),
    n = saved.animation!.nodes.find((n) => n.bodyId === right.id)!;
  const point = evaluateAnimation(saved.animation!, undefined, 0)
    .restWorld.get(n.id)!
    .elements.slice(12, 15);
  point.forEach((v, i) => expect(v).toBeCloseTo([110, 0, 180][i], 5));
});
