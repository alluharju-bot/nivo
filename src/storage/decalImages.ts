import { importTexture } from './textures';

/** SVG imports accept self-contained vector shapes only, never external resources or scripts. */
export async function importDecalImage(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Kuvan enimmäiskoko on 20 Mt.');
  if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml')
    return importTexture(file, false, true);
  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg')
    throw new Error('SVG-tiedosto ei ole kelvollinen.');
  const tags = new Set([
    'svg',
    'g',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
  ]);
  const attrs = new Set([
    'xmlns',
    'viewBox',
    'width',
    'height',
    'd',
    'x',
    'y',
    'x1',
    'x2',
    'y1',
    'y2',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'points',
    'fill',
    'fill-rule',
    'fill-opacity',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-linecap',
    'stroke-linejoin',
    'opacity',
    'transform',
  ]);
  for (const node of [...doc.querySelectorAll('*')]) {
    if (!tags.has(node.localName)) {
      node.remove();
      continue;
    }
    for (const a of [...node.attributes])
      if (
        !attrs.has(a.name) ||
        (/url\s*\(|javascript:|https?:/i.test(a.value) && a.name !== 'xmlns')
      )
        node.removeAttribute(a.name);
  }
  if (!doc.querySelector('path,rect,circle,ellipse,line,polyline,polygon'))
    throw new Error(
      'SVG-kuvassa ei ole tuettuja vektorimuotoja. Muunna teksti poluiksi tai tuo PNG-kuvana.',
    );
  const root = doc.documentElement;
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const box = root.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  const w = box?.[2] || parseFloat(root.getAttribute('width') || '') || 512;
  const h = box?.[3] || parseFloat(root.getAttribute('height') || '') || 512;
  if (!(w > 0 && h > 0 && Number.isFinite(w + h))) throw new Error('SVG-kuvan koko ei kelpaa.');
  root.setAttribute('width', String(Math.max(1, Math.round(2048 * Math.min(1, w / h)))));
  root.setAttribute('height', String(Math.max(1, Math.round(2048 * Math.min(1, h / w)))));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }),
  );
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      c.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('SVG-kuvaa ei voitu lukea.'))),
        'image/png',
      ),
    );
    return importTexture(new File([blob], file.name + '.png', { type: 'image/png' }), false, true);
  } finally {
    URL.revokeObjectURL(url);
  }
}
