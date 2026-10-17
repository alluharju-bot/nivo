import { simplifyExportMesh, type LodMesh } from './lod';
self.onmessage = async (event: MessageEvent<{ mesh: LodMesh; ratio: number; error: number }>) => {
  try {
    self.postMessage({
      mesh: await simplifyExportMesh(event.data.mesh, event.data.ratio, event.data.error),
    });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
