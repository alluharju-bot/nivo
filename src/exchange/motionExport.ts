import {
  AnimationClip,
  Group,
  Matrix4,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import type { Body } from '../model/project';
import { easeMotion, motionError, motionWorld, type Motion } from '../model/motion';

/** Core glTF nodes + animation channels. Extras provide portable stable semantic IDs. */
export function attachMotions(root: Group, bodies: Body[], motions: Motion[]) {
  const error = motionError(motions, bodies);
  if (error)
    throw new Error(
      `${error} Sisällytä vientiin ankkuri ja kaikki liikkeen osat, tai poista animaatioiden vienti käytöstä.`,
    );
  const parts = new Map(bodies.map((b) => [b.id, b]));
  const objects = new Map(root.children.map((o) => [String(o.userData.nivoId), o]));
  const owners = new Map(motions.flatMap((m) => m.movingIds.map((id) => [id, m.id] as const)));
  const nodes = new Map<string, Group>();
  const worlds = new Map(motions.map((m) => [m.id, motionWorld(m, parts.get(m.anchorId)!)]));
  const clips: AnimationClip[] = [];
  for (const m of motions) {
    const node = new Group();
    node.name = `pivot_${m.id}`;
    node.userData.nivoPivot = {
      version: 1,
      id: m.id,
      name: m.name,
      kind: m.kind,
      anchorId: m.anchorId,
      movingIds: m.movingIds,
      axis: worlds.get(m.id)!.axis,
      closed: 0,
      open: m.amount,
      amountUnit: m.kind === 'hinge' ? 'degrees' : 'millimetres',
      duration: m.duration,
      easing: m.easing,
      openClip: `${m.name}__${m.id}__open`,
      closeClip: `${m.name}__${m.id}__close`,
      coordinateSystem: 'Nivo root local: millimetres, Z up; root converts to glTF metres, Y up',
    };
    nodes.set(m.id, node);
  }
  for (const m of motions) {
    const node = nodes.get(m.id)!,
      world = worlds.get(m.id)!;
    const parentId = owners.get(m.anchorId),
      parentWorld = parentId && worlds.get(parentId);
    const position = new Vector3(...world.pivot);
    if (parentWorld) position.sub(new Vector3(...parentWorld.pivot));
    node.position.copy(position);
    (parentId ? nodes.get(parentId)! : root).add(node);
    const inverse = new Matrix4().makeTranslation(
      ...(world.pivot.map((v) => -v) as [number, number, number]),
    );
    for (const id of m.movingIds) {
      const object = objects.get(id)!;
      object.matrix.premultiply(inverse);
      // Exporter's animation mode uses TRS, including nonanimated children.
      object.matrix.decompose(object.position, object.quaternion, object.scale);
      object.userData.nivoMotion = { pivotId: m.id, role: 'moving', id, name: parts.get(id)!.name };
      node.add(object);
    }
    const anchor = objects.get(m.anchorId)!;
    anchor.userData.nivoAnchorFor = [...(anchor.userData.nivoAnchorFor ?? []), m.id];
    for (const closing of [false, true]) {
      const times: number[] = [],
        values: number[] = [];
      // Sample easing into portable LINEAR keys. Also preserve rotations >180°.
      const steps = Math.max(24, Math.ceil(m.duration * 30));
      for (let i = 0; i <= steps; i++) {
        times.push((i / steps) * m.duration);
        const progress = easeMotion(i / steps, m.easing),
          amount = m.amount * (closing ? 1 - progress : progress);
        if (m.kind === 'hinge')
          values.push(
            ...new Quaternion()
              .setFromAxisAngle(new Vector3(...world.axis), (amount * Math.PI) / 180)
              .toArray(),
          );
        else
          values.push(
            ...position
              .clone()
              .addScaledVector(new Vector3(...world.axis), amount)
              .toArray(),
          );
      }
      const track =
        m.kind === 'hinge'
          ? new QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, values)
          : new VectorKeyframeTrack(`${node.uuid}.position`, times, values);
      clips.push(
        new AnimationClip(`${m.name}__${m.id}__${closing ? 'close' : 'open'}`, m.duration, [track]),
      );
    }
  }
  root.userData.nivoMechanisms = {
    version: 1,
    restState: 'closed',
    pivots: motions.map((m) => m.id),
  };
  return clips;
}
