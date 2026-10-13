import { it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createLocateHighlight } from './locateHighlight';
it('locates through occluders for five seconds, reuses geometry and restarts without leaking', () => {
  vi.useFakeTimers();
  try {
    const scene = new THREE.Scene(),
      canvas = { dataset: {} } as HTMLCanvasElement;
    const geometry = new THREE.BoxGeometry(10, 20, 30),
      edges = new THREE.EdgesGeometry(geometry);
    const mesh = new THREE.Mesh(geometry),
      outline = new THREE.LineSegments(edges);
    mesh.position.set(11, 22, 33);
    outline.position.copy(mesh.position);
    const dispose = vi.spyOn(geometry, 'dispose');
    const locate = createLocateHighlight(scene, canvas, vi.fn());
    locate.show([{ id: 'part', mesh, outline }]);
    const overlay = locate.group.children[0] as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >;
    expect(overlay.geometry).toBe(geometry);
    expect(overlay.material.depthTest).toBe(false);
    expect(overlay.material.depthWrite).toBe(false);
    expect(overlay.matrix.elements.slice(12, 15)).toEqual([11, 22, 33]);
    vi.advanceTimersByTime(4000);
    expect(locate.group.children).toHaveLength(2);
    const freed = vi.spyOn(overlay.material, 'dispose');
    locate.show([{ id: 'part', mesh, outline }]);
    expect(freed).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(4999);
    expect(canvas.dataset.locatedIds).toBe('["part"]');
    vi.advanceTimersByTime(1);
    expect(canvas.dataset.locatedIds).toBe('[]');
    expect(locate.group.children).toHaveLength(0);
    expect(dispose).not.toHaveBeenCalled();
    locate.dispose();
    expect(scene.children).toHaveLength(0);
    geometry.dispose();
    edges.dispose();
  } finally {
    vi.useRealTimers();
  }
});
