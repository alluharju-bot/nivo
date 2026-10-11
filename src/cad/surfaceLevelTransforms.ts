import { deserializeShape, type AnyShape } from 'replicad';
import type { Body, Vec3 } from '../model/project';
import { scale } from '../model/geometry';

/** Keep the editable construction in the same rigid frame as its finished part. */
export function transformSurfaceLevels(
  source: Body,
  result: Body,
  transform: (shape: AnyShape) => AnyShape,
  normal: Vec3,
  factor = 1,
) {
  const recipe = source.feature.type === 'brep' ? source.feature.surfaceLevels : undefined;
  if (!recipe || result.feature.type !== 'brep') return;
  result.feature.surfaceLevels = {
    ...recipe,
    normal,
    baseDepth: recipe.baseDepth * factor,
    boundaries: recipe.boundaries.map((boundary) => {
      let wire = deserializeShape(boundary.wire).translate(source.origin);
      try {
        wire = transform(wire).translate(scale(result.origin, -1));
        return { ...boundary, height: boundary.height * factor, wire: wire.serialize() };
      } finally {
        wire.delete();
      }
    }),
  };
}
