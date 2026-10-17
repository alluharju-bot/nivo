import { unwrapMesh } from './unwrap';
import { bakeSurface, type BakeOptions, type BakeSource } from './bake';
import { simplifyMesh, type SurfaceMesh } from './mesh';
import { validateSurface } from './validation';
export type SurfaceJob =
  | { kind: 'unwrap'; mesh: SurfaceMesh; source: BakeSource; options: BakeOptions }
  | { kind: 'bake'; mesh: SurfaceMesh; source: BakeSource; options: BakeOptions }
  | { kind: 'simplify'; mesh: SurfaceMesh; keep: number }
  | { kind: 'validate'; mesh: SurfaceMesh; previous?: SurfaceMesh };
self.onmessage = async (event: MessageEvent<SurfaceJob>) => {
  try {
    const job = event.data;
    if (job.kind === 'validate') {
      const health = validateSurface(job.mesh, job.previous);
      self.postMessage({ result: { mesh: job.mesh, health } });
      return;
    }
    if (job.kind === 'simplify') {
      self.postMessage({ result: { mesh: await simplifyMesh(job.mesh, job.keep) } });
      return;
    }
    self.postMessage({
      progress: 0,
      label: job.kind === 'unwrap' ? 'Avataan UV-karttaa…' : 'Lasketaan pintakarttoja…',
    });
    const mesh = job.kind === 'unwrap' ? await unwrapMesh(job.mesh) : job.mesh;
    const result = bakeSurface(
      mesh,
      job.source,
      { ...job.options, correspondence: job.kind === 'unwrap' },
      (value) => self.postMessage({ progress: value, label: 'Lasketaan pintakarttoja…' }),
    );
    self.postMessage({ result: { mesh, ...result } });
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
