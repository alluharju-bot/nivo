import init from 'brepjs-opencascade';
import wasmURL from 'brepjs-opencascade/src/brepjs_single.wasm?url';
import type { Vec3 } from '../model/project';

// This kernel exposes GTransform, absent from the main Replicad build. Load it
// only for an accepted non-uniform scale; neither startup nor dragging needs it.
let kernel: ReturnType<typeof init> | undefined;
export async function affineBrep(data: string, pivot: Vec3, factors: Vec3) {
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
        return oc.BRepToolsWrapper.Write(result);
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
