import { bodySchema, makeProfileBody, type Body, type Vec3 } from './project';
import { add, sub, scale, dot } from './geometry';
import { frameV, type Profile } from './sketch';

export type DimensionKey =
  'width' | 'depth' | 'height' | 'diameter' | 'diameterX' | 'diameterY' | 'distance' | 'detail';
export interface EditableDimension {
  key: DimensionKey;
  label: string;
  value: number;
  signed?: boolean;
  zero?: boolean;
}
/** Map existing attachment points in the primitive's own drawing frame. */
export function resizedPrimitivePoint(before: Body, after: Body, point: Vec3): Vec3 {
  const a = before.feature,
    b = after.feature;
  if (a.type === 'rectangle-extrusion' && b.type === 'rectangle-extrusion')
    return add(
      after.origin,
      sub(point, before.origin).map((v, i) => {
        const key = (['width', 'depth', 'height'] as const)[i];
        return a[key] ? (v * b[key]) / a[key] : v;
      }) as Vec3,
    );
  if (a.type !== 'profile-extrusion' || b.type !== 'profile-extrusion') return point;
  const size = (p: Profile): [number, number] =>
    p.kind === 'rectangle'
      ? [p.width, p.depth]
      : p.kind === 'circle'
        ? [p.radius, p.radius]
        : p.kind === 'ellipse'
          ? [p.radiusX, p.radiusY]
          : [1, 1];
  const oldSize = size(a.profile),
    newSize = size(b.profile);
  const local = sub(point, add(before.origin, a.frame.origin));
  const u = (dot(local, a.frame.u) * newSize[0]) / oldSize[0];
  const v = (dot(local, frameV(a.frame)) * newSize[1]) / oldSize[1];
  const z = dot(local, a.frame.normal) * (a.distance ? b.distance / a.distance : 1);
  return add(
    add(after.origin, b.frame.origin),
    add(scale(b.frame.u, u), add(scale(frameV(b.frame), v), scale(b.frame.normal, z))),
  );
}
/** Shared by ordinary modeling and precision editing. These are design dimensions,
 * never a proxy for scaling the whole finished part. */
export function editableDimensions(body: Body): EditableDimension[] {
  const f = body.feature;
  const detail: EditableDimension[] = body.edgeTreatment
    ? [
        {
          key: 'detail',
          label: body.edgeTreatment.operation === 'fillet' ? 'Pyöristyssäde' : 'Viiste',
          value: body.edgeTreatment.size,
        },
      ]
    : [];
  if (f.type === 'profile-extrusion') {
    const p = f.profile;
    return [
      ...(p.kind === 'circle'
        ? [{ key: 'diameter' as const, label: 'Halkaisija', value: p.radius * 2 }]
        : p.kind === 'ellipse'
          ? [
              { key: 'diameterX' as const, label: 'Halkaisija U', value: p.radiusX * 2 },
              { key: 'diameterY' as const, label: 'Halkaisija V', value: p.radiusY * 2 },
            ]
          : p.kind === 'rectangle'
            ? [
                { key: 'width' as const, label: 'Leveys', value: p.width },
                { key: 'depth' as const, label: 'Syvyys', value: p.depth },
              ]
            : []),
      ...(!f.outline
        ? [
            {
              key: 'distance' as const,
              label: 'Paksuus',
              value: f.distance,
              signed: true,
              zero: true,
            },
          ]
        : []),
      ...detail,
    ];
  }
  if (f.type === 'rectangle-extrusion' || (f.type === 'brep' && f.solid))
    return [
      ...(['width', 'depth', 'height'] as const).map((key, i) => ({
        key,
        label: `${['Leveys', 'Syvyys', 'Korkeus'][i]} · ${['X', 'Y', 'Z'][i]}`,
        value: f[key],
        zero: f.type === 'rectangle-extrusion' && key === 'height',
      })),
      ...detail,
    ];
  return detail;
}
export function resizePrimitive(body: Body, key: DimensionKey, value: number): Body | undefined {
  if (!Number.isFinite(value) || Math.abs(value) > 100000)
    throw new Error('Anna kelvollinen mitta.');
  const f = body.feature;
  if (f.type === 'rectangle-extrusion' && ['width', 'depth', 'height'].includes(key))
    return bodySchema.parse({
      ...body,
      feature: { ...f, [key]: value },
      quantityBasis: body.quantityBasis?.manual ? body.quantityBasis : undefined,
    });
  if (f.type !== 'profile-extrusion') return;
  let profile = f.profile;
  if (key === 'diameter' && profile.kind === 'circle') profile = { ...profile, radius: value / 2 };
  else if (key === 'diameterX' && profile.kind === 'ellipse')
    profile = { ...profile, radiusX: value / 2 };
  else if (key === 'diameterY' && profile.kind === 'ellipse')
    profile = { ...profile, radiusY: value / 2 };
  else if (key === 'width' && profile.kind === 'rectangle') profile = { ...profile, width: value };
  else if (key === 'depth' && profile.kind === 'rectangle') profile = { ...profile, depth: value };
  else if (key !== 'distance') return;
  const next = makeProfileBody(
    profile,
    { ...f.frame, origin: add(body.origin, f.frame.origin) },
    key === 'distance' ? value : f.distance,
    body.name,
    body.purpose,
  );
  return bodySchema.parse({
    ...body,
    feature: { ...next.feature, ...(f.outline ? { outline: true } : {}) },
    origin: next.origin,
    component: body.component
      ? { ...body.component, offset: sub(add(body.origin, body.component.offset), next.origin) }
      : undefined,
    textureFrame: body.textureFrame
      ? {
          ...body.textureFrame,
          offset: sub(add(body.origin, body.textureFrame.offset), next.origin),
        }
      : undefined,
    quantityBasis: body.quantityBasis?.manual ? body.quantityBasis : undefined,
    vertexRefs: undefined,
  });
}
