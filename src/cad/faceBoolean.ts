import { cast, getOC, type AnyShape, type Edge, type Shape3D } from 'replicad';

/** Simplify newly created seams without erasing the user's existing surface
 * partitions. Protect surviving pieces through the boolean's exact history. */
export function faceBoolean(
  source: AnyShape,
  prism: AnyShape,
  subtract: boolean,
  partitions: Edge[],
): Shape3D {
  const oc = getOC(),
    operation = subtract ? new oc.BRepAlgoAPI_Cut() : new oc.BRepAlgoAPI_Fuse();
  try {
    const args = operation.Arguments(),
      tools = operation.Tools();
    try {
      args.Append(source.wrapped);
      tools.Append(prism.wrapped);
      operation.SetArguments(args);
      operation.SetTools(tools);
    } finally {
      args.delete();
      tools.delete();
    }
    operation.SetNonDestructive(true);
    operation.Build();
    if (operation.HasErrors()) throw new Error('Pursotus ei muodosta ehjää kappaletta.');
    if (!partitions.length) {
      operation.SimplifyResult(true, true, 0.001);
      const raw = operation.Shape();
      try {
        return cast(raw).asShape3D();
      } finally {
        raw.delete();
      }
    }
    const raw = operation.Shape(),
      unify = new oc.ShapeUpgrade_UnifySameDomain(raw, true, true, false);
    try {
      unify.SetSafeInputMode(true);
      unify.SetAngularTolerance(0.001);
      for (const edge of partitions) {
        unify.KeepShape(edge.wrapped);
        const history = operation.Modified(edge.wrapped),
          pieces = new oc.NCollection_List_TopoDS_Shape(history);
        history.delete();
        try {
          while (!pieces.IsEmpty()) {
            const piece = pieces.First();
            try {
              unify.KeepShape(piece);
            } finally {
              piece.delete();
            }
            pieces.RemoveFirst();
          }
        } finally {
          pieces.delete();
        }
      }
      unify.Build();
      const result = unify.Shape();
      try {
        return cast(result).asShape3D();
      } finally {
        result.delete();
      }
    } finally {
      unify.delete();
      raw.delete();
    }
  } finally {
    operation.delete();
  }
}
