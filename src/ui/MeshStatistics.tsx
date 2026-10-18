import { useMemo } from 'react';
import { Triangle } from 'lucide-react';
import type { Body } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { meshStatistics, triangleCount } from '../model/meshStats';

export function MeshStatistics({
  bodies,
  meshes,
  visible,
  selected,
  busy,
  onOpen,
}: {
  bodies: Body[];
  meshes: BodyMesh[];
  visible: Body[];
  selected: string[];
  busy: boolean;
  onOpen: () => void;
}) {
  const stats = useMemo(
    () => ({
      model: meshStatistics(bodies, meshes),
      visible: meshStatistics(visible, meshes),
      selection: meshStatistics(bodies, meshes, new Set(selected)),
    }),
    [bodies, meshes, visible, selected],
  );
  return (
    <button
      className="mesh-statistics"
      aria-label="Kolmiot ja LOD"
      disabled={busy}
      title={`Valinta: ${triangleCount(stats.selection.triangles)} · Näkyvissä: ${triangleCount(stats.visible.triangles)} · Koko malli: ${triangleCount(stats.model.triangles)} kolmiota. Avaa LOD-versiot.`}
      onClick={onOpen}
    >
      <Triangle size={13} />
      <span>{triangleCount(stats.visible.triangles)} kolmiota</span>
      {!!selected.length && (
        <span className="mesh-selection-count">
          · valinta {triangleCount(stats.selection.triangles)}
        </span>
      )}
    </button>
  );
}
