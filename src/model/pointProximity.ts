import type { Vec3 } from './project';

/** Preserve the exact distance test while avoiding a point × surface-center scan. */
export function pointProximity(points: Vec3[], tolerance: number) {
  const cells = new Map<string, Vec3[]>();
  const cell = (p: Vec3) => p.map((n) => Math.floor(n / tolerance));
  for (const p of points) {
    const key = cell(p).join(',');
    const bucket = cells.get(key);
    if (bucket) bucket.push(p);
    else cells.set(key, [p]);
  }
  return (point: Vec3) => {
    const [x, y, z] = cell(point);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const p of cells.get(`${x + dx},${y + dy},${z + dz}`) ?? [])
            if (Math.hypot(p[0] - point[0], p[1] - point[1], p[2] - point[2]) < tolerance)
              return true;
    return false;
  };
}
