# Mallinnusnäkymän suorituskyky

296 osan käyttäjähavainnon perusteella lisättiin toistettava vertailu v0.13:ssa.
Mittaus ei käytä käyttäjän omaa mallia vaan 296 erillistä 500 × 400 × 18 mm
levyä, sijoitettuna ruudukkoon neljälle korkeudelle. Jokainen osa säilyy omana
CAD-kappaleenaan ja valittavana objektinaan.

## Rajat ja havainto 4.10.2026

296 → 592 → 1 184 osan kopiointi pysähtyi projektin **1 000 osan
tarkistusrajaan**, eikä mittaan tai GPU-virheeseen. Kaikki Zod-virheet näyttivät
saman 100 000 mm:n mittailmoituksen. Raja on nyt 10 000 osaa ja virheet
erottelevat osamäärän, koordinaatit ja virheelliset viitteet.

Tämä on tiedostomallin hyväksymisraja, **ei mitattu suorituskykylupaus**.
1 184 osan kopiointi, Peru, Palauta ja selaimen päivityksen yli säilyminen
on varmennettu Chromiumissa aidolla CAD-workerilla. Mitta/sijainti ±100 000 mm,
1 000 ryhmän raja, 64 Mt:n projektitiedoston tuontiraja, 45 sekunnin CAD-pyynnön
aikaraja ja 8 MiB:n tallentuvan historian budjetti ovat erillisiä rajoja.

Nykyiset koodista varmennetut pullonkaulat:

- `Viewport.sync` purkaa ja luo kaikki näyttögeometriat ja materiaalit uudelleen
  myös valinnan ja työkalun vaihtuessa. Siirron esikatselu luo valinnan verkot uudelleen.
- CAD-worker säilyttää muuttumattomat CAD-muodot välimuistissa, mutta palauttaa
  silti kaikki osaverkot pääsäikeelle jokaisen `build`-pyynnön jälkeen.
- Linkitetyt kopiot jakavat muokkauslogiikan, mutta niiden CAD-/GPU-resurssit
  eivät vielä ole jaettuja geometriaresursseja tai instanssipiirtoja.
- Osoitus, valintalistat ja ryhmähaku käyvät laajasti läpi osia; listaa ei virtualisoida.
- Historia ja tallennus käsittelevät kokonaisia projektitilannekuvia.

Kapasiteetti riippuu osien lisäksi pinnoista, kolmioista, reunakäsittelyistä,
tekstuurikoosta, näkyvyydestä ja laitteen GPU:sta. Nykyisistä mittauksista ei voi
johtaa yhtä kaikille malleille pätevää osamäärää. Seuraava kokonaisuus on kirjattu
[suuren työmaan yöpassiin](roadmap.md#seuraava-yöpassi-suuren-työmaan-sujuva-mallinnus).

1 184 levyn tuotantopakettimittaus samalla M1 Pro / Chromium 153 / SwiftShader
ympäristöllä: tuonti 3 561 ms; osoitus mediaani/p95 **71,9 / 73,8 ms**, orbit
**68,8 / 73,2 ms**; piirrot/ruutu **2 403 / 2 402**. Tämä on ohjelmistorenderöinnin
vertailutulos, ei käyttäjän laitteistokiihdytetyn selaimen kapasiteettiarvio.
Sama 500 × 400 × 18 mm levy, suurempi malli 35 sarakkeessa; 150 ruutua/ele,
30 lämmittelyruutua ja 120 näytettä. Mallin tunnisteet ja valinta säilyvät erillisinä.

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

## Korjaukset

Aiemmin jokainen CAD-face sai oman materiaalin ja piirtoerän, vaikka kuusi
laatikon pintaa käyttivät samaa materiaalia. Nyt osa käyttää yhtä pintaerää;
valitun yksittäisen facen materiaalijako säilyy tarvittaessa. Osoitettu face ja
kumitettavat pintarajaukset korostetaan erillisellä pienellä verkolla. Osoitus ei
päivitä kaikkien osien kaikkia materiaaleja.

Useat saman tapahtuman piirtopyynnöt yhdistetään yhdeksi requestAnimationFrame-
päivitykseksi. Näkymä piirtää pyynnöstä, ei jatkuvasti tyhjäkäynnillä. Muokkaus-
rajauksen ja monivalinnan mittalaskennan React-arvot pidetään vakaina.

## Toistaminen

```sh
NIVO_BASE_PATH=/nivo/ npm run build
NIVO_BASE_PATH=/nivo/ npm run preview -- --port 4173
node scripts/performance.mjs http://127.0.0.1:4173/nivo/
node scripts/performance.mjs http://127.0.0.1:4173/nivo/ 1184
```

Skripti avaa erillisen tyhjän selainkontekstin, tuo oman testimallinsa ja tulostaa
JSON-mittauksen. Se ei koske käyttäjän selaintallennukseen. Aja versiot
peräkkäin ilman muuta selainkuormaa. Tuotantobuildia ei saa vaihtaa kesken ajon.
Canvasin `data-draw-calls` kertoo myös viimeisen Three.js-renderöinnin piirrot.

## Seuraava optimointikokonaisuus

1. Käyttäjän todellisen mallin CPU-/GPU-profiili: osoitus, siirto, kamerakierto,
   valinta, ryhmän kopiointi ja tallennus erikseen.
2. Säilytä GPU-geometriat ja materiaalit muuttumattomilla osilla valinnan ja
   työkalun vaihtuessa. Nykyinen scene-sync rakentaa nämä edelleen uudelleen.
3. Workerilta vain muuttuneiden verkkojen siirto; metatietojen nimeäminen,
   ryhmittely ja väri eivät tarvitse koko mallin verkkopäivitystä.
4. Tartuntapisteiden välimuisti ja avaruusindeksi sekä rajattu säteenhaku.
5. Mallilistan virtualisointi suurilla määrillä; geometrialle ja tekstuureille
   muistibudjetti. Mittaukset 296 / 1 184 / 5 000 / 10 000 osalla.

Optimointi ei saa vaihtaa millimetrimitoitusta likimääräiseksi, ohittaa
näkyvyystarkistuksia tai yhdistää erillisiä CAD-osia pysyvästi.
