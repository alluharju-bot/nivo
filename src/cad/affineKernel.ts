import init from 'brepjs-opencascade';
import wasmURL from 'brepjs-opencascade/src/brepjs_single.wasm?url';
import type { Vec3 } from '../model/project';
import type { BRepBuilderAPI_GTransform, TopoDS_Shape, TopAbs_ShapeEnum } from 'brepjs-opencascade';

// This kernel exposes GTransform, absent from the main Replicad build. Load it
// only for an accepted non-uniform scale; neither startup nor dragging needs it.
let kernel: ReturnType<typeof init> | undefined;
export async function affineBrep(data: string, pivot: Vec3, factors: Vec3) {
  return (await transformBrep(data, pivot, factors, false)).data;
}

export async function affineBrepWithHistory(data: string, pivot: Vec3, factors: Vec3) {
  return transformBrep(data, pivot, factors, true);
}

async function transformBrep(data: string, pivot: Vec3, factors: Vec3, history: boolean) {
  kernel ??= (init as (options: { locateFile: () => string }) => ReturnType<typeof init>)({
    locateFile: () => wasmURL,
  }).catch((error) => {
    kernel = undefined;
    throw error;
  });
  const oc = await kernel;
  const shape = oc.BRepToolsWrapper.Read(data),
    transform = new oc.gp_GTrsf_1();
  try {
    for (let i = 0; i < 3; i++) {
      transform.SetValue(i + 1, i + 1, factors[i]);
      transform.SetValue(i + 1, 4, pivot[i] * (1 - factors[i]));
    }
    const operation = new oc.BRepBuilderAPI_GTransform_2(shape, transform, true);
    try {
      if (!operation.IsDone()) throw new Error('Kappaleen skaalaus epäonnistui.');
      const result = operation.Shape();
      try {
        return {
          data: oc.BRepToolsWrapper.Write(result),
          faceMap: history ? faceHistory(oc, shape, result, operation) : undefined,
        };
      } finally {
        result.delete();
      }
    } finally {
      operation.delete();
    }
  } finally {
    transform.delete();
    shape.delete();
  }
}

/** A mesh may follow an affine transform only when the kernel confirms every
 * source face maps to exactly one result face. Otherwise tessellate normally. */
function faceHistory(
  oc: Awaited<ReturnType<typeof init>>,
  source: TopoDS_Shape,
  result: TopoDS_Shape,
  operation: BRepBuilderAPI_GTransform,
): number[] | undefined {
  const held: TopoDS_Shape[] = [];
  const faces = (shape: TopoDS_Shape) => {
    const explorer = new oc.TopExp_Explorer_2(
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE as unknown as TopAbs_ShapeEnum,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE as unknown as TopAbs_ShapeEnum,
    );
    const list: TopoDS_Shape[] = [];
    try {
      while (explorer.More()) {
        const face = explorer.Current();
        if (list.some((f) => f.IsSame(face))) face.delete();
        else {
          held.push(face);
          list.push(face);
        }
        if (list.length > 5000) throw new Error('Face history too large');
        explorer.Next();
      }
      return list;
    } finally {
      explorer.delete();
    }
  };
  try {
    const before = faces(source),
      after = faces(result);
    if (before.length !== after.length) return;
    const map = before.map((face, i) => {
      const modified = operation.ModifiedShape(face);
      try {
        return after[i].IsSame(modified) ? i : after.findIndex((f) => f.IsSame(modified));
      } finally {
        modified.delete();
      }
    });
    return map.every((i) => i >= 0) && new Set(map).size === after.length ? map : undefined;
  } catch {
    return undefined;
  } finally {
    held.forEach((face) => face.delete());
  }
}
