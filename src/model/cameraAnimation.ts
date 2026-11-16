import { CatmullRomCurve3, Matrix4, Quaternion, Vector3 } from 'three';
import { z } from 'zod';
import { renderViewSchema } from './renderViews';

export type CameraPose = Omit<z.infer<typeof renderViewSchema>, 'id' | 'name'>;
export interface AnimationCameraBridge {
  capture(): CameraPose;
  show(view: CameraPose): void;
}
export const cameraKeySchema = renderViewSchema
  .safeExtend({
    time: z.number().finite().min(0).max(3600),
    hold: z.number().finite().min(0).max(3600),
    interpolation: z.enum(['smooth', 'linear']),
    zoom: z
      .object({
        target: z.tuple([
          z.number().finite().min(-1e9).max(1e9),
          z.number().finite().min(-1e9).max(1e9),
          z.number().finite().min(-1e9).max(1e9),
        ]),
        focalLength: z.number().finite().min(12).max(200),
        start: z.number().finite().min(0).max(3600).optional(),
        duration: z.number().finite().positive().max(3600).optional(),
      })
      .optional(),
  })
  .refine(
    (k) => !k.zoom || new Vector3(...k.position).distanceTo(new Vector3(...k.zoom.target)) > 0.01,
    'Zoomin kohde ei voi olla kameran kohdalla.',
  );
export const cameraTrackSchema = z.object({ keys: z.array(cameraKeySchema).max(500) });
export type CameraKey = z.infer<typeof cameraKeySchema>;
export type CameraTrack = z.infer<typeof cameraTrackSchema>;

/** Arrival times are absolute, so actor tracks keep their existing timing. */
export function validateCameraTrack(track: CameraTrack, duration: number): string | undefined {
  if (new Set(track.keys.map((k) => k.id)).size !== track.keys.length)
    return 'Kamerapisteen tunniste toistuu.';
  for (let i = 0; i < track.keys.length; i++) {
    const k = track.keys[i],
      previous = track.keys[i - 1];
    if (k.time + k.hold > duration + 1e-8) return 'Pysähdyksen pitää mahtua klipin kestoon.';
    if (previous && k.time <= previous.time + previous.hold + 1e-8)
      return 'Pysähdysten väliin tarvitaan aikaa kameran liikkeelle.';
    if (k.zoom && k.hold <= 0) return 'Yksityiskohtazoom tarvitsee pysähdysajan.';
    if (k.zoom && (k.zoom.start ?? 0) + (k.zoom.duration ?? k.hold) > k.hold + 1e-8)
      return 'Zoomin alun ja keston pitää mahtua pysähdykseen.';
  }
}

const curves = new WeakMap<CameraTrack, CatmullRomCurve3>();
const smooth = (t: number) => t * t * (3 - 2 * t);
const vector = (v: number[]) => new Vector3(...v);
function orientation(p: CameraPose) {
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(vector(p.position), vector(p.target), new Vector3(0, 0, 1)),
  );
}
function mix(
  a: CameraPose,
  b: CameraPose,
  t: number,
  position = vector(a.position).lerp(vector(b.position), t),
): CameraPose {
  const rotation = orientation(a).slerp(orientation(b), t);
  const distance =
    vector(a.position).distanceTo(vector(a.target)) * (1 - t) +
    vector(b.position).distanceTo(vector(b.target)) * t;
  // Interpolate orientation rather than crossing through a coincident look-at point.
  const target = new Vector3(0, 0, -1)
    .applyQuaternion(rotation)
    .multiplyScalar(distance)
    .add(position);
  return {
    position: position.toArray(),
    target: target.toArray(),
    focalLength: a.focalLength + (b.focalLength - a.focalLength) * t,
  };
}
const endPose = (k: CameraKey): CameraPose => (k.zoom ? { ...k, ...k.zoom } : k);

export function evaluateCamera(
  track: CameraTrack | undefined,
  time: number,
): CameraPose | undefined {
  if (!track?.keys.length) return;
  const keys = track.keys;
  if (time <= keys[0].time) return keys[0];
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].time <= time) i++;
  const a = keys[i],
    b = keys[i + 1];
  if (time <= a.time + a.hold && a.hold > 0) {
    if (!a.zoom) return a; // Avoid quaternion roundoff during an exact still hold.
    const start = a.zoom?.start ?? 0,
      duration = a.zoom?.duration ?? a.hold;
    return mix(a, endPose(a), smooth(Math.max(0, Math.min(1, (time - a.time - start) / duration))));
  }
  if (!b) return endPose(a);
  const t = Math.max(0, Math.min(1, (time - a.time - a.hold) / (b.time - a.time - a.hold)));
  const u = a.interpolation === 'smooth' ? smooth(t) : t;
  let position: Vector3 | undefined;
  if (a.interpolation === 'smooth' && keys.length > 2) {
    let curve = curves.get(track);
    if (!curve) {
      curve = new CatmullRomCurve3(
        keys.map((k) => vector(k.position)),
        false,
        'centripetal',
      );
      curves.set(track, curve);
    }
    position = curve.getPoint((i + u) / (keys.length - 1));
  }
  return mix(endPose(a), b, u, position);
}

/** One atomic edit, sorted and validated before it reaches project history. */
export function putCameraKey(track: CameraTrack | undefined, key: CameraKey, duration: number) {
  const parsed = cameraKeySchema.parse(key);
  const next = cameraTrackSchema.parse({
    keys: [...(track?.keys.filter((k) => k.id !== key.id) ?? []), parsed].sort(
      (a, b) => a.time - b.time,
    ),
  });
  const nextDuration = Math.max(duration, ...next.keys.map((k) => k.time + k.hold));
  if (nextDuration > 3600) throw new Error('Klipin enimmäiskesto on 3600 sekuntia.');
  const error = validateCameraTrack(next, nextDuration);
  if (error) throw new Error(error);
  return { camera: next, duration: nextDuration };
}
