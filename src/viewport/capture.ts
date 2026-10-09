/** Capture the drawing buffer immediately after rendering, before WebGL clears it.
 * Only persistent dimensions are composed over it; application chrome never enters the image. */
export async function captureModelView(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  render: () => void,
) {
  if (!canvas.width || !canvas.height || !host.clientWidth || !host.clientHeight)
    throw new Error('Mallinnusnäkymä ei ole vielä valmis kuvattavaksi.');
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Kuvan tallentaminen ei onnistu tässä selaimessa.');
  render();
  ctx.drawImage(canvas, 0, 0);
  const scaleX = output.width / host.clientWidth,
    scaleY = output.height / host.clientHeight;
  const hostRect = host.getBoundingClientRect();
  ctx.scale(scaleX, scaleY);
  for (const label of host.querySelectorAll<HTMLElement>('.guide-label')) {
    const style = getComputedStyle(label);
    if (label.hidden || style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = label.getBoundingClientRect();
    ctx.fillStyle = style.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(rect.x - hostRect.x, rect.y - hostRect.y, rect.width, rect.height, 4);
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
    copy.setAttribute('width', String(host.clientWidth));
    copy.setAttribute('height', String(host.clientHeight));
    return new XMLSerializer().serializeToString(copy);
  });
  for (const svg of overlays) {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    ctx.drawImage(image, 0, 0);
  }
  return new Promise<Blob>((resolve, reject) =>
    output.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG-kuvan tallentaminen epäonnistui.'))),
      'image/png',
    ),
  );
}
