/** Curated source index. No manufacturer models, logos or photographs are redistributed.
 * Installation profiles below are Nivo primitives built from published dimensions.
 * Source region describes the documentation, not confirmed local stock availability.
 */
export const catalogCheckedAt = '2026-10-14';
export const productCategories = {
  power: 'Pistorasiat ja lataus',
  lighting: 'Kalustevalaistus',
  hardware: 'Helat ja mekanismit',
  taps: 'Hanat ja suihkut',
  sanitary: 'WC ja saniteetti',
} as const;
export type ProductCategory = keyof typeof productCategories;
export type ProductVariant = { name: string; article: string };
export type InstallationProfile =
  { kind: 'circle'; diameter: number } | { kind: 'rectangle'; width: number; depth: number };
export type CatalogProduct = {
  key: string;
  brand: string;
  name: string;
  category: ProductCategory;
  summary: string;
  source: string;
  region: 'FI' | 'EU' | 'UK' | 'Kansainvälinen';
  cad?: { url: string; label: string };
  variants?: ProductVariant[];
  specs?: [string, string][];
  installation?: { profile: InstallationProfile; depth?: number; note: string };
};

const savo = (slug: string) => `https://savo.fi/tuote/${slug}/`;
const blumCad = 'https://www.blum.com/in/en/services/index.html';
const blumWorld = 'https://www.blum.com/us/en/products/product-world-of-blum/';
const grassCad = 'https://www.grass.eu/fr/tec-center/donnees-cad/';
const hettichCad = 'https://www.hettich.com/en-dk/services/hettich-cad';
const hettichProducts = 'https://www.hettich.com/en-de/services/hettich-cad/cad-data-packages';
const hafeleFree = {
  'free-space':
    'https://archiup.com/en/product/worktops/hafele-polska-sp-z-o-o-hingeless-one-piece-flap-fitting-free-space-1-11-dae-dwg-dxf-skp-stl_39129',
  'free-flap':
    'https://archiup.com/en/product/furniture-accessories-1/hafele-polska-sp-z-o-o-stay-flap-fittings-free-flap_43587',
  'free-up':
    'https://archiup.com/en/product/furniture-accessories-1/hafele-polska-sp-z-o-o-stay-flap-fittings-free-up_43589',
};
const loox = 'https://files.hafele.co.uk/catalogfiles/www/25-1014.pdf';
const geberitBim =
  'https://www.geberit.fi/saniteetti-ja-putkistojarjestelmat/digitaaliset-tyokalut-ja-sovellukset/bim/';
const orasBim = 'https://www.oras.com/fi/service/materiaalipankki';
const hansgroheBim = 'https://pro.hansgrohe.de/beratung/planungsdaten';
const gustavsbergBim = 'https://gustavsbergfrontend.qbank.se/search/3d-object';
const circle = (diameter: number, depth?: number): CatalogProduct['installation'] => ({
  profile: { kind: 'circle', diameter },
  depth,
  note: 'Asennusreiän kokoinen tilavaraus. Kansi, kiinnikkeet ja johtotila eivät sisälly. Tarkista asennusohje ennen työstöä.',
});

export const productCatalog: CatalogProduct[] = [
  {
    key: 'savo-twist',
    brand: 'SAVO / Bachmann',
    name: 'TWIST',
    category: 'power',
    summary: 'Kääntökannellinen, tasoon upotettava kahden pistorasian yksikkö.',
    source: savo('pistorasia-twist'),
    region: 'FI',
    variants: [
      { name: 'RST', article: '79930' },
      { name: 'Mattavalkoinen', article: '79933' },
      { name: 'Mattamusta', article: '79934' },
    ],
    specs: [
      ['Asennusreikä', 'Ø 105 mm'],
      ['Upotussyvyys', '40 mm'],
      ['Tason minimipaksuus', '8 mm'],
    ],
    installation: circle(105, 40),
  },
  {
    key: 'savo-one',
    brand: 'SAVO / EVOline',
    name: 'ONE',
    category: 'power',
    summary: 'Kalusteeseen upotettava yksittäinen pistorasia tai USB-latausyksikkö.',
    source: savo('pistorasia-one'),
    region: 'FI',
    variants: [
      { name: 'Pistorasia', article: '80750' },
      { name: 'USB-A + USB-C', article: '80751' },
    ],
    specs: [
      ['Asennusreikä', 'Ø 54 mm'],
      ['Upotussyvyys', '50 mm'],
      ['Pintahela', 'Ø 59 mm'],
      ['Huullos', 'Ø 59,5 mm'],
    ],
    installation: circle(54, 50),
  },
  {
    key: 'savo-elevator',
    brand: 'SAVO / Bachmann',
    name: 'ELEVATOR',
    category: 'power',
    summary: 'Painamalla avautuva pistorasiatorni tasoon tai yläkaapin pohjaan.',
    source: savo('pistorasia-elevator'),
    region: 'FI',
    variants: [
      { name: 'RST', article: '79940' },
      { name: 'USB-lataus RST', article: '79941' },
    ],
    specs: [
      ['Asennusreikä', 'Ø 80 mm'],
      ['Erillinen peitekotelo', '127 × 127 × 205 mm'],
    ],
    installation: circle(80),
  },
  {
    key: 'savo-nelio',
    brand: 'SAVO',
    name: 'NELIÖ',
    category: 'power',
    summary: 'Liukukannellinen pistorasia ja USB-lataus työtasoon.',
    source: savo('pistorasia-nelio'),
    region: 'FI',
    variants: [
      { name: 'Musta', article: '80770' },
      { name: 'Valkoinen', article: '80775' },
    ],
    specs: [
      ['Asennusreikä', 'Ø 80 mm'],
      ['Upotussyvyys', '68 mm'],
      ['Kansi suljettuna', '107 × 96 mm'],
    ],
    installation: circle(80, 68),
  },
  {
    key: 'savo-voltti',
    brand: 'SAVO',
    name: 'VOLTTI USB-C',
    category: 'power',
    summary: 'Kääntyvä pistorasiayksikkö, kaksi pistorasiaa ja USB-C.',
    source: savo('pistorasia-voltti-usb-c'),
    region: 'FI',
    variants: [
      { name: 'RST', article: '80740' },
      { name: 'Valkoinen', article: '80745' },
      { name: 'Musta', article: '80746' },
      { name: 'Messinki', article: '80747' },
    ],
    specs: [
      ['Asennusaukko', '215 × 88 mm'],
      ['Syvyys', '53 mm'],
      ['Ulkomitta', '226 × 105 mm'],
    ],
    installation: {
      profile: { kind: 'rectangle', width: 215, depth: 88 },
      depth: 53,
      note: 'Suorakulmainen asennustilavaraus ilman kantta ja johtoja. Tarkista aukon nurkat ja kiinnitys asennusohjeesta.',
    },
  },
  {
    key: 'savo-spin',
    brand: 'SAVO',
    name: 'SPIN USB-C',
    category: 'power',
    summary: 'Kääntyvä kansi, pistorasia ja 20 W USB-C-lataus.',
    source: savo('pistorasia-spin-usb-c-musta'),
    region: 'FI',
    variants: [{ name: 'Musta', article: '80831' }],
    specs: [
      ['Pinta-asennuksen aukko', '120 × 92 mm'],
      ['Huullosasennuksen aukko', '140 × 102 mm'],
    ],
    installation: {
      profile: { kind: 'rectangle', width: 120, depth: 92 },
      note: 'Pinta-asennuksen suorakulmainen aukkoluonnos. Huullosasennuksen porras ja nurkat tarkistetaan asennusohjeesta.',
    },
  },
  {
    key: 'savo-due',
    brand: 'SAVO / Bachmann',
    name: 'DUE',
    category: 'power',
    summary: 'Kahden pistorasian yksikkö sivuille avautuvilla kansilla.',
    source: savo('pistorasia-due'),
    region: 'FI',
    variants: [{ name: 'Pistorasiayksikkö, kannet erikseen', article: '79960' }],
    specs: [
      ['Poraus', '2 × Ø 56 mm'],
      ['Upotussyvyys', '45 mm'],
      ['Ulkomitta', '141 × 71 mm'],
    ],
  },
  {
    key: 'savo-walldisq',
    brand: 'SAVO',
    name: 'WallDisQ',
    category: 'power',
    summary: 'Pystypinnalle asennettava magneettinen langaton latausyksikkö.',
    source: savo('langaton-latausyksikko-walldisq'),
    region: 'FI',
    variants: [{ name: 'Musta', article: '80835' }],
    specs: [
      ['Latausteho', 'Enintään 15 W'],
      ['Asennusreikä', 'Ø 12 mm'],
    ],
    installation: {
      ...circle(12)!,
      note: 'Vain valmistajan ilmoittama asennusreikä. Latausyksikön ulkomuoto ja USB-C-virtalähde eivät sisälly.',
    },
  },
  ...(
    [
      ['clip-top', 'CLIP top BLUMOTION', 'Vaimennetut kalustesaranat.'],
      ['movento', 'MOVENTO', 'Puulaatikoiden kiskojärjestelmä.'],
      ['tandem', 'TANDEM', 'Kalustelaatikoiden piilokiskot.'],
      ['legrabox', 'LEGRABOX', 'Ohutsivuinen laatikkojärjestelmä.'],
      ['merivobox', 'MERIVOBOX', 'Modulaarinen laatikkojärjestelmä.'],
      ['aventos', 'AVENTOS HK top', 'Yläkaapin nosto-ovimekanismi.'],
    ] as const
  ).map(([key, name, summary]): CatalogProduct => ({
    key: `blum-${key}`,
    brand: 'Blum',
    name,
    category: 'hardware',
    summary,
    source: blumWorld,
    region: 'Kansainvälinen',
    cad: { url: blumCad, label: 'Blum CAD/CAM' },
  })),
  ...(
    [
      ['tiomos', 'Tiomos', 'Kalustesaranat.'],
      ['dynapro', 'Dynapro', 'Puulaatikoiden piilokiskot.'],
      ['nova-pro', 'Nova Pro Scala', 'Laatikkojärjestelmä.'],
      ['vionaro', 'Vionaro V8', 'Ohutsivuinen laatikkojärjestelmä.'],
    ] as const
  ).map(([key, name, summary]): CatalogProduct => ({
    key: `grass-${key}`,
    brand: 'GRASS',
    name,
    category: 'hardware',
    summary,
    source: grassCad,
    region: 'EU',
    cad: { url: grassCad, label: 'CAD · STEP-paketit' },
  })),
  ...(
    [
      ['sensys', 'Sensys', 'Vaimennetut kalustesaranat.'],
      ['novisys', 'Novisys', 'Kalusteiden saranajärjestelmä.'],
      ['quadro', 'Quadro', 'Laatikoiden piilokiskot.'],
      ['actro', 'Actro 5D', 'Puulaatikoiden kiskojärjestelmä.'],
      ['avantech', 'AvanTech YOU', 'Kalustelaatikoiden järjestelmä.'],
      ['topline', 'TopLine XL', 'Liukuovien helajärjestelmä.'],
    ] as const
  ).map(([key, name, summary]): CatalogProduct => ({
    key: `hettich-${key}`,
    brand: 'Hettich',
    name,
    category: 'hardware',
    summary,
    source: hettichProducts,
    region: 'EU',
    cad: { url: hettichCad, label: 'Hettich CAD' },
  })),
  {
    key: 'hettich-illumination',
    brand: 'Hettich',
    name: 'AvanTech YOU Illumination',
    category: 'lighting',
    summary: 'Laatikon avaamiseen reagoiva valaistus ja valoprofiilit.',
    source: 'https://hta.hettich.com/en-de/drawer-systems/avantech-you',
    region: 'EU',
    cad: { url: hettichCad, label: 'Hettich CAD' },
  },
  ...(
    [
      ['free-space', 'Free space', 'Kompakti nosto-ovimekanismi.'],
      ['free-flap', 'Free flap', 'Yläkaapin nosto-ovihelat.'],
      ['free-up', 'Free up', 'Ylöspäin nostavan oven mekanismi.'],
    ] as const
  ).map(([key, name, summary]): CatalogProduct => ({
    key: `hafele-${key}`,
    brand: 'Häfele',
    name,
    category: 'hardware',
    summary,
    source: hafeleFree[key],
    region: 'EU',
  })),
  {
    key: 'hafele-slido',
    brand: 'Häfele',
    name: 'Slido D-Line11',
    category: 'hardware',
    summary: 'Liukuovihelat ja kiskot.',
    source:
      'https://www.hafele.com/us/en/product/single-running-track-pre-drilled-w-x-h-31-x-33-mm-1-1-4-x-1-5-16-/P-00876304/',
    region: 'Kansainvälinen',
  },
  {
    key: 'hafele-loox2062',
    brand: 'Häfele',
    name: 'Loox5 LED 2062',
    category: 'lighting',
    summary: '12 V LED-nauha kalusteiden epäsuoraan valaistukseen.',
    source: loox,
    region: 'UK',
    specs: [
      ['Nauhan leveys ja korkeus', '8 × 1,3 mm'],
      ['Teho', '4,8 W/m'],
      ['Katkaisuväli', '50 mm'],
    ],
  },
  {
    key: 'hafele-loox2068',
    brand: 'Häfele',
    name: 'Loox5 LED 2068',
    category: 'lighting',
    summary: 'Kalusteiden työ- ja kohdevalaistuksen LED-nauha.',
    source: loox,
    region: 'UK',
    specs: [
      ['Teho', '9,6 W/m'],
      ['Katkaisuväli', '25 mm'],
    ],
  },
  {
    key: 'hafele-loox-lead',
    brand: 'Häfele',
    name: 'Loox5 24 V · haaroitusjohto',
    category: 'power',
    summary: 'Neljähaarainen kalustevalaistuksen liitäntäjohto.',
    source: 'https://www.hafele.com/us/en/product/4-way-extension-lead-haefele-loox5/P-01634905/',
    region: 'Kansainvälinen',
  },
  {
    key: 'geberit-duofix',
    brand: 'Geberit',
    name: 'Duofix',
    category: 'sanitary',
    summary: 'Seinä-WC:n asennuselementit. Valitse Suomen markkinan versio.',
    source: geberitBim,
    region: 'FI',
    cad: { url: geberitBim, label: 'Geberit BIM ja tuotekuvasto' },
  },
  {
    key: 'geberit-ceramics',
    brand: 'Geberit',
    name: 'WC-istuimet ja altaat',
    category: 'sanitary',
    summary: 'Saniteettikeramiikan BIM-aineistot ja maakohtaiset tuoteversiot.',
    source: geberitBim,
    region: 'FI',
    cad: { url: geberitBim, label: 'Geberit BIM ja tuotekuvasto' },
  },
  {
    key: 'oras-safira',
    brand: 'Oras',
    name: 'Safira',
    category: 'taps',
    summary: 'Keittiö- ja pesuallashanat.',
    source: 'https://www.oras.com/fi/keittiohanat',
    region: 'FI',
    cad: { url: orasBim, label: 'Oras-materiaalipankki' },
  },
  {
    key: 'oras-vega',
    brand: 'Oras',
    name: 'Vega',
    category: 'taps',
    summary: 'Pesuallas- ja keittiöhanat.',
    source: 'https://www.oras.com/fi/pesuallashanat',
    region: 'FI',
    cad: { url: orasBim, label: 'Oras-materiaalipankki' },
  },
  {
    key: 'oras-inspera',
    brand: 'Oras',
    name: 'Inspera 3018F',
    category: 'taps',
    summary: 'Bidehana.',
    source: 'https://www.oras.com/fi/tuotteet/3018F/bidhana',
    region: 'FI',
    variants: [{ name: '3018F', article: '3018F' }],
    cad: { url: orasBim, label: 'Oras-materiaalipankki' },
  },
  {
    key: 'grohe-smartcontrol',
    brand: 'GROHE',
    name: 'Grohtherm SmartControl',
    category: 'taps',
    summary: 'Suihkun termostaattihana. Tuotesivulla myös STP-aineisto.',
    source:
      'https://www.grohe.fi/fi_fi/grohtherm-smartcontrol-termostaattihana-suihkulle-dn-15-102168KF00.html',
    region: 'FI',
    variants: [{ name: '102168KF00', article: '102168KF00' }],
  },
  {
    key: 'hansgrohe-vernis',
    brand: 'hansgrohe',
    name: 'Vernis',
    category: 'taps',
    summary: 'Kylpyhuoneen hana- ja suihkumallisto.',
    source: 'https://www.hansgrohe.fi/kylpyhuone/tuotteet/mallistot/vernis',
    region: 'FI',
    cad: { url: hansgroheBim, label: 'hansgrohe / AXOR BIM' },
  },
  {
    key: 'hansgrohe-raindance',
    brand: 'hansgrohe',
    name: 'Raindance Select E 300',
    category: 'taps',
    summary: 'Suihkukokonaisuus. Latauksissa useita 3D-tiedostomuotoja.',
    source:
      'https://www.hansgrohe.com.tr/articledetail-raindance-select-e-dus-kolonu-300-2-jet-showertablet-select-300-ile-27126400',
    region: 'Kansainvälinen',
    variants: [{ name: '27126400', article: '27126400' }],
    cad: { url: hansgroheBim, label: 'hansgrohe / AXOR BIM' },
  },
  ...(['Nautic', 'Nordic3', 'Triomont'] as const).map((name): CatalogProduct => ({
    key: `gustavsberg-${name.toLowerCase()}`,
    brand: 'Gustavsberg',
    name,
    category: 'sanitary',
    summary:
      name === 'Triomont'
        ? 'WC-asennustelineiden BIM-mallit.'
        : 'Saniteettikalusteiden 3D- ja BIM-mallit.',
    source: gustavsbergBim,
    region: 'EU',
    cad: { url: gustavsbergBim, label: 'Gustavsberg-materiaalipankki' },
  })),
];

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fi');
export function searchProducts(query: string, category = '', brand = '') {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return productCatalog.filter((p) => {
    if ((category && p.category !== category) || (brand && p.brand !== brand)) return false;
    const content = normalize(
      [
        p.brand,
        p.name,
        p.summary,
        productCategories[p.category],
        ...(p.variants?.flatMap((v) => [v.article, v.name]) ?? []),
        ...(p.specs?.flat() ?? []),
      ].join(' '),
    );
    return words.every((word) => content.includes(word));
  });
}
