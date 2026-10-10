# Mallinnusnäkymän suorituskyky

## V0.32.1 — rei'itetty osa ja reunakäsittelyn hyväksyntä, 10.10.2026

92 leikkurilla rei'itettyä osaa tutkittiin paikallisessa tuotantopaketissa.
Valittuun kaarevaan solidiin ilmestyi virheellisesti satoja piste-spritejä:
yksi piirtokutsu ja näkyvyystarkistus jokaiselle pisteelle. Lisäksi tavallinen
pinnan osoitus kävi läpi koko kolmioverkon. Nyt vain piirrosten tarkoitukselliset
pisteet näkyvät jatkuvasti, ja mallinnuksen pintahaku käyttää samaa tarkkaa
kolmiohakupuuta kuin merkintöjen peittyminen. CAD-tartuntoja ei poisteta.

| Sama eristetty osa, Valitse-työkalu | Ennen: mediaani / p95 | Jälkeen: mediaani / p95 | Piirtokutsut ennen → jälkeen |
| ----------------------------------- | --------------------: | ----------------------: | ---------------------------: |
| Osoittimen liike osan päällä        |        41,7 / 50,0 ms |           9,0 / 17,5 ms |                     903 → 31 |
| Kameran kierto                      |        16,6 / 17,0 ms |           8,3 / 10,0 ms |                     769 → 22 |

Piirrettävät kolmiot pysyivät kummassakin vertailuparissa samoina: osoitettaessa
116 962 ja kamerakierrossa 116 924 (sisältävät näkymän apugeometrian).
Yli 32 ms ruutuvälejä osoitintestissä 110/110 ennen ja 0/110 jälkeen.
Pisteiden määrä ja siten piirtokutsujen määrä ennen korjausta riippuu katselukulmasta.

Menetelmä: näkyvä Chromium 153 / Apple M1 Pro / ANGLE Metal, selainikkuna
1728 × 997 CSS-pikseliä, DPR 2, mallinnuscanvas 2720 × 1800 pikseliä.
Kumpikin ajo alkaa samasta edestä-näkymästä ja Sovita näkymään -komennosta.
120 samanlaista animaatioruudussa lähetettyä osoitinliikettä; ensimmäiset kymmenen
ruutuväliä jätetään tilastoista pois. CPU-profilointi on käytössä molemmissa ajoissa.
Vertailu tehtiin ennen muiden selaintestien käynnistämistä. Nämä ovat yhden mallin
paikallisia mittauksia, eivät yleinen FPS-lupaus tai path tracing -vertailu.

Geometriapolussa kirjaston reunaluettelo vertasi jokaista löydettyä reunaa kaikkiin
aiempiin reunoihin. Uusi hajautushaku säilyttää alkuperäisen järjestyksen ja tarkistaa
hash-törmäykset CAD:n IsSame-vertailulla. Täsmälleen valitut reunat annetaan suoraan
pyöristys-/viisteytimelle. Vanhan osan pisteviitteitä varten ei enää verkoteta sitä.

Saman 0,5 mm pyöristyksen vaiheittainen CAD-mittaus:

| Vaihe                                                          |  Ennen | Jälkeen |
| -------------------------------------------------------------- | -----: | ------: |
| Tulosgeometrian tallennus ja vanhojen pisteviitteiden säilytys | 8,29 s |  1,25 s |
| Tuloksen piirtoverkko ja tartuntatiedot                        | 7,54 s |  4,81 s |

Valmiin operaation CAD-laskenta optimointien jälkeen: **6,72 s**.
Kolmioiden määrä (134 784) ja tilavuus säilyivät samoina. Verkotustoleranssit eivät muutu.
Käyttöliittymässä saman reunan pyöristyksen esikatselu valmistui **6,97 s** ja hyväksyntä
**0,89 s**; viisteen esikatselu **6,75 s** ja hyväksyntä **0,97 s**. Hyväksyntä ei lähettänyt
uutta reunakäsittelypyyntöä. Worker käyttää myös esikatselussa jo valmistettua piirtoverkkoa.
Peru ja Palauta tarkistettiin vertaamalla kaikkia tallennettuja osia ennen/jälkeen.

Yhden pinnan korostus käyttää enintään kolmea piirtoaluetta satojen pintakohtaisten
kutsujen sijaan. Peilin pintakohtainen materiaalijako säilyy. Pitkä geometrian
instanssiavain säilytetään myös valinnan/korostuksen muuttuessa.

Testit: `topology.test.ts`, `faceRanges.test.ts`, `spatialIndex.test.ts`,
`annotationOcclusion.test.ts`, `client.test.ts`, `edge-detail.spec.ts` ja
`curved-details.spec.ts`. Yksityistä mallia, sen kuvia tai CPU-profiileja ei tallenneta repoon.

## V0.30.0 — ohjeet erillään mallinnuksen päivityksistä, 10.10.2026

Ohjekirjaston käyttöliittymä ja SVG-animaatiot ladataan vasta avattaessa:
noin **20,0 kt JavaScriptiä / 6,7 kt gzip** ja **5,2 kt CSS / 1,6 kt gzip**.
Ohjeiden tekstit ja toimintatavan valinta ovat pääpaketissa. Vanhan pitkän
tekstiohjeen poistuminen pitää pääpaketin hieman aiempaa pienempänä.

Vain valittu esimerkki on DOMissa. Toisto päivittää omaa paikallista tilaansa
noin 30 Hz ja pysähtyy 12 sekunnin kohdalla. Se ei käy läpi projektin osia,
tee CAD-kutsuja tai lisää historiaa. Sulkeminen peruu animaatiosilmukan;
piilotettu välilehti ja reduced-motion estävät tarpeettoman automaattitoiston.

Paneelien tekstivertailu on [erillisessä auditissa](tool-guides.fi.md),
jonka mittaus toistetaan `scripts/audit-tool-panels.mjs`-komennolla.
Tässä passissa ei mitattu suuren mallin FPS-parannusta.

## V0.29.1 — pinta-alan esikatselu ja huomautuksen värit, 9.10.2026

Pinta-alan osoitintapahtumat yhdistetään kerran animaatioruudussa. Viimeinen
vapautuskohta käsitellään aina ennen hyväksymistä. Yksi tartuntahaku riittää
kulman löytämiseen; semanttisen mitta-ankkurin muodostusta ja toista tasohakua ei
tehdä. Saman kyselyn kamerasäde ja näkymämatriisit käytetään uudelleen.

`scripts/performance-area.mjs` vertaa tuotantopakettia 6 × 6 m lattialla,
0 tai 120 apu-/mittaviivalla, 1440 × 960 Chromium headless -ikkunassa. Sama
120 ruudun osoitinreitti, ensimmäiset 11 näytettä pois tilastoista. CPU-profilointi
päällä kummassakin paketissa. Vertailukohta v0.29.0 (`38e2afe`).

| Animaatioruutujen väli | V0.29.0 mediaani / p95 | V0.29.1 mediaani / p95 |
| ---------------------- | ---------------------: | ---------------------: |
| Lattia, ei viivoja     |         23,3 / 25,8 ms |         24,6 / 29,6 ms |
| Lattia ja 120 viivaa   |         39,2 / 41,0 ms |         34,5 / 36,4 ms |

Viivoja sisältävän kokeen ruutuväli lyheni noin 12 %. Tyhjän lattian kokeessa
parannusta ei havaittu. Pointermove-käsittelijän kestoa ei pidä verrata suoraan:
uudessa toteutuksessa varsinainen työ siirtyy animaatioruutuun. Luvut ovat yhden
paikallisen headless-vertailun tuloksia, eivät laitteiston FPS-lupaus.

Huomautuksen väri-input ei enää tallenna/validoi projektia eikä luo historiaa
jokaisella tapahtumalla. Viimeisin väri esikatsellaan SVG-merkinnässä kerran
ruudussa ilman uutta WebGL-piirtoa. Native change/blur tallentaa yhden muutoksen,
Esc peruu. Selaintestissä 100 osan malli ja 100 peräkkäistä sävyn muutosta:
tallennettu projektiväri pysyi ennallaan esikatselun aikana, hyväksynnän jälkeen
yksi Peru palautti alkuvärin. Tämä kattaa myös merkinnän tekstivärin saman komponentin kautta.

## V0.24.2 — käyttäjän kaappimallin todellinen pullonkaula, 8.10.2026

Käyttäjän tallentama malli toisti hidastumisen: 12 pyöristettyä kaappirunkoa,
12 pyöristettyä mustalla tammiviilulla pinnoitettua ovea, kaksi muuta osaa ja
24 apuviivaa. Yhteensä 26 CAD-osaa, kolme erilaista perusgeometriaa ja
178 034 piirrettävää kolmiota. Malli ja sitä esittävät kuvat säilyvät paikallisina.

Kameran jokaisella ruudulla apuviivojen pisteille ja mittateksteille tehtiin
tarkka sädehaku koko osan kolmioihin. CPU-profiilissa noin 90 % ajasta kului
näihin osumatarkistuksiin. Materiaalien korvaaminen tasaisella maalilla ei
auttanut. Apuviivojen poistaminen palautti nopeuden.

| Sama kamerakierto, Valitse aktiivisena | Mediaani ennen | Mediaani jälkeen | p95 ennen → jälkeen |
| -------------------------------------- | -------------: | ---------------: | ------------------: |
| Alkuperäinen malli                     |        50,2 ms |           8,3 ms |      108,1 → 9,7 ms |
| Apuviivat poistettu vertailua varten   |         8,3 ms |           8,3 ms |        9,1 → 9,7 ms |
| Materiaalit korvattu maalilla          |        50,0 ms |           8,3 ms |       100,0 → 10 ms |

Korjatussa alkuperäisessä mallissa myös Siirrä-työkalun kamerakierron mediaani
oli 8,3 ms ja p95 10,0 ms. Yli 32 ms:n välejä oli Valitse-ajossa ennen korjausta
129/170 ja korjauksen jälkeen 0/170. Piirtokutsut pysyivät 92:ssa ja kolmioiden
määrä muuttumattomana. Kaikkien kolmen vertailutilanteen lopulliset PNG-kuvat
olivat ennen ja jälkeen **tavutasolla identtiset**.

Näkyvyyskyselyt käyttävät nyt geometriakohtaista kolmiohakupuuta, joka säilyy
kameran liikkeen ja korostuksen vaihdon yli. Pienet yksinkertaiset osat eivät
tarvitse puuta. Haku päättyy ensimmäiseen peittävään pintaan; poikkileikkauksen
poistama pinta ohitetaan. Puut eivät muuta CAD:n kolmioindeksejä, pintavalintaa
tai mallin tarkkuutta. Geometrian muutos tai vapautus mitätöi välimuistin.

Apple M1 Pro / 16 Gt, koneen asennettu Google Chrome 154.0.8037.98,
ANGLE Metal, näkyvä selainikkuna, 1728 × 1117 CSS-pikseliä, DPR 2.
Molemmat ajot paikallisesta tuotantobuildista. 180 kameraliikettä,
ensimmäiset kymmenen ruutuväliä rajattu pois. Noin **20 → 120 FPS** on tämän
mallin mitattu animaatioruutujen taso; ei kaikkien mallien tai laitteiden takuu
eikä erillinen GPU-ajan mittaus. [Mittausluvut](benchmarks/v0242-annotation-occlusion.json).

Yksityisen projektin vertailu on toistettavissa paikallisesti:

```sh
NIVO_BASE_PATH=/nivo/ npm run preview -- --port 4173
NIVO_BROWSER=chrome node scripts/performance-project.mjs http://127.0.0.1:4173/nivo/ model.nivo
```

Skripti käyttää erillistä selainprofiilia ja hyväksyy vain paikallisen palvelimen.
Se tallentaa CPU-profiilit ja kuvakaappaukset väliaikaiseen kansioon, ellei
tuloshakemistoa anneta kolmantena argumenttina. Aja ilman rinnakkaista testikuormaa.

## V0.24.1 — musta tammiviilu ja kaappien kopiointi, 8.10.2026

Käyttäjä raportoi 12 kaapin kamerakierrolle arviolta 15–30 FPS tavallisessa
mallinnusnäkymässä. Avoimen käyttäjäistunnon projektia ei ollut saatavilla.
Vertailu rakennettiin kaappityökalun levyistä: 600 × 590 × 760 mm, 18 mm ovi,
musta tammiviilu, tekstuurin toisto 650 mm ja kierto 90°. Yksi kaappikopio ja
kymmenen yksittäistä Toista-painallusta, sitten oven kopio ja kymmenen oven erä:
yhteensä 95 osaa. Tämä ei varmista käyttäjän mahdollisen offset-/pursotusmallin
geometriaa, näkymää tai pitkän istunnon tilaa.

Siirrä-työkalun tartunta- ja korostushaku suoritettiin myös oikean hiirennapin
kameravedossa. Korostuksen vaihtuessa materiaaleja saatettiin rakentaa uudelleen.
Kameravedon ajaksi haku nyt keskeytyy; osoitus jatkuu tavallisella hiirenliikkeellä.

| 150 kameraliikettä, Siirrä aktiivisena | Julkaistu 0.24.0 | Paikallinen korjaus |
| -------------------------------------- | ---------------: | ------------------: |
| Tekstuurin GPU-latauskutsut            |               16 |                   0 |
| Animaatioruudun mediaani / p95         |     8,3 / 9,3 ms |        8,3 / 9,0 ms |
| Piirtokutsut / kolmiot                 |        21 / 1742 |           21 / 1742 |

M1 Pro, näkyvä Chromium-ikkuna, 1728 × 1117 CSS-pikseliä, DPR 2;
3D-piirtopinta 2720 × 2040 pikseliä. Ennen-ajo oli GitHub Pagesissa, korjausajo
paikallisella tuotantobuildilla. Korjauksen pisin ruutuväli oli 9,3 ms;
yli 32 ms:n välejä ei ollut tässä lyhyessä ajossa. Animaatioruudun väli ei ole erillinen GPU-ajan
mittaus. Pieni p95-ero ei ole yleinen FPS-lupaus. Valitse-työkalulla latauksia oli
molemmissa ajoissa nolla. Alkuperäinen 15–30 FPS:n tilanne jäi **toistamatta**;
sen jatkotutkimukseen tarvitaan käyttäjän tarkka projekti ja selain-/laitetiedot.
[Raakadata](benchmarks/v0241-cabinet-orbit.json).

Käsin käynnistettävä testi tallentaa CPU-profiilit, GPU-latausmäärät, ruutuvälit
ja kuvakaappaukset. Se ei aseta kaikille koneille yhteistä FPS-hyväksymisrajaa:

```sh
NIVO_PROFILE=1 npx playwright test tests/material-performance.spec.ts --project=desktop --headed --grep 'black oak'
```

Ajossa on syytä pitää muut selain-testisarjat pysäytettyinä. Tavallinen
regressiotesti tarkistaa kameran liikkeen, siirtokorostuksen tauon ja palautumisen
sekä geometrian rakennusmäärän säilymisen ilman ajoituskynnystä.

## V0.19 — tarkentuvan renderöinnin tekstuurimuisti, 5.10.2026

296 mäntyosaa käytti aiemmin samoille kolmelle kuvalle 888 eri Three.js Source
-tunnistetta. Path tracer poistaa kaksoiskuvat Source-tunnisteen ja väriavaruuden
perusteella, joten yhteinen canvas ei yksin vähentänyt tekstuuritaulukon kerroksia.
Vanha 1024 × 1024 RGBA8 -taulukko vaati laskennallisesti 3 552 MiB (3,47 GiB).

Materiaalikirjasto jakaa nyt kuvien Source-oliot ja säilyttää erilliset Texture-oliot
osien siirroille/kierroille. Samassa 296 osan kokeessa on kolme kerrosta natiivissa
512 × 512 -koossa: **3 MiB**. Tämä on tekstuuritaulukon laskennallinen tilantarve,
ei koko sovelluksen tai näytönohjaimen mitattu muisti. Myös normaalien ja karheuden
lähdekuvat käyttävät tätä jakamista. Eri kohokuviokoko/syvyys voi vaatia eri kartan.

Tuotantotesti laski 8 näytteen kuvan 296 mäntyosasta. PNG:stä tarkistettiin
värilliset pintapikselit; testin kokonaiskesto oli noin minuutti. Se sisältää
projektin avaamisen, CAD-rakentamisen ja shaderin valmistelun eikä ole
ruudunpäivitysnopeuden mittaus. Pienen mallin mänty/pähkinä-vaihdot ja kameran
kierto palautuivat myös värilliseksi tarkentuvaksi kuvaksi.

Kuvataulukon uusi enimmäisbudjetti on 128 MiB. Suuret kuvamäärät pienentävät
kerrosten resoluutiota, eivät alkuperäisiä projektikuvia. Laitteen kerrosrajan
ylitys palauttaa nopean esikatselun selityksineen; tämä varmennettiin myös
simuloidulla pienellä kerrosrajalla. Käyttäjän alkuperäistä projektia ja
selain/näytönohjain-yhdistelmää ei ollut tässä kokeessa käytössä.

## V0.17 — kokonaismittojen regressio, 5.10.2026

Sama 1 184 levyn tuotantotesti M1 Pro / ANGLE Metal -kokoonpanolla,
ensin ilman mittoja ja sitten kolmella ryhmän kokonaismitalla (X/Y/Z).
Ajot tehtiin peräkkäin ilman rinnakkaista selain-testisarjaa.

| Mittari                |  Ilman mittoja | Kolme kokonaismittaa |
| ---------------------- | -------------: | -------------------: |
| Siirron mediaani / p95 | 16,7 / 18,3 ms |       16,7 / 18,3 ms |
| Piirtokutsut           |             16 |                   16 |
| Valinta                |         121 ms |               137 ms |
| Siirron hyväksyntä     |         256 ms |               248 ms |
| Peru                   |         280 ms |               283 ms |
| Kopiointi 2 368 osaan  |         390 ms |               419 ms |
| Tiedostolataus         |          41 ms |                52 ms |
| Uudelleenavaus         |         610 ms |               612 ms |

Valinta ei kummassakaan ajossa rakentanut uutta GPU-geometriaa. Tarkka 100 mm
X-siirto, muiden akselien säilyminen ja tallennettu osamäärä tarkistettiin.
Siirto säilyi noin 60 kuvassa/s. V0.16:n p95 oli 17,5 ms; yhden ajon pieni
vaihtelu ei osoita pysyvää muutosta. Uudet kokonaismitat eivät tässä kokeessa
aiheuttaneet havaittavaa ruudunpäivityksen hidastumista.

JS-keko uudelleenavauksen jälkeen oli 70,1 / 136,4 MiB. Roskienkeruuta ei
pakotettu: arvot eivät ole vakaan tilan muistibudjetteja tai osoitus vuodon
puuttumisesta. Mittaus ei kata tuhansia mittoja, pitkää käyttöistuntoa,
monimutkaisten uniikkien CAD-osien mitta-arkkien muodostusta tai iPadin kapasiteettia.

Raakadata: [ilman mittoja](benchmarks/v017-actions-1184-metal.json) ja
[kokonaismitoilla](benchmarks/v017-actions-dimensions-1184-metal.json).

```sh
npm run build
npm run preview -- --port 4173
NIVO_GPU=metal node scripts/performance-actions.mjs http://127.0.0.1:4173/ 1184
NIVO_GPU=metal NIVO_BENCH_DIMENSIONS=1 node scripts/performance-actions.mjs http://127.0.0.1:4173/ 1184
```

## V0.16 — tartunnan ja valinnan regressio, 4.10.2026

Sama M1 Pro / ANGLE Metal -sarja 1 184 levyllä: siirron mediaani **16,7 ms**,
p95 **17,5 ms** ja **16 piirtokutsua**. Valinta ei luonut uutta GPU-geometriaa.
Siirron hyväksyntä 265 ms, Peru 286 ms, kopiointi **2 368 osaan 395 ms**,
tiedostolataus 35 ms ja uudelleenavaus 620 ms. Tarkat siirtymät ja muiden
akselien säilyminen tarkistettiin. Tulos on samalla tasolla v0.15:n kanssa;
pieni p95-vaihtelu ei osoita pysyvää nopeutumista.
[Mittauksen tulos](benchmarks/v016-actions-1184-metal.json).

Valintaruudun tarkat näyttökolmiot projisoidaan kerran vasta laatikkovedon
alkaessa. Tavallinen napsautus ei tee koko mallin projektiota. Mittaus ei
kata erittäin tiheän kolmiomallin osumavalinnan pahinta tapausta.

## V0.15 — yhteisen työkalupaneelin regressio, 4.10.2026

Sama M1 Pro / ANGLE Metal -kokoonpano ja 1 184 levyn toimintasarja:
siirron mediaani **16,7 ms**, p95 **18,4 ms**, **16 piirtokutsua**.
V0.14.1:n vastaavat luvut olivat 16,7 / 17,0 ms ja 16 piirtokutsua.
Mediaani säilyi noin 60 kuvassa/s; yksittäisen ajon pieni p95-ero ei yksin
osoita pysyvää muutosta. Valinta ei luonut uutta GPU-geometriaa.

Valinta 122 ms, siirron hyväksyntä 260 ms, Peru 283 ms, kopiointi
**2 368 osaan 378 ms**, tiedostolataus 46 ms ja uudelleenavaus 602 ms.
Kaikkien osien tarkka siirto ja muuttumattomat muut akselit tarkistettiin.
[Mittauksen tulos](benchmarks/v015-actions-1184-metal.json).

Kohdevalitsimen esikorostus lainaa osien olemassa olevaa näyttögeometriaa;
se ei tesselloi CAD-osia uudelleen. Mittaus koskee tavallista suuren valinnan
siirtoa, ei tuhansien päällekkäisten osien valitsinlistan pahinta tapausta.
Alla olevat laite-, malli- ja muistimittausten rajaukset pätevät edelleen.

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
