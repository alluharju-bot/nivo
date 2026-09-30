# Validointi — 30.9.2026

Ympäristö: Apple M1 Pro, 16 Gt, macOS 26.2 arm64, Node 24.14.0.
Playwright 1.63.0 / Chromium 153.0.8010.12. Tablettiprofiili on
Chromiumin iPad Pro 11 -kosketusemulointi, ei fyysinen iPad tai Safari.

## Automaattiset tarkistukset

| Tarkistus                         | Tulos                                                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                        | 12 testiä hyväksytty.                                                                                                                                |
| `npm run test:e2e`                | 7 hyväksytty; vain tabletille tarkoitettu testi ohitetaan työpöytäprofiilissa.                                                                       |
| `npm run build`                   | TypeScript ja tuotantopaketointi hyväksytty.                                                                                                         |
| `NIVO_PREVIEW=1 npm run test:e2e` | 5 käyttöliittymätestiä hyväksytty tuotantopaketille. Kaksi kehitystilaan sidottua worker-koetta ja työpöydän tablettitesti ohitetaan tarkoituksella. |
| `npm run format:check`            | Lähdekoodin ja dokumentaation muotoilutarkistus.                                                                                                     |

Geometriatestit käyttävät aitoa OpenCascade-WASM-ydintä:

- 600 × 400 × 18 mm pursotus: **4 320 000 mm³**.
- 100 × 100 mm läpiaukon vähennys: **4 140 000 mm³**.
- 2 mm reunapyöristys tuottaa kelvollisen, alkuperäistä pienemmän tilavuuden.
- BRep-serialisointi ja avaaminen säilyttävät tilavuuden.
- Kuusi semanttista pintaa tunnistetaan myös siirretyssä kappaleessa.
- Tasoluonnos toimii ennen pursotusta.
- Mahdoton 1000 mm pyöristys hylätään ja alkuperäinen kappale säilyy ehjänä.
- 200 erillistä levyä rakentuu workerissa. Virheellinen seuraava pyyntö
  hylätään ja kelvollisen geometrian käsittely jatkuu.
- Laskennan peruminen pysäyttää workerin; seuraava pyyntö käynnistää ytimen uudelleen.

Selaimessa ajetut työnkulut:

1. Uusi projekti → 600 × 400 mm suorakulmio → 18 mm push/pull.
2. `2,4 m` siirto X-suunnassa ja negatiivinen siirtymä Y-suunnassa.
3. Undo/redo palauttaa oikeat sijainnit.
4. Rinnakkaisprojektio, etunäkymä ja todellinen pintavalinta näkymästä.
5. Leveys- ja korkeusmitat sekä SVG-tiedoston lataus.
6. `.nivo`-tiedoston lataus, uudelleenlatauksesta palautuminen, uusi projekti,
   tiedostotuonti ja virheellisen version turvallinen hylkäys.
7. Sormella piirtäminen, painikkeilla hyväksyminen ja näytön suunnan vaihtaminen.
8. Kaappiesimerkin avaus, mitoitus, kappaleen poisto → rikkoutunut mittaviite
   → vienti estyy → undo korjaa viitteen.

SVG-tarkistus varmistaa A4:n `297mm × 210mm`-koon ja vastaavan viewBoxin.
600 mm leveä kappale mittakaavassa 1:5 käyttää 120 mm paperileveyttä.
Mittatekstin koko määritellään paperiyksiköissä eikä kamerasta tai pikseleistä.

![SVG-mittakuvan esikatselu](images/nivo-drawing.png)

## Rajat ja avoimet tarkistukset

- Fyysinen tabletti, Safari/iPadOS, kynä ja laitteiston todellinen
  suorituskyky/muistibudjetti ovat vielä testaamatta.
- 60/30 fps ovat tavoitteita, eivät todettuja tuloksia. 200 osan koe varmentaa
  CAD-rakentamisen, ei satojen osien tabletin navigoinnin sujuvuutta.
- WASM on noin 23 Mt (gzip noin 7,3 Mt), mikä vaikuttaa ensilataukseen.
- Vite varoittaa suuresta pääpaketista ja CAD-loaderin Node-haaran
  ulkoistamisesta. Tuotantotyönkulkujen selaintestit varmentavat käytetyn
  selainhaaran toiminnan.
- V1:n pintatunnisteet toimivat suorakulmaisille, akselien suuntaisille osille.
  Yleisten boolean-muutosten topologinen nimeäminen on jatkotyötä.
- Piirtotaso on XY. Siirto on tasossa ja Z-lukolla korkeussuunnassa;
  numerosyöttö mahdollistaa kaikki kolme akselia. Vapaa kierto ei ole vielä mukana.
- Arkilla on yksi näkymä. Useiden päällekkäisten mittaviivojen automaattinen
  sijoittelu ei ole valmis; käytä ensimmäisessä versiossa muutamaa kokonaismittaa.
- Esimerkkikaappi todentaa kuuden levyn rungon. Täydelliset hyväksymisesimerkit
  A–C odottavat komponentteja, boolean-työkaluja, materiaaleja ja scenejä.
