// Import selected public Poly Haven assets for the offline material library.
// Usage: node scripts/import-pbr.mjs ash_veneer white_maple_veneer
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../public/materials/', import.meta.url);
const ids = [...new Set(process.argv.slice(2))];
if (!ids.length || ids.some((id) => !/^[a-z0-9_]+$/.test(id)))
  throw new Error('Provide Poly Haven asset IDs.');
async function get(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Nivo-material-import/1.0 (offline CC0 bundle)' },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}
const assets = await (await get('https://api.polyhaven.com/assets?type=textures')).json();
const manifest = JSON.parse(await readFile(new URL('sources.json', root), 'utf8'));
for (const id of ids) {
  const asset = assets[id];
  if (!asset || asset.type !== 1 || !asset.dimensions?.every((n) => n > 0))
    throw new Error(`Unknown texture or missing physical size: ${id}`);
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  const maps = await Promise.all(
    Object.entries({
      color: ['Diffuse', 'diff'],
      normal: ['nor_gl'],
      roughness: ['Rough', 'rough'],
      height: ['Displacement', 'disp'],
    }).map(async ([channel, keys]) => {
      const key = keys.find((key) => files[key]);
      const map = files[key]?.['1k']?.jpg;
      if (!map?.url || !map.md5) throw new Error(`Missing 1K ${channel}: ${id}`);
      const data = Buffer.from(await (await get(map.url)).arrayBuffer());
      if (createHash('md5').update(data).digest('hex') !== map.md5)
        throw new Error(`Checksum mismatch: ${id}/${channel}`);
      return { channel, data, url: map.url, md5: map.md5 };
    }),
  );
  await mkdir(new URL(`${id}/`, root), { recursive: true });
  const entry = {
    id,
    name: asset.name,
    authors: asset.authors ?? {},
    sizeMm: asset.dimensions.map(Math.round),
    source: `https://polyhaven.com/a/${id}`,
    license: 'CC0-1.0',
    retrieved: new Date().toISOString().slice(0, 10),
    maps: {},
  };
  for (const map of maps) {
    const file = `${id}/${map.channel}.jpg`;
    await writeFile(new URL(file, root), map.data);
    entry.maps[map.channel] = { url: map.url, file, md5: map.md5, bytes: map.data.length };
  }
  const index = manifest.findIndex((entry) => entry.id === id);
  if (index < 0) manifest.push(entry);
  else manifest[index] = entry;
  await writeFile(new URL('sources.json', root), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${id}: ${maps.reduce((sum, map) => sum + map.data.length, 0)} bytes verified`);
}
