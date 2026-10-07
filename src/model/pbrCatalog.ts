/** Offline CC0 assets. Provenance and original checksums: public/materials/sources.json. */
export const pbrSurfaces = [
  { source: 'coated_pine', name: 'Mänty · lakattu', size: 740, relief: 0.2 },
  { source: 'oak_veneer_01', name: 'Tammi · viilu', size: 1830, relief: 0.2 },
  { source: 'american_walnut_veneer', name: 'Pähkinä · harmaa viilu', size: 1000, relief: 0.2 },
  { source: 'white_plaster_02', name: 'Kipsipinta · sileä', size: 1000, relief: 0.3 },
  { source: 'white_stucco', name: 'Rappaus · karkea', size: 1998, relief: 1.2 },
  { source: 'concrete_wall_009', name: 'Betoni · raaka', size: 1805, relief: 1 },
  { source: 'smooth_concrete_floor', name: 'Betoni · liipattu', size: 2000, relief: 0.3 },
  { source: 'marble_01', name: 'Marmorilaatta · vaalea', size: 1500, relief: 0.1 },
  { source: 'long_white_tiles', name: 'Seinälaatta · valkoinen', size: 1270, relief: 1 },
] as const;

export function pbrMapUrl(source: string, channel: 'color' | 'normal' | 'roughness' | 'height') {
  return `${import.meta.env.BASE_URL}materials/${source}/${channel}.jpg`;
}
