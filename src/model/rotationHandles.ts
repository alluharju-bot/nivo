import type { Body, Vec3 } from './project';
import type { Rotation } from './transforms';
import { rotationRadius } from './transforms';
import { sketchFrame, fromUV } from './sketch';
import { dot } from './geometry';
export function rotationHandles(rotation: Rotation, bodies: Body[]) {
  const radius = rotationRadius(bodies.filter((b) => rotation.ids.includes(b.id)));
  const axes: { axis: Vec3; color: string; name: string }[] = [
    { axis: [1, 0, 0], color: '#c96562', name: 'X' },
    { axis: [0, 1, 0], color: '#4f9765', name: 'Y' },
    { axis: [0, 0, 1], color: '#5284c3', name: 'Z' },
  ];
  if (!axes.some(({ axis }) => Math.abs(dot(axis, rotation.axis)) > 0.99999))
    axes.push({ axis: rotation.axis, color: '#9671b9', name: 'Reuna' });
  return axes.map((entry) => {
    const frame = sketchFrame(rotation.pivot, entry.axis);
    return {
      ...entry,
      radius,
      points: Array.from({ length: 97 }, (_, i) => {
        const angle = (i * Math.PI * 2) / 96;
        return fromUV([Math.cos(angle) * radius, Math.sin(angle) * radius], frame);
      }),
    };
  });
}
