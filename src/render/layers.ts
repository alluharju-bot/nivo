import * as THREE from 'three';
import { appearancePreset, type Appearance, type TexturePlacement } from '../model/materials';
import type { SampleTexture } from '../surface/bake';
import type { LayerDomain, LayerInput, LayerPixels } from './layerPixels';
export type { LayerDomain } from './layerPixels';
export const wearMapUrl = (kind: 'scratches' | 'fingerprints', channel: 'mask' | 'normal') =>
  `${import.meta.env.BASE_URL}materials/wear/${kind}-${channel}.jpg`;

export function layerDomain(
  geometry: THREE.BufferGeometry,
  start = 0,
  count = geometry.index?.count ?? 0,
): LayerDomain {
  const uv = geometry.getAttribute('uv'),
    index = geometry.index!;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = start; i < start + count; i++) {
    const n = index.getX(i),
      x = uv.getX(n),
      y = uv.getY(n);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0.1, maxX - minX),
    height: Math.max(0.1, maxY - minY),
  };
}
function snapshot(texture: THREE.Texture | null): SampleTexture | undefined {
  if (!texture) return;
  const image = texture.image as HTMLImageElement | HTMLCanvasElement;
  const w = ('naturalWidth' in image ? image.naturalWidth : image.width) || 1;
  const h = ('naturalHeight' in image ? image.naturalHeight : image.height) || 1;
  const ratio = Math.min(1, 2048 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  texture.updateMatrix();
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    matrix: texture.matrix.toArray(),
    flipY: texture.flipY,
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
    srgb: texture.colorSpace === THREE.SRGBColorSpace,
  };
}
export const layerColorUpdates = new WeakMap<THREE.Texture, (color: THREE.Color) => void>();
export const layerPlacementUpdates = new WeakMap<
  THREE.Texture,
  (placement: TexturePlacement) => void
>();
type Cached = {
  sources: Record<keyof LayerPixels, THREE.Source<HTMLCanvasElement>>;
  done: Promise<void>;
  bytes: number;
};

/** Small shared result cache and a single worker per material library. No map rebuilding during orbit. */
export function createLayerComposer(
  draw: () => void,
  place: (map: THREE.Texture, p: TexturePlacement) => void,
) {
  const cache = new Map<string, Cached>();
  const cleanup = new Set<() => void>();
  const waiters = new Map<
    number,
    { resolve: (p: LayerPixels) => void; reject: (e: Error) => void }
  >();
  const pending = new Set<Promise<unknown>>();
  const previews = new Set<ReturnType<typeof setTimeout>>();
  let worker: Worker | undefined,
    serial = 0,
    disposed = false;
  const run = (input: LayerInput) =>
    new Promise<LayerPixels>((resolve, reject) => {
      if (disposed) {
        reject(new Error('Pintakerrosten laskenta suljettiin.'));
        return;
      }
      if (!worker) {
        worker = new Worker(new URL('./layers.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (
          event: MessageEvent<{ id: number; pixels: LayerPixels; error?: string }>,
        ) => {
          const task = waiters.get(event.data.id);
          waiters.delete(event.data.id);
          if (event.data.error) task?.reject(new Error(event.data.error));
          else task?.resolve(event.data.pixels);
        };
        worker.onerror = () => {
          for (const task of waiters.values())
            task.reject(new Error('Pintakerrosten laskenta epäonnistui.'));
          waiters.clear();
        };
      }
      const id = ++serial;
      waiters.set(id, { resolve, reject });
      worker.postMessage({ id, input });
    });
  const track = (p: Promise<unknown>) => {
    pending.add(p);
    void p.finally(() => pending.delete(p)).catch(() => {});
  };
  const canvas = (rgb: number[]) => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = `rgb(${rgb.join(',')})`;
    ctx.fillRect(0, 0, 1, 1);
    return c;
  };
  return {
    apply(
      material: THREE.MeshPhysicalMaterial,
      appearance: Appearance,
      domain: LayerDomain | undefined,
      masks: Partial<
        Record<'scratches' | 'fingerprints', { mask: THREE.Texture; normal: THREE.Texture }>
      >,
      baseReady: Promise<unknown>,
      onTint: (color: THREE.Color) => void,
    ) {
      const active = appearance.layers?.filter((l) => l.enabled && l.amount > 0);
      if (!active?.length) return;
      const region = domain ?? {
        x: 0,
        y: 0,
        width: appearance.texture.width,
        height: appearance.texture.height,
      };
      const base = {
        color: material.map,
        normal: material.normalMap,
        roughness: material.roughnessMap,
        metalness: material.metalnessMap,
      };
      const original = {
        color: material.color.toArray(),
        roughness: material.roughness,
        metalness: material.metalness,
        clearcoat: material.clearcoat,
        transmission: material.transmission,
        normalScale: material.normalScale.toArray(),
      };
      const requested = new THREE.Color().fromArray(original.color);
      const resolution = Math.max(
        appearance.assetId || appearancePreset(appearance).pbr ? 2048 : 1024,
        ...Object.values(base).map((map) =>
          Math.min(
            2048,
            Number(
              (map?.image as HTMLImageElement)?.naturalWidth ||
                (map?.image as HTMLCanvasElement)?.width ||
                0,
            ),
          ),
        ),
      );
      const width = Math.max(
        64,
        Math.round(resolution * Math.min(1, region.width / region.height)),
      );
      const height = Math.max(
        64,
        Math.round(resolution * Math.min(1, region.height / region.width)),
      );
      // Source maps remain alive until the asynchronous bake has read them.
      const owned = [
        ...Object.values(base),
        ...Object.values(masks).flatMap((m) => [m.mask, m.normal]),
      ].filter((m): m is THREE.Texture => !!m);
      const textures = {} as Record<keyof LayerPixels, THREE.Texture>;
      const p: TexturePlacement = {
        width: region.width,
        height: region.height,
        offsetX: region.x,
        offsetY: region.y,
        rotation: 0,
        lockAspect: false,
      };
      const key = () =>
        JSON.stringify([
          appearance,
          requested.toArray(),
          region,
          Object.values(base).map((m) => m?.userData.imageIdentity ?? m?.source.uuid),
        ]);
      const build = () => {
        const k = key();
        let entry = cache.get(k);
        if (!entry) {
          const sources = Object.fromEntries(
            ['color', 'normal', 'surface'].map((name) => [
              name,
              new THREE.Source(
                canvas(
                  name === 'normal'
                    ? [128, 128, 255]
                    : name === 'color'
                      ? requested
                          .clone()
                          .convertLinearToSRGB()
                          .toArray()
                          .map((n) => n * 255)
                      : [255, 255, 255],
                ),
              ),
            ]),
          ) as Cached['sources'];
          entry = { sources, bytes: width * height * 12, done: Promise.resolve() };
          cache.set(k, entry);
          const target = entry;
          const tint = requested.toArray();
          entry.done = baseReady.then(async () => {
            if (disposed) return;
            const pixels = await run({
              domain: region,
              width,
              height,
              layers: active,
              ...original,
              color: tint,
              maps: Object.fromEntries(
                Object.entries(base).map(([name, map]) => [name, snapshot(map)]),
              ),
              masks: Object.fromEntries(
                Object.entries(masks).map(([name, m]) => [
                  name,
                  { mask: snapshot(m.mask), normal: snapshot(m.normal) },
                ]),
              ),
            });
            if (disposed) return;
            for (const name of Object.keys(pixels) as (keyof LayerPixels)[]) {
              const c = document.createElement('canvas');
              c.width = width;
              c.height = height;
              c.getContext('2d')!.putImageData(
                new ImageData(new Uint8ClampedArray(pixels[name]), width, height),
                0,
                0,
              );
              target.sources[name].data = c;
            }
            // Bound retained CPU cache; maps still displayed remain owned by their materials.
            let bytes = [...cache.values()].reduce((sum, v) => sum + v.bytes, 0);
            for (const [oldKey, old] of cache)
              if (bytes > 48 * 1024 * 1024 && oldKey !== k) {
                cache.delete(oldKey);
                bytes -= old.bytes;
              }
          });
          track(entry.done);
        }
        return entry;
      };
      const initial = build();
      for (const name of Object.keys(initial.sources) as (keyof LayerPixels)[]) {
        const map = new THREE.Texture(initial.sources[name].data);
        map.source = initial.sources[name];
        map.needsUpdate = true;
        map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
        map.colorSpace = name === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        map.anisotropy = 8;
        place(map, p);
        map.userData.independentPlacement = p;
        textures[name] = map;
      }
      let revision = 0,
        dead = false;
      const update = (entry: Cached) => {
        const version = ++revision;
        const promise = entry.done.then(() => {
          if (disposed || dead || version !== revision) return;
          for (const name of Object.keys(textures) as (keyof LayerPixels)[]) {
            const map = textures[name];
            map.dispose();
            map.source = entry.sources[name];
            map.needsUpdate = true;
          }
          draw();
        });
        track(promise);
        void promise.catch(() => {});
      };
      update(initial);
      material.map = textures.color;
      material.normalMap = textures.normal;
      material.roughnessMap = textures.surface;
      material.metalnessMap = textures.surface;
      material.clearcoatMap = textures.surface;
      material.transmissionMap = textures.surface;
      material.clearcoatRoughnessMap = textures.surface;
      material.clearcoatRoughness = 1;
      material.color.set(0xffffff);
      material.roughness = material.metalness = 1;
      material.normalScale.set(1, 1);
      material.userData.layerColor = true;
      delete material.userData.physicalSurface;
      // Cloned materials share the textures; their color preview follows this same controller.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const refresh = () => {
        if (timer) {
          clearTimeout(timer);
          previews.delete(timer);
        }
        timer = setTimeout(() => {
          previews.delete(timer!);
          if (!dead && !disposed) update(build());
        }, 100);
        previews.add(timer);
      };
      layerColorUpdates.set(textures.color, (color) => {
        if (requested.equals(color)) return;
        requested.copy(color);
        onTint(color);
        refresh();
      });
      layerPlacementUpdates.set(textures.color, (placement) => {
        if (JSON.stringify(placement) === JSON.stringify(appearance.texture)) return;
        for (const map of Object.values(base))
          if (map)
            place(
              map,
              map.userData.independentPlacement ??
                (map.userData.fixedRepeat
                  ? {
                      ...placement,
                      width: map.userData.fixedRepeat,
                      height: map.userData.fixedRepeat,
                    }
                  : placement),
            );
        // Include the preview transform in the cache key without changing persisted appearance.
        appearance = { ...appearance, texture: placement };
        refresh();
      });
      // Material.dispose is also used after cloning; texture disposal alone is not a reliable lifetime signal.
      // All detached base maps are released when the library ends, after pending work has settled.
      cleanup.add(() => {
        dead = true;
        if (timer) clearTimeout(timer);
        owned.forEach((t) => t.dispose());
      });
    },
    async ready() {
      while (pending.size) await Promise.all([...pending]);
      await Promise.all([...cache.values()].map((entry) => entry.done));
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      for (const task of waiters.values())
        task.reject(new Error('Pintakerrosten laskenta suljettiin.'));
      waiters.clear();
      previews.forEach(clearTimeout);
      previews.clear();
      cleanup.forEach((fn) => fn());
      cleanup.clear();
      cache.clear();
    },
  };
  // Hoisted closure storage is initialized before apply is ever called.
}
