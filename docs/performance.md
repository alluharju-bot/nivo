# Mallinnusnäkymän suorituskyky

## V0.14.1 — siirtokorostuksen regressio, 4.10.2026

Alla kuvatulla M1 Pro / ANGLE Metal -kokoonpanolla uusi koko valinnan
korostus ja toimintohistoria säilyttivät 1 184 osan siirron noin 60 kuvaa/s:
mediaani **16,7 ms**, p95 **17,0 ms**, **16 piirtokutsua**. Valinta ei luonut
uutta GPU-geometriaa. Valinta 121 ms, siirron hyväksyntä 258 ms, Peru 272 ms,
kopiointi 2 368 osaan 394 ms ja uudelleenavaus 608 ms.
[Mittauksen tulos](benchmarks/v0141-actions-1184-metal.json).

Tasomuodot piirretään yksittäin, jotta päällekkäisten pintojen luontijärjestys
säilyy myös valinnan vaihtuessa. Tavallisten kiinteiden osien instanssipiirto
säilyy. Tämä tarkistus koskee kiinteiden levyjen mallia, ei tuhansia
päällekkäisiä tasoluonnoksia.

## V0.14 — 4.10.2026

Suuren mallin ensimmäinen raja oli projektin 1 000 osan tarkistusraja, joka
näytti väärän mittavirheen. Hyväksymisraja on nyt **10 000 osaa**. Se ei ole
kaikille malleille tai laitteille pätevä suorituskykylupaus.

Mittaus: Apple M1 Pro / 16 Gt / macOS 26.2, Chromium 153.0.8010.12,
**ANGLE Metal / Apple M1 Pro**. Tuotantoversiot samalla koneella, selaimen
koko 1440 × 960, mallinnusalue 1072 × 863, pikselisuhde 1. Vertailucommit
`39f12b2` (v0.13) vastaan v0.14. Erilliset selainprofiilit; ei käyttäjän mallia
tai selaintallennusta. Jokainen levy on oma tarkka CAD-osansa.

### Osoitus ja kamerakierto

Sama 500 × 400 × 18 mm levy ruudukossa neljällä korkeudella. 150 ruutua
per ele, 30 lämmittelyyn ja 120 mittaukseen. Mediaani / p95 millisekunteina;
pienempi on parempi. Avaus on tiedoston tuonnista näyttöverkkojen valmistumiseen.

|   Osia | Avaus ennen → jälkeen |   Osoitus ennen → jälkeen |     Orbit ennen → jälkeen | Orbit-piirrot / ruutu ennen → jälkeen |
| -----: | --------------------: | ------------------------: | ------------------------: | ------------------------------------: |
|    296 |        1 064 → 280 ms | 16,6 / 18,4 → 16,6 / 20,5 | 16,7 / 18,4 → 16,6 / 20,4 |                              626 → 13 |
|  1 184 |        3 458 → 396 ms | 16,7 / 18,3 → 16,7 / 18,3 | 16,7 / 18,1 → 16,7 / 18,2 |                            2 402 → 13 |
|  5 000 |       13 702 → 980 ms | 42,2 / 43,8 → 16,7 / 18,2 | 43,2 / 45,7 → 16,7 / 18,4 |                           10 034 → 13 |
| 10 000 |     27 653 → 1 824 ms | 86,5 / 89,2 → 19,3 / 19,8 | 90,6 / 94,7 → 19,1 / 19,7 |                           20 034 → 13 |

5 000 osan kamerakierto nousi noin 23 → 60 kuvaan/s ja 10 000 osan
noin 11 → 52 kuvaan/s tässä testissä. 296 osalla laitteisto saavutti jo
ruudunpäivityksen rajan; pieni p95-vaihtelu ei osoita parannusta siinä.
Pääsäikeen pisin latauksen aikainen tehtävä 10 000 osalla oli 1 447 → 343 ms.

|   Osia | JavaScript-keko avauksen jälkeen ennen → jälkeen |
| -----: | -----------------------------------------------: |
|    296 |                                  23,1 → 25,6 MiB |
|  1 184 |                                 103,3 → 38,8 MiB |
|  5 000 |                                520,5 → 114,5 MiB |
| 10 000 |                                777,4 → 204,5 MiB |

Kekomittaus on `performance.memory.usedJSHeapSize` ilman pakotettua
roskienkeruuta. Se ei sisällä kaikkea GPU-/WASM-muistia eikä ole prosessin
kokonaismuisti tai pitkäaikainen vuototesti. Piirtokutsut mitataan WebGL-kutsuista;
raakadatan viimeisen ruudun kolmioihin voi sisältyä varjopassi.

### Pyöristettyjä ja porattuja kalusteosia

1 184 osan malli: 18 mm sivut, katto, pohja, hylly, 2 mm pyöristetty ovi ja
80 mm läpiviennillä porattu tausta, seitsemän toistuvaa osatyyppiä. Geometria
rakennetaan aidolla OpenCascadella, ei valmiilla näyttöverkoilla.

| Mittari                  |          V0.13 |          V0.14 |
| ------------------------ | -------------: | -------------: |
| Avaus                    |      12 406 ms |       1 339 ms |
| Osoitus mediaani / p95   | 16,7 / 18,1 ms | 16,7 / 18,1 ms |
| Orbit mediaani / p95     | 16,7 / 21,6 ms | 16,6 / 18,3 ms |
| Orbit-piirrot / ruutu    |          2 466 |             23 |
| JS-keko avauksen jälkeen |      409,5 MiB |      193,7 MiB |

Molemmat saavuttivat jo noin 60 kuvaa/s; parannus näkyy avauksessa,
piirtokutsujen määrässä ja muistissa. Käyttäjän omaa 296 osan kaappiriviä ei
ollut saatavilla. Täysin erilaiset BRep-osat eivät saa samaa hyötyä toistovälimuistista.

### Valinta, siirto, kopiointi ja tallennus

Erillinen toimintasarja: samanlaiset levyt yhdessä ryhmässä, ylänäkymä,
kaikkien valinta, X-siirron esikatselu, tarkka 100 mm siirto, Peru,
ryhmäkopio 1 000 mm Y-suunnassa, tiedostolataus ja selaimen päivitys.
Esikatselussa 20 lämmittelyruutua + 100 näytettä. Testi tarkistaa jokaisen
osan X-siirron sekä muuttumattoman Y/Z:n ja tallentuneen osamäärän.

| Lähtöosia | Valinta | Siirron esikatselu mediaani / p95 | Siirron hyväksyntä |    Peru |   Kopiointi | Tiedostolataus | Päivitys / tulososia |
| --------: | ------: | --------------------------------: | -----------------: | ------: | ----------: | -------------: | -------------------: |
|       296 |  171 ms |                    16.7 / 18.2 ms |             176 ms |  229 ms |      264 ms |          47 ms |         330 ms / 592 |
|     1,184 |  124 ms |                    16.7 / 18.1 ms |             268 ms |  286 ms |      389 ms |          40 ms |       604 ms / 2,368 |
|     5,000 |  506 ms |                    16.4 / 17.7 ms |            1303 ms | 1133 ms |     1821 ms |          65 ms |     1849 ms / 10,000 |
|    10,000 | 1339 ms |                    31.6 / 32.9 ms |            2874 ms | 2483 ms | raja täynnä |          79 ms |     1896 ms / 10,000 |

Valinta ei rakentanut yhtään uutta GPU-geometriaa. Siirron aikana oli 16
piirtokutsua ruudussa kaikilla määrillä. 5 000 osan valinta liikkuu noin 60
kuvaa/s, 10 000 osan noin 32 kuvaa/s; jälkimmäisen hyväksyminen vie noin 2,9 s.
10 000 osan kopiointi ylittäisi projektirajan, joten sitä ei tehdä.

Toimintosarjan jälkeinen JS-keko oli uudelleenavauksessa 30,5 / 138,4 /
741,6 / 981,6 MiB näillä määrillä. Roskienkeruuta ei pakoteta, joten näissä
luvuissa voi olla edellisen sivun ja historian vielä keräämätöntä muistia.
Ne eivät ole vakaan tilan muistibudjetteja: suuren mallin pitkäaikainen
muistikuorma on edelleen seurattava asia, vaikka vuorovaikutus nopeutui.

### Leikkaustason veto

Samassa 1 184 osan pyöristetyssä/poratussa kalustemallissa leikkaustason
veto: **16,7 / 18,9 ms** (mediaani / p95), eli noin 60 kuvaa/s.
Tuonti täyttöineen 1 858 ms; vapautuksesta täyttöjen valmistumiseen 240 ms.
Lopputasolla 65 osan tarkat CAD-leikkaustäytöt, X = 400 mm. Esikatselu leikkaa
näytön heti, ja 180 ms:n viive yhdistää nopean vedon CAD-laskentapyynnöt.

### Toteutuksen muutokset

- Muuttumattomat GPU-geometriat säilyvät valinnan ja työkalun vaihtuessa.
  Siirron esikatselu lainaa niitä ja siirtää yhteistä esikatseluryhmää.
- Worker saa ja palauttaa vain muuttuneet geometriaosat. Peräkkäiset
  rakennuspyynnöt käsitellään järjestyksessä myös nopeassa Peru-tilanteessa.
- Toistuvien osien tarkka CAD-muoto ja verkko lasketaan kerran ja siirretään
  esiintymän paikalle. BRep ja osatunniste pysyvät jokaisella osalla omana.
- Saman geometrian ja ulkoasun pinnat ja reunat piirretään instansseina,
  myös siirron esikatselussa. CPU:n tarkat poimintaverkot säilyvät erillisinä.
- Avaruusindeksi rajaa säde- ja tartuntahaun. Valintajoukot ja ryhmähaku
  käyttävät välimuistia; yli 400 rivin mallilista piirtää vain näkyvät rivit.
- Muuttumattomat malliarvot jaetaan historiatilojen kesken. Historia arvioi
  säilytettävien tilojen painon 64 MiB:n budjetilla ja karsii vanhimmat askeleet.
  Arvio on varovainen serialisoitu UTF-16-koko, ei RAM-mittari. Nykyistä mallia
  ei poisteta. Selaimeen tallentuu enintään 20 askelta / 8 MiB.

### Rajat ja seuraava mittaus

±100 000 mm mitta-/sijaintiraja, 10 000 osaa, 1 000 ryhmää, enintään
64 miljoonaa merkkiä projektituonnissa ja 45 sekuntia CAD-pyynnölle ovat
edelleen erillisiä rajoja. Projektin koko ja käytettävissä oleva muisti voivat
rajoittaa monimutkaista mallia aiemmin. Materiaalivariaatiot, kolmiot, uniikit
BRep-muodot, tekstuurit ja renderöintitila vaikuttavat kuormaan.

Leikkauspiirustuksen tarkka CAD-projektio voi olla raskas: rajaa se ryhmään tai
valintaan. Vain yksi leikkaustaso on aktiivinen kerrallaan. Polkulaskentaa ei
ole näissä mallinnusnäkymän FPS-luvuissa. Fyysinen tabletti, Safari/WebKit,
käyttäjän oikea työmaa sekä pidempi GPU-/WASM-muistin seuranta jäävät seuraavaan
mittauskierrokseen. Tablettiemulointi varmistaa työnkulun, ei iPadin kapasiteettia.

### Toistaminen

```sh
NIVO_BASE_PATH=/nivo/ npm run build
NIVO_BASE_PATH=/nivo/ npm run preview -- --port 4173
NIVO_GPU=metal node scripts/performance.mjs http://127.0.0.1:4173/nivo/ 1184
NIVO_GPU=metal node scripts/performance-actions.mjs http://127.0.0.1:4173/nivo/ 1184
NIVO_PERF_FIXTURE=/tmp/nivo-mixed.nivo NIVO_PERF_PARTS=1184 npx vitest run src/cad/performanceFixture.test.ts
NIVO_GPU=metal NIVO_PERF_FIXTURE=/tmp/nivo-mixed.nivo node scripts/performance.mjs http://127.0.0.1:4173/nivo/ 1184
NIVO_GPU=metal NIVO_PERF_FIXTURE=/tmp/nivo-mixed.nivo node scripts/performance-sections.mjs http://127.0.0.1:4173/nivo/
```

Metal-valinta on tämän Mac-vertailun asetus. Ilman sitä ympäristö voi käyttää
SwiftShaderia; tarkista tulosteen `renderer`. Aja versiot peräkkäin ilman muuta
selainkuormaa, älä vaihda tuotantobuildia kesken mittauksen.
[Raakamittaukset](benchmarks/2026-10-04.json) sisältävät myös muut toistetut määrät.

## Mittaus 3.10.2026

Apple M1 Pro / 16 Gt / macOS 26.2; Chromium 153.0.8010.12, headless,
**ANGLE SwiftShader (ohjelmistorenderöinti)**. Selaimen koko 1440 × 960,
mallinnusalue 1072 × 863, pikselisuhde 1. Tuotantopaketit samalta koneelta.
Vanha paketti on commit `3d258c2`, v0.12.0.

| Tilanne                          | V0.12 mediaani / p95 | V0.13 mediaani / p95 | Piirrot / ruutu, mediaani ennen → jälkeen |
| -------------------------------- | -------------------- | -------------------- | ----------------------------------------- |
| Osoittimen liike pintojen päällä | 137,2 / 150,3 ms     | 43,0 / 46,2 ms       | 4 442 → 628                               |
| Oikean napin kamerakierto        | 196,7 / 214,5 ms     | 36,9 / 50,0 ms       | 6 663 → 626                               |

Kummassakin vaiheessa 150 animaatioruudun osoitintapahtumat, ensimmäiset
30 lämmittelyyn ja seuraavat 120 tilastoon. WebGL:n draw-kutsut lasketaan
animaatioruutujen väliltä: ne sisältävät myös varjot ja saman ruudun toistetut
renderöinnit. Mallin latausaika ei sisälly lukuihin. Piirtojen määrä pieneni
osoitinliikkeessä noin 86 % ja kierrossa noin 91 %.

Nämä eivät ole käyttäjän laitteen FPS-lupauksia. Ohjelmistorenderöinti korostaa
piirtojen kustannusta; todellinen 296 osan kaappimalli voi sisältää enemmän
pintoja, käyriä, tekstuureja ja tartuntapisteitä. Toistot, laitteistokiihdytetty
Chromium/Safari ja käyttäjän malli kuuluvat seuraavaan mittauskierrokseen.
