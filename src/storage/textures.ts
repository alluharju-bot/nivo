import type { Appearance, TextureAsset } from '../model/materials';

export async function importTexture(
  file: File,
  dataMap = false,
): Promise<{ id: string; asset: TextureAsset }> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Valitse PNG-, JPEG- tai WebP-kuva.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Kuvan enimmäiskoko on 20 Mt.');
  const bitmap = await createImageBitmap(
    file,
    dataMap ? { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } : undefined,
  );
  try {
    const scale = Math.min(1, (dataMap ? 1024 : 2048) / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = dataMap ? canvas.toDataURL('image/png') : canvas.toDataURL('image/webp', 0.9),
      digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl));
    const id = Array.from(new Uint8Array(digest))
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
    return {
      id,
      asset: { name: file.name.slice(0, 200), dataUrl, width: canvas.width, height: canvas.height },
    };
  } finally {
    bitmap.close();
  }
}

/** A new color image keeps its native aspect unless the user explicitly unlocked it. */
export function withColorTexture(appearance: Appearance, id: string, asset: TextureAsset) {
  return {
    ...appearance,
    assetId: id,
    texture: {
      ...appearance.texture,
      height: appearance.texture.lockAspect
        ? Math.max(0.1, Math.min(100000, (appearance.texture.width * asset.height) / asset.width))
        : appearance.texture.height,
    },
  };
}
