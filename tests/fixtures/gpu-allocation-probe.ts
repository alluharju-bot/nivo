/** Test-only accounting of texture/depth allocations used by Three.
 * Reports allocated bytes, not physical VRAM residency or total process memory. */
export function installGpuAllocationProbe() {
  const sizes = new WeakMap<object, number>();
  const stats = new WeakMap<WebGL2RenderingContext, { bytes: number; peak: number }>();
  const record = (gl: WebGL2RenderingContext, object: object | null, bytes: number) => {
    if (!object) return;
    const data = stats.get(gl) ?? { bytes: 0, peak: 0 };
    data.bytes += bytes - (sizes.get(object) ?? 0);
    data.peak = Math.max(data.peak, data.bytes);
    sizes.set(object, bytes);
    stats.set(gl, data);
  };
  const bytesPerPixel = (format: number) =>
    ({
      34836: 16,
      34842: 8,
      32856: 4,
      35907: 4,
      33328: 8,
      33327: 4,
      33326: 4,
      33325: 2,
      33323: 2,
      33321: 1,
      33190: 4,
      33189: 2,
      36012: 4,
      35056: 4,
    })[format] ?? 4;
  const binding = (gl: WebGL2RenderingContext, target: number) =>
    gl.getParameter(
      target === gl.TEXTURE_2D
        ? gl.TEXTURE_BINDING_2D
        : target === gl.TEXTURE_2D_ARRAY
          ? gl.TEXTURE_BINDING_2D_ARRAY
          : target === gl.TEXTURE_3D
            ? gl.TEXTURE_BINDING_3D
            : gl.TEXTURE_BINDING_CUBE_MAP,
    ) as WebGLTexture | null;
  const proto = WebGL2RenderingContext.prototype;
  const image2D = proto.texImage2D;
  const mipBytes = new WeakMap<object, Map<number, number>>();
  proto.texImage2D = function (...args: unknown[]) {
    const target = Number(args[0]),
      level = Number(args[1]),
      format = Number(args[2]);
    const image = args[5] as { width?: number; height?: number } | null;
    const w = args.length >= 9 ? Number(args[3]) : (image?.width ?? 0);
    const h = args.length >= 9 ? Number(args[4]) : (image?.height ?? 0);
    const texture = binding(this, target);
    if (texture && w && h) {
      const mips = mipBytes.get(texture) ?? new Map<number, number>();
      mips.set(target * 100 + level, w * h * bytesPerPixel(format));
      mipBytes.set(texture, mips);
      record(
        this,
        texture,
        [...mips.values()].reduce((a, b) => a + b, 0),
      );
    }
    return (image2D as (...values: unknown[]) => void).apply(this, args);
  };
  const storage2D = proto.texStorage2D,
    storage3D = proto.texStorage3D,
    deleteTexture = proto.deleteTexture;
  proto.texStorage2D = function (target, levels, format, w, h) {
    let bytes = 0;
    for (let i = 0; i < levels; i++)
      bytes += Math.max(1, w >> i) * Math.max(1, h >> i) * bytesPerPixel(format);
    record(this, binding(this, target), bytes * (target === this.TEXTURE_CUBE_MAP ? 6 : 1));
    return storage2D.call(this, target, levels, format, w, h);
  };
  proto.texStorage3D = function (target, levels, format, w, h, d) {
    let bytes = 0;
    for (let i = 0; i < levels; i++)
      bytes +=
        Math.max(1, w >> i) *
        Math.max(1, h >> i) *
        (target === this.TEXTURE_3D ? Math.max(1, d >> i) : d) *
        bytesPerPixel(format);
    record(this, binding(this, target), bytes);
    return storage3D.call(this, target, levels, format, w, h, d);
  };
  proto.deleteTexture = function (texture) {
    record(this, texture, 0);
    return deleteTexture.call(this, texture);
  };
  const storageR = proto.renderbufferStorage,
    storageMS = proto.renderbufferStorageMultisample,
    deleteR = proto.deleteRenderbuffer;
  proto.renderbufferStorage = function (target, format, w, h) {
    record(this, this.getParameter(this.RENDERBUFFER_BINDING), w * h * bytesPerPixel(format));
    return storageR.call(this, target, format, w, h);
  };
  proto.renderbufferStorageMultisample = function (target, samples, format, w, h) {
    record(
      this,
      this.getParameter(this.RENDERBUFFER_BINDING),
      Math.max(1, samples) * w * h * bytesPerPixel(format),
    );
    return storageMS.call(this, target, samples, format, w, h);
  };
  proto.deleteRenderbuffer = function (buffer) {
    record(this, buffer, 0);
    return deleteR.call(this, buffer);
  };
  (
    window as unknown as { renderGpuAllocations: () => { bytes: number; peak: number } }
  ).renderGpuAllocations = () => {
    const canvas = document.querySelector('[data-testid="render-canvas"]') as HTMLCanvasElement;
    return stats.get(canvas.getContext('webgl2')!) ?? { bytes: 0, peak: 0 };
  };
}
