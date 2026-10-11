import { cast, getOC, measureArea, type AnyShape, type Shape3D } from 'replicad';
import { exactBounds, solidVolume } from './kernel';

function hasFaces(shape: AnyShape) {
  const oc = getOC();
  const explorer = new oc.TopExp_Explorer(
    shape.wrapped,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  try {
    return explorer.More();
  } finally {
    explorer.delete();
  }
}

/** A cut may remove only a loose surface, or leave one after all solids are gone. */
export function cutResultState(source: AnyShape, result: AnyShape) {
  const empty = !hasFaces(result);
  if (empty) return { empty, changed: true };
  const before = solidVolume(source),
    after = solidVolume(result);
  if (Math.abs(after - before) >= Math.max(1e-7, before * 1e-12)) return { empty, changed: true };
  const area = measureArea(source as Shape3D);
  return {
    empty,
    changed: Math.abs(measureArea(result as Shape3D) - area) >= Math.max(1e-7, area * 1e-12),
  };
}

type Box = ReturnType<typeof exactBounds>;
const disjoint = (a: Box, b: Box) =>
  a.min.some((v, i) => v > b.max[i] + 1e-6 || b.min[i] > a.max[i] + 1e-6);

/** Cut independent tools together, keeping intersecting/touching tools in separate passes.
 * A single all-tools boolean can spend far more time intersecting cutters with each other
 * than with the target (e.g. radial cutters crossing in the empty centre of a tube).
 * Inputs remain owned by the caller; only the returned shape needs to be released.
 */
export function cutShapes(source: AnyShape, tools: AnyShape[]): AnyShape {
  const bounds = exactBounds(source);
  const groups: { shape: AnyShape; box: Box }[][] = [];
  for (const shape of tools) {
    const box = exactBounds(shape);
    if (disjoint(bounds, box)) continue;
    const group = groups.find((g) => g.every((tool) => disjoint(tool.box, box)));
    if (group) group.push({ shape, box });
    else groups.push([{ shape, box }]);
  }
  let result = source.clone();
  try {
    for (const group of groups) {
      const operation = new (getOC().BRepAlgoAPI_Cut)();
      try {
        const args = operation.Arguments(),
          tools = operation.Tools();
        try {
          args.Append(result.wrapped);
          for (const { shape } of group) tools.Append(shape.wrapped);
          operation.SetArguments(args);
          operation.SetTools(tools);
        } finally {
          args.delete();
          tools.delete();
        }
        operation.SetNonDestructive(true);
        operation.Build();
        if (operation.HasErrors()) throw new Error('Leikkaus ei muodosta ehjää kappaletta.');
        operation.SimplifyResult(true, true, 0.001);
        const next = cast(operation.Shape());
        result.delete();
        result = next;
        if (!hasFaces(result)) break;
      } finally {
        operation.delete();
      }
    }
    return result;
  } catch (error) {
    result.delete();
    throw error;
  }
}
