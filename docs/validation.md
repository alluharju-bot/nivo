# Validointi — 1.10.2026

Ympäristö: Apple M1 Pro, 16 Gt, macOS 26.2 arm64, Node 24.14.0.
Playwright 1.63.0 / Chromium 153.0.8010.12. Tablettiprofiili on
Chromiumin iPad Pro 11 -kosketusemulointi, ei fyysinen iPad tai Safari.

## Automaattiset tarkistukset

| Tarkistus                    | Tulos                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                   | 27 testiä hyväksytty.                                                                                                                          |
| Kehitystilan selaintestit    | Aiemmat työnkulut, CAD-worker ja uudet vuorovaikutukset ajettu molemmilla profiileilla; korjatut tapaukset varmennettu kohdistetuilla ajoilla. |
| `npm run build`              | TypeScript ja tuotantopaketointi hyväksytty.                                                                                                   |
| Tuotantopaketin selaintestit | Mittasyöttö, apuviivat, Shift-viite, kynä, yhdistäminen sekä aiemmat työnkulut työpöydällä ja tablettiprofiilissa. Ajotulokset alla.           |
| `npm run format:check`       | Lähdekoodin ja dokumentaation muotoilutarkistus.                                                                                               |

V0.3:n koko `NIVO_PREVIEW=1 npm run test:e2e` -ajo: **30 hyväksytty,
4 tarkoituksella ohitettu** (3,2 min). Viimeisen pikanäppäinkorjauksen jälkeen
tuotantopaketti rakennettiin uudelleen ja pintatyökalun sekä Shift-piirron
testit ajettiin molemmilla profiileilla: **4 hyväksytty** (34,2 s).
TypeScript, tuotantopaketointi ja muotoilutarkistus hyväksytty.
Ohitukset ovat kaksi vain kehitystilassa ajettavaa worker-koetta ja
kaksi vain tablettiprofiilille tarkoitettua kosketustestiä työpöytäprofiilissa.

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
- Laatikon kaikki kuusi pintaa: ulosveto ja sisääntyöntö muuttavat oikeaa mittaa,
  origon paikkaa ja tilavuutta.
- Vinon monikulmion sivupinta ja yhdistetyn osan pinta: positiivinen muutos,
  BRep-tallennus/avaaminen sekä seuraava negatiivinen muutos ovat kelvollisia.
- Pystysuuntainen kynäpinta pursottuu. Epätasomainen muoto ja väärennetyt
  tallennetun pinnan tai BRepin rajalaatikon mitat hylätään.
- Reuna-ankkuri seuraa laatikon siirtoa ja leveyden muutosta. X-ray tallentuu.

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
15. E ensin → etupinnan hover-korostus → veto 40 mm → valitun pinnan
    numerotyöntö −40 mm palauttaa alkuperäiset mitat.
16. Reunasta vedetty apuviiva säilyy rinnakkaisena ja saa 80 mm offsetin;
    R ja Shift+R toimivat luonnin jälkeen. Akselilukko ja Esc säilyttävät työkalun.
    Valmista viivaa voi valita suoraan näkymästä.
17. Kappaleen alle jäävä apuviiva peittyy, viivakohtainen x-ray näyttää sen,
    globaali x-ray säilyy uudelleenlatauksessa.
18. Kynän kolmas viiva lukittuu Shiftillä. Ensimmäisestä pisteestä poimittu
    pituus on täsmälleen 200 mm ja tuottaa oikean neljännen kulman. Shiftin
    vapautuksen jälkeen aloitusverteksiin tarttuminen sulkee muodon.
    Ctrl/Cmd+Z ja Ctrl/Cmd+Shift+Z säilyvät historiaoikoteinä myös kynän ja
    mittatyökalun aikana; Z-akselin lukko ei kaappaa niitä.
19. X/Z-lukoilla tehty pystypinta, lukon vapautus Escillä, E-pursotus 20 mm
    ja syntyneen BRep-kappaleen palautuminen uudelleenlatauksessa.
20. 80 000 × 60 000 × 18 mm levyn ja seinämän neljä kamerakulmaa sekä
    rinnakkaisprojektio renderöityvät ilman selainvirheitä. Kuvantarkistus
    täydentää automaatiota; yksittäiset kuvat eivät todista kaikkien laitteiden
    tai jokaisen animaatioruudun välkkymättömyyttä.

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
- Suorakulmion piirtotaso on XY. Kynän vapaa taso seuraa näkymää ja edellistä
  pistettä, X/Y/Z sekä geometriapisteet mahdollistavat 3D-pisteiden asettamisen.
  Suljettavan muodon on oltava tasomainen. Kappaleen vapaa kierto ei ole mukana.
- Apuviivan tartunta edellyttää samaa tasoa. Haettu 3D-viite projisoidaan
  aktiiviseen tasoon. Keskipiste on kappaleen rajalaatikon keskipiste.
- Yhdistäminen edellyttää tilavuuskappaleita. Tasopinnan push/pull toimii myös
  yhdistetylle osalle, kaareville pinnoille ei vielä. Yleisten pintamuutosten
  ja yhdistämisen yli säilyvät topologiaviitteet ovat jatkotyötä.
- Arkilla on yksi näkymä. Useiden päällekkäisten mittaviivojen automaattinen
  sijoittelu ei ole valmis; käytä ensimmäisessä versiossa muutamaa kokonaismittaa.
- Esimerkkikaappi todentaa kuuden levyn rungon. Täydelliset hyväksymisesimerkit
  A–C odottavat komponentteja, boolean-työkaluja, materiaaleja ja scenejä.
