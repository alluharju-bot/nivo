export type CaptureFormat = 'screen' | 'a3-landscape' | 'a3-portrait';

export function a3Layout(width: number, height: number, portrait: boolean) {
  const pageWidth = portrait ? 3508 : 4961;
  const pageHeight = portrait ? 4961 : 3508;
  const scale = Math.min(pageWidth / width, pageHeight / height);
  const imageWidth = Math.max(1, Math.round(width * scale));
  const imageHeight = Math.max(1, Math.round(height * scale));
  return {
    pageWidth,
    pageHeight,
    imageWidth,
    imageHeight,
    x: Math.floor((pageWidth - imageWidth) / 2),
    y: Math.floor((pageHeight - imageHeight) / 2),
  };
}

// Canvas encoders may write 96 dpi. Replace the PNG pHYs chunk before IDAT so
// print software also receives the sheet size, independently of the pixel count.
async function setPrintDensity(png: Blob) {
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, 11811); // 300 pixels/inch in pixels/metre
  view.setUint32(12, 11811);
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(17, ~crc);
  // The signature and IHDR occupy the first 33 bytes of every PNG.
  const parts: BlobPart[] = [png.slice(0, 33), chunk];
  let start = 33;
  for (let offset = start; offset + 12 <= png.size;) {
    const header = new DataView(await png.slice(offset, offset + 8).arrayBuffer());
    const type = header.getUint32(4);
    if (type === 0x49444154) {
      // IDAT
      parts.push(png.slice(start));
      return new Blob(parts, { type: 'image/png' });
    }
    const end = offset + header.getUint32(0) + 12;
    if (type === 0x70485973) {
      parts.push(png.slice(start, offset));
      start = end;
    }
    offset = end;
  }
  throw new Error('PNG-kuvan tulostustietojen kirjoittaminen epäonnistui.');
}

/** Increase export detail without increasing the cost of the interactive viewport.
 * Bound the extra allocation, but never reduce an already larger drawing buffer. */
export function modelCaptureScale(width: number, height: number, maxDimension = 4096) {
  if (width <= 0 || height <= 0) return 1;
  return Math.max(
    1,
    Math.min(2, maxDimension / Math.max(width, height), Math.sqrt(8_000_000 / (width * height))),
  );
}

/** Capture the drawing buffer immediately after rendering, before WebGL clears it.
 * Only persistent dimensions are composed over it; application chrome never enters the image. */
export async function captureModelView(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  format: CaptureFormat,
) {
  if (!canvas.width || !canvas.height || !host.clientWidth || !host.clientHeight)
    throw new Error('Mallinnusnäkymä ei ole vielä valmis kuvattavaksi.');
  const viewWidth = host.clientWidth,
    viewHeight = host.clientHeight;
  const output = document.createElement('canvas');
  const page =
    format === 'screen' ? undefined : a3Layout(viewWidth, viewHeight, format === 'a3-portrait');
  output.width = page?.pageWidth ?? canvas.width;
  output.height = page?.pageHeight ?? canvas.height;
  const width = page?.imageWidth ?? output.width;
  const height = page?.imageHeight ?? output.height;
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Kuvan tallentaminen ei onnistu tässä selaimessa.');
  if (page) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.translate(page.x, page.y);
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
  }
  draw(ctx, width, height);
  const scaleX = width / viewWidth,
    scaleY = height / viewHeight;
  const hostRect = host.getBoundingClientRect();
  ctx.scale(scaleX, scaleY);
  for (const label of host.querySelectorAll<HTMLElement>('.guide-label')) {
    const style = getComputedStyle(label);
    if (label.hidden || style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = label.getBoundingClientRect();
    ctx.fillStyle = style.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(
      rect.x - hostRect.x,
      rect.y - hostRect.y,
      rect.width,
      rect.height,
      Math.min(parseFloat(style.borderTopLeftRadius) || 0, rect.height / 2, rect.width / 2),
    );
    ctx.fill();
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      label.textContent ?? '',
      rect.x - hostRect.x + rect.width / 2,
      rect.y - hostRect.y + rect.height / 2,
    );
  }
  // Freeze SVG geometry and computed styles before awaiting image decoding.
  const overlays = [
    ...host.querySelectorAll<SVGSVGElement>('.model-dimensions, .point-dimensions, .model-markups'),
  ].map((svg) => {
    const copy = svg.cloneNode(true) as SVGSVGElement;
    const sources = [svg, ...svg.querySelectorAll('*')];
    const targets = [copy, ...copy.querySelectorAll('*')];
    sources.forEach((node, i) => {
      const style = getComputedStyle(node);
      for (const property of [
        'display',
        'visibility',
        'opacity',
        'fill',
        'fill-opacity',
        'stroke',
        'stroke-width',
        'stroke-opacity',
        'stroke-dasharray',
        'stroke-linecap',
        'stroke-linejoin',
        'font-family',
        'font-size',
        'font-weight',
        'text-anchor',
        'dominant-baseline',
        'paint-order',
      ])
        (targets[i] as SVGElement).style.setProperty(property, style.getPropertyValue(property));
    });
    if (!copy.hasAttribute('viewBox'))
      copy.setAttribute('viewBox', `0 0 ${viewWidth} ${viewHeight}`);
    copy.setAttribute('width', String(width));
    copy.setAttribute('height', String(height));
    return new XMLSerializer().serializeToString(copy);
  });
  for (const svg of overlays) {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    ctx.drawImage(image, 0, 0, viewWidth, viewHeight);
  }
  const png = await new Promise<Blob>((resolve, reject) =>
    output.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG-kuvan tallentaminen epäonnistui.'))),
      'image/png',
    ),
  );
  return page ? setPrintDensity(png) : png;
}
