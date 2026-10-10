import { cast, getOC, type AnyShape } from 'replicad';
import { exactBounds } from './kernel';

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
        const solids = result.solids;
        const empty = !solids.length;
        solids.forEach((s) => s.delete());
        if (empty) break;
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
