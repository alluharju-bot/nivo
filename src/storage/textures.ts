import type { TextureAsset } from '../model/materials';

export async function importTexture(file: File): Promise<{ id: string; asset: TextureAsset }> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Valitse PNG-, JPEG- tai WebP-kuva.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Kuvan enimmäiskoko on 20 Mt.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/webp', 0.9),
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
