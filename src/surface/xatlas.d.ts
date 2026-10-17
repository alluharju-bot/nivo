declare module 'xatlas-web' {
  export interface XAtlasModule {
    ready: Promise<XAtlasModule>;
    HEAPU16: Uint16Array;
    HEAPU32: Uint32Array;
    HEAPF32: Float32Array;
    createAtlas(): void;
    destroyAtlas(): void;
    createMesh(
      vertices: number,
      indices: number,
      normals: boolean,
      uv: boolean,
    ): {
      meshId: number;
      indexOffset: number;
      positionOffset: number;
      normalOffset: number;
      uvOffset: number;
    };
    addMesh(): number;
    generateAtlas(): void;
    getMeshData(id: number): {
      newVertexCount: number;
      newIndexCount: number;
      uvOffset: number;
      indexOffset: number;
      originalIndexOffset: number;
    };
  }
  export default function create(options: { locateFile: (path: string) => string }): XAtlasModule;
}
