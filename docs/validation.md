# Validointi — 30.9.2026

Ympäristö: Apple M1 Pro, 16 Gt, macOS 26.2 arm64, Node 24.14.0.
Playwright 1.63.0 / Chromium 153.0.8010.12. Tablettiprofiili on
Chromiumin iPad Pro 11 -kosketusemulointi, ei fyysinen iPad tai Safari.

## Automaattiset tarkistukset

| Tarkistus                    | Tulos                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                   | 21 testiä hyväksytty.                                                                                                                          |
| Kehitystilan selaintestit    | Aiemmat työnkulut, CAD-worker ja uudet vuorovaikutukset ajettu molemmilla profiileilla; korjatut tapaukset varmennettu kohdistetuilla ajoilla. |
| `npm run build`              | TypeScript ja tuotantopaketointi hyväksytty.                                                                                                   |
| Tuotantopaketin selaintestit | Mittasyöttö, apuviivat, Shift-viite, kynä, yhdistäminen sekä aiemmat työnkulut työpöydällä ja tablettiprofiilissa. Ajotulokset alla.           |
| `npm run format:check`       | Lähdekoodin ja dokumentaation muotoilutarkistus.                                                                                               |

Lopullinen `NIVO_PREVIEW=1 npm run test:e2e`: **18 hyväksytty, 4 tarkoituksella
ohitettu**. Ohitukset ovat kaksi vain kehitystilassa ajettavaa worker-koetta ja
kaksi vain tablettiprofiilille tarkoitettua kosketustestiä työpöytäprofiilissa.
TypeScript, tuotantopaketointi ja muotoilutarkistus hyväksytty.

Geometriatestit käyttävät aitoa OpenCascade-WASM-ydintä:

- 600 × 400 × 18 mm pursotus: **4 320 000 mm³**.
- 100 × 100 mm läpiaukon vähennys: **4 140 000 mm³**.
- 2 mm reunapyöristys tuottaa kelvollisen, alkuperäistä pienemmän tilavuuden.
- BRep-serialisointi ja avaaminen säilyttävät tilavuuden.
- Kuusi semanttista pintaa tunnistetaan myös siirretyssä kappaleessa.
- Tasoluonnos toimii ennen pursotusta.
- Kovera kynämuoto (6400 mm²) muodostaa pinnan ja 18 mm pursotuksen.
  Tartuntaverteksit vastaavat todellista topologiaa.
- Päällekkäisten 100 × 100 × 20 mm osien unioni antaa 300 000 mm³;
  erilliset osat säilyttävät yhteistilavuuden 400 000 mm³ saman objektin sisällä.
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
7. Sormella piirtäminen, hyväksyntä sormen noustessa ja näytön suunnan vaihtaminen.
8. Kaappiesimerkin avaus, mitoitus, kappaleen poisto → rikkoutunut mittaviite
   → vienti estyy → undo korjaa viitteen.
9. Kirjoittaminen ilman kentän klikkaamista, Tab, Enter sekä vedon hyväksyntä
   täsmälleen kerran. Tarkat mitat ja aloituspiste säilyvät vapautuksessa.
10. Keskipisteen haku, Shift-lukitus ja uuteen muotoon tallentuva tarkka kohdistus.
11. Mittatyökalun kaksi tilaa, R/45°, Shift/vapaa kulma, tarkka asteluku,
    apuviivan ja vapaan mittaviivan tallennus.
12. Piirto ja siirto tarttuvat apuviivaan; viivat palautuvat uudelleenlatauksessa.
13. Kynän sulkeminen, pursotus, monivalinta, yhdistäminen ja lähteiden palautus
    undolla. Tarkat kynäsiirtymät toimivat ilman uutta hiiren liikettä;
    virheellinen mittasyöte hylätään.
14. Kosketuksen Poimi viite sekä kahden sormen navigointi: keskeneräistä
    piirtoelettä ei hyväksytä navigoinnin päätteeksi.

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
- Semanttiset pintatunnisteet toimivat suorakulmaisille, akselien suuntaisille osille.
  Yleisten boolean-muutosten topologinen nimeäminen on jatkotyötä.
- Piirtotaso on XY. Siirto on tasossa ja Z-lukolla korkeussuunnassa;
  numerosyöttö mahdollistaa kaikki kolme akselia. Vapaa kierto ei ole vielä mukana.
- Apuviivan tartunta edellyttää samaa tasoa. Haettu 3D-viite projisoidaan
  aktiiviseen tasoon. Keskipiste on kappaleen rajalaatikon keskipiste.
- Yhdistäminen edellyttää tilavuuskappaleita. Yhdistetyn objektin paksuuden
  muuttaminen ja topologiaviitteiden siirtäminen yhdistämisen yli ovat jatkotyötä.
- Arkilla on yksi näkymä. Useiden päällekkäisten mittaviivojen automaattinen
  sijoittelu ei ole valmis; käytä ensimmäisessä versiossa muutamaa kokonaismittaa.
- Esimerkkikaappi todentaa kuuden levyn rungon. Täydelliset hyväksymisesimerkit
  A–C odottavat komponentteja, boolean-työkaluja, materiaaleja ja scenejä.
