export const surfaceCollectionName = 'Pintakokoelma';
export const surfaceGroups = [
  'Puut',
  'Kivet ja laatat',
  'Seinäpinnat',
  'Tekstiilit ja nahka',
  'Maalit',
] as const;
export type SurfaceGroup = (typeof surfaceGroups)[number];

/** Nivo's own interior colour palette, not manufacturer or colour-system matches. */
export const collectionPaints = [
  { id: 'chalk', name: 'Liitu', color: '#f1eee5' },
  { id: 'linen', name: 'Pellava', color: '#d9cfbd' },
  { id: 'sand', name: 'Hiekka', color: '#c8b397' },
  { id: 'greige', name: 'Harmaabeige', color: '#b5aca0' },
  { id: 'clay', name: 'Savi', color: '#a88872' },
  { id: 'terracotta', name: 'Terrakotta', color: '#b77559' },
  { id: 'rose', name: 'Puuteriroosa', color: '#c5a39b' },
  { id: 'sage', name: 'Salvia', color: '#9ca58f' },
  { id: 'olive', name: 'Oliivi', color: '#73785e' },
  { id: 'mist', name: 'Usvansininen', color: '#99aab1' },
  { id: 'ink', name: 'Mustesininen', color: '#424f59' },
  { id: 'charcoal', name: 'Hiili', color: '#42413e' },
] as const;
