import { Vector3 } from 'three';
import type { Vec3 } from '../model/project';
import type { FractureMotion } from './types';

export function directionFromAngles(azimuth: number, elevation: number): Vec3 {
  const a = (azimuth * Math.PI) / 180,
    e = (elevation * Math.PI) / 180;
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
}
export function directionAngles(direction: Vec3): [number, number] {
  const v = new Vector3(...direction).normalize();
  return [
    (Math.atan2(v.y, v.x) * 180) / Math.PI,
    (Math.asin(Math.max(-1, Math.min(1, v.z))) * 180) / Math.PI,
  ];
}
export function validateMotion(motion: FractureMotion) {
  if (
    ![...motion.direction, ...motion.gravity, motion.speed, motion.spread].every(Number.isFinite) ||
    Math.hypot(...motion.direction) < 1e-8 ||
    motion.speed < 0 ||
    motion.speed > 20 ||
    motion.spread < 0 ||
    motion.spread > 90 ||
    Math.hypot(...motion.gravity) > 30
  )
    throw new Error(
      'Tarkista heiton suunta, nopeus (0–20 m/s), hajonta (0–90°) ja painovoima (0–30 m/s²).',
    );
}
/** Deterministic, evenly distributed launch cone. Independent of render frame rate. */
export function fragmentVelocity(motion: FractureMotion, index: number, count: number): Vec3 {
  const axis = new Vector3(...motion.direction).normalize();
  const u = new Vector3()
    .crossVectors(axis, Math.abs(axis.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0))
    .normalize();
  const v = new Vector3().crossVectors(axis, u);
  const angle = index * 2.399963229728653;
  const cosTheta =
    1 - ((index + 0.5) / Math.max(1, count)) * (1 - Math.cos((motion.spread * Math.PI) / 180));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return axis
    .multiplyScalar(cosTheta)
    .addScaledVector(u, Math.cos(angle) * sinTheta)
    .addScaledVector(v, Math.sin(angle) * sinTheta)
    .multiplyScalar(motion.speed)
    .toArray();
}
