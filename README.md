# Nivo

**Ideasta mitoitettuun muotoon.** Selaimessa toimiva avoimen lähdekoodin
3D-suunnittelutyökalu kalusteille, rakennusosille ja tiloille.

Versio 0.4 tuo pintaan piirtämisen, tarkat ympyrät ja ellipsit, rajattujen alueiden
syvennykset ja läpireiät sekä usean kappaleen Cut/Join-työkalun.
Versio 0.4.1 lisää push/pullin lopullisen mitan: 652 mm osan voi muuttaa suoraan
550 mm pituiseksi laskematta erotusta. Vihreä mittaviiva näyttää jäljelle jäävän osuuden.
OpenCascade laskee tarkan geometrian Web Workerissa. Three.js näyttää siitä
johdetun verkon; projektin mitat eivät riipu renderöintikolmioista.

![Nivon mallinnustyötila ja esimerkkikaappi](docs/images/nivo-workspace.png)

## Käynnistä

Node.js 22.12+ (testattu Node 24:llä).

```sh
npm ci
npm run dev
```

Avaa **http://127.0.0.1:5173** tai terminaalin ilmoittama osoite.
Sovellus ei tarvitse käyttäjätiliä, palvelintietokantaa tai API-avaimia.
Kaikki laskenta ja projektitallennus tapahtuvat selaimessa. Riippuvuuksien
asennus tarvitsee verkkoyhteyden; paikallinen sovellus ei käytä ulkoisia
fontteja, CDN-kirjastoja tai laskentapalveluja.

```sh
npm run build       # tyyppitarkistus ja dist/
npm run preview     # tuotantopaketin paikallinen esikatselu
```

## Ensimmäinen työnkulku

1. Piirrä suorakulmio XY-tasolle vetämällä tai kirjoittamalla tarkat mitat.
2. Enter tai vedon päättäminen hyväksyy luonnoksen. Paina **E**, osoita pintaa
   ja vedä sille paksuus. Samalla työkalulla voi muokata kappaleen muitakin tasopintoja.
3. Valitse kappale tai pinta, siirrä, kopioi ja poista kappaleita.
4. Tartu verteksiin, reunojen keskipisteisiin, apuviivoihin tai 10 mm ruudukkoon.
   Hae toisen osan keskipiste kohdistimella ja pidä Shift pohjassa: pisteestä
   lähtevät suuntalinjat ohjaavat piirtämistä ja siirtoa.
5. Vaihda perspektiivin ja rinnakkaisprojektion välillä. Käytä etu-, sivu-, ylä-
   ja 3D-näkymiä sekä sovita valinta näkymään.
6. Avaa **Mittakuva**, valitse kappale ja lisää leveys-, syvyys- tai korkeusmitta.
   Mitat seuraavat kappaleen muutoksia.
7. Vie A4-vaaka-arkki SVG:nä valitussa fyysisessä mittakaavassa. Näkyvät ja
   piilossa olevat viivat lasketaan CAD-geometriasta.
8. Peru ja palauta muutoksia. Lataa `.nivo`-tiedosto ja avaa se uudelleen.

Mittasyöttö hyväksyy `600`, `18 mm`, `1,8 cm`, `2,4 m` ja siirroissa negatiiviset
arvot. Oletusyksikkö on millimetri ja Z-akseli osoittaa ylöspäin.
Automaattitallennus palauttaa työn samassa selaimessa. **Lataa myös oma
projektitiedosto:** selaimen tallennustila ei ole varmuuskopio.

Tyhjästä työtilasta voi avata **600 × 800 × 560 mm esimerkkikaapin**. Sen kuusi
levyä ovat itsenäisiä osia. Esimerkissä ei vielä ole ovea tai linkitettyjä
komponentteja.

## Piirtämisen perustyökalut

- **Pintaan piirtäminen:** pidä Muoto-valikon **Piirrä kappaleen pinnalle** päällä.
  Aloita suorakulmio, ympyrä tai kynämuoto kappaleen tasopinnasta. Ensimmäinen
  piste valitsee piirtotason; myös pysty- ja vinopinnat toimivat. Paksuus **0**
  jakaa pinnan ja valitsee rajatun alueen. Paina E ja vedä vain tätä aluetta.
  **Leikkaa läpi** tekee läpireiän; **Poimi syvyys pinnasta** asettaa siirtymän
  toisen pinnan osoitetusta pisteestä.
- **Ympyrä (C):** vedä keskipisteestä säde tai kirjoita halkaisija. Muoto-valikosta
  saa myös ellipsin kahdella halkaisijalla ja säännöllisen 3–64-sivuisen monikulmion.
  Kynällä voi tehdä muun tasomaisen suljetun ääriviivan. Ympyrät ja ellipsit ovat
  tarkkoja CAD-käyriä.
- **Muodon ominaisuudet:** anna nimi, mitat ja paksuus samassa valikossa.
  Pintaan liitetyn mallinnettavan muodon positiivinen paksuus lisää materiaalia,
  negatiivinen tekee syvennyksen. Muut muodot syntyvät itsenäisinä objekteina.
  **Rakentamisen apumuoto** näkyy sinisinä ääriviivoina ja tarjoaa tartunnat;
  se ei tule mittakuvaan. **Piirros** näkyy ääriviivoina myös mittakuvassa.
  **Nimetty osa** on itsenäinen osa; kopiot eivät ole linkitettyjä komponentteja.

- **Push / pull (E):** pinnan korostus seuraa kohdistinta. Paina ja vedä pintaa
  normaalinsa suunnassa tai valitse pinta, paina E ja kirjoita siirtymä. Positiivinen
  arvo vetää ulospäin, negatiivinen työntää sisään. Toimii laatikon kaikilla kuudella
  pinnalla, kynämuodoilla ja yhdistettyjen osien tasopinnoilla.
- **Lopullinen mitta:** push/pull näyttää siirtymän ja lopullisen mitan.
  652 mm osassa siirtymä `−150` jättää 502 mm. Paina Tab: sama luku muuttuu
  lopulliseksi mitaksi 150 mm, ja siirtymäksi lasketaan −502 mm. Shift+Tab
  vaihtaa takaisin. Kenttää napsauttamalla voit syöttää lopullisen mitan suoraan.
  Suurempi mitta pidentää osaa; vastapinta säilyy paikallaan myös vastakkaisilta
  sivuilta muokattaessa. Etumerkitön siirtymä seuraa vedon suuntaa (ilman vetoa
  ulospäin), `+` ja `−` määräävät suunnan erikseen. Lopullinen mitta on aina
  positiivinen; kokonaan läpi leikkaamiseen on oma painike.
  Vihreä mittaviiva kulkee ensimmäisestä vastapinnasta uuteen pintaan.
  Syvennyksessä voi näin jättää esimerkiksi 5 mm materiaalia. Vaihtelevan
  paksuuden osassa mitta koskee osoitettua kohtaa ja valitun pinnan normaalin suuntaa.
  Tyhjä tila tai erillinen solidi vastapinnan takana ei kasvata tätä mittaa.
- **Kynä:** aseta verteksit näkymän tasolle tai tartu mallin pisteisiin. X/Y/Z
  lukitsee akselin. Shift lukitsee aloitetun viivan suunnan: toisen pisteen
  napsautus projisoi sen lukitulle viivalle ja määrää pituuden. Esimerkiksi
  suorakulmion kolmannen sivun pituuden voi poimia ensimmäisestä pisteestä.
  Vapauta Shift ja sulje muoto tarttumalla aloitusverteksiin. Myös pysty- ja
  vinotasot käyvät, kun kaikki suljettavan muodon pisteet ovat samalla tasolla.
  Numeroilla annetut X/Y/Z-siirtymät ovat suhteessa edelliseen pisteeseen;
  lukitussa suunnassa syötetään yksi pituus. Enter lisää tarkan pisteen tai sulkee muodon.
- **Mittatyökalu:** ensimmäinen painallus aktivoi apuviivan. Toinen painallus
  avaa valinnan apuviivan ja vapaan mittaviivan välillä. Apuviiva alkaa kappaleen
  verteksistä tai reunasta. Reunasta vetäminen tekee reunan suuntaisen apuviivan
  halutulle etäisyydelle. Siihen voi tarttua myös jatkeen kohdalta. Vapaa mittaviiva näyttää
  kahden pisteen etäisyyden. Vedä tai napsauta alku- ja loppupisteet.
- **Apuviivan suunta:** oletuksena 45° suunnat; X/Y/Z lukitsee akselin, Esc vapauttaa.
  R kiertää 45°, Shift+R käynnistää vapaan kierron. Kulman, pituuden tai reunaetäisyyden
  voi kirjoittaa. Valmista viivaa voi valita näkymästä tai Viivat-listasta ja kiertää.
- **Apuviivan näkyvyys:** sininen katkoviiva peittyy normaalisti kappaleen taakse.
  Viivat-listan x-ray näyttää valitun viivan kappaleiden läpi. Näkymän asetuksista
  saa x-rayn kaikille apuviivoille. Molemmat asetukset tallentuvat projektiin.
- **Kelluva mittaikkuna:** numero aloittaa ensimmäisestä kentästä, Tab vaihtaa
  kenttää, Enter hyväksyy. Hiiren vapautus hyväksyy vedon. Kirjoitetut mitat eivät
  muutu hiiren liikkeestä. Kenttää voi valita myös napsauttamalla.
- **Erilliset osat:** jokaisella objektilla on oma mesh. Monivalinta tai
  Shift/Ctrl/Cmd-napsautus valitsee useita osia. Yhdistä tekee niistä yhden
  CAD-kappaleen ja meshin; päällekkäiset tilavuudet yhdistyvät. Peru palauttaa
  erilliset osat. Yhdistäminen vaatii paksuuden.

![Kelluva mittaikkuna ja kirjoittamalla lukitut mitat](docs/images/nivo-input.png)

![652 mm osan lopullinen mitta 550 mm ja automaattisesti laskettu −102 mm siirtymä](docs/images/nivo-final-size.png)

![Kolmannen kynäviivan suunta lukittuna, 200 mm pituus poimittu ensimmäisestä pisteestä](docs/images/nivo-inference.png)

## Ohjaus

![Pintaan piirretty ympyrä ja E-työkalulla leikattu läpireikä](docs/images/nivo-surface.png)

**Cut ja Join:** avaa **Muotoile (B)** tai muotovalikon Toiminto-kenttä.
Valitse ensin **Kohteet (Target bodies)** ja sitten **Työstökappaleet (Tool bodies)**
listasta tai näkymästä. Kumpikin joukko voi sisältää useita tilavuuskappaleita.
Sininen korostaa kohteet, punainen työstökappaleet. **Vaihda keskenään** kääntää
leikkauksen suunnan. **Säilytä työstökappaleet** on oletuksena päällä.

Cut vähentää kaikkien työstökappaleiden tilavuuden jokaisesta kohteesta. Join
yhdistää molemmat joukot yhdeksi osaksi; erilliset soliditkin sallitaan.
Undo palauttaa koko operaation, myös poistuneet lähteet. Ympyräpursotus sopii
lieriöreiän leikkuriksi, ellipsi soikeaan läpäisyyn ja kynämuoto vapaaseen ääriviivaan.
Paksuudettomat luonnokset eivät kelpaa. Jos leikkurit eivät osu kohteisiin,
sovellus ilmoittaa siitä ja säilyttää lähteet. Kokonaan leikattu kohde poistuu;
sen mitat jäävät rikkoutuneiksi viitteiksi, kunnes ne poistetaan tai toiminto perutaan.

![Kaksi kohdelevyä ja kaksi sylinterimäistä työstökappaletta Cut-valikossa](docs/images/nivo-cut.png)

- Napautus valitsee. Työkalun yhden sormen veto hyväksytään sormen noustessa.
  Kosketuksella **Poimi viite** ja pisteen napautus korvaavat Shiftillä poimimisen.
- Kahden sormen ele panoroi ja zoomaa. **Navigoi**-tilassa yksi sormi kiertää.
- Hiiren oikea painike kiertää, keskipainike panoroi ja rulla zoomaa.
  Navigoi-tilassa myös vasen painike kiertää.
- V = valitse, R = suorakulmio (apuviivaa muokattaessa kierto), E = push/pull, M = siirrä, K = kynä,
  C = ympyrä/muut muodot, B = Muotoile (Cut/Join), T = mittatyökalu, H = navigoi.
  X/Y/Z lukitsevat siirron, kynän tai apuviivan akselin. Enter hyväksyy.
  Esc vapauttaa ensin suuntalukon; ilman lukkoa se peruu työkalun.
  Ctrl/Cmd+Z peruu, Ctrl/Cmd+Shift+Z palauttaa.
- Keskeiset toiminnot löytyvät painikkeista ilman näppäimistöä.

## Tarkistukset

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
NIVO_PREVIEW=1 npm run test:e2e
npm run format:check
```

Geometriatestit käyttävät oikeaa WASM-ydintä. Selaintestit kattavat työpöytäkoon
ja Chromiumin kosketusemuloinnin. Fyysistä iPadia/Safaria ei ole vielä testattu.
[Testiraportti](docs/validation.md) kuvaa tarkistukset ja rajat.

## Rajaus ja jatko

V0.4 tukee suorakulmioita, ympyröitä, ellipsejä, tasomaisia kynämuotoja,
tasopintojen jakoa ja push/pullia sekä Cut/Join-operaatioita. Kaarevalle pinnalle
piirtäminen ja kaarevan sivupinnan push/pull eivät ole mukana.
Apuviivoihin tartunta edellyttää samaa piirtotasoa;
haettu viitepiste projisoidaan piirtotasoon. Reunan tartunta tukee suoria CAD-reunoja.
Yleinen pintamuokkaus tallentaa tarkan BRep-geometrian. Ennallaan säilyvät
CAD-verteksit säilyttävät viitteensä; poistuneet kohteet näytetään rikkoutuneina.
Join siirtää säilyvät lähdeviitteet tuloskappaleeseen. Siirtyvien tai muuttuvien
topologiakohteiden yleinen nimeäminen on jatkotyötä.
Kappaleiden kierto, tarkka kopiointi, mesh-tuonti, layerit, ryhmät,
linkitetyt komponentit, pintamateriaalit, scenet sekä PDF-,
STEP-, STL- ja GLB-vienti ovat seuraavien vaiheiden töitä.

Piirustus sisältää yhden ortografisen näkymän ja osien kokonaismittoja. Monien
mittaviivojen sijoittelu, useat näkymät ja leikkaukset kuuluvat vaiheeseen 6.
**Käytettävyys ja perustyökalut ovat seuraavien vaiheiden etusijalla.**
Layerit, ryhmät ja komponentit seuraavat toimivaa mallinnuksen perustaa.

- [Alkuperäinen määrittely](docs/requirements.fi.md)
- [Arkkitehtuuri ja päätökset](docs/architecture.md)
- [Projektiformaatti v4](docs/project-format.md)
- [Toteutusvaiheet](docs/roadmap.md)

## Lisenssi

Nivon oma koodi: [MIT](LICENSE). Replicad ja Three.js: MIT.
OpenCascade.js/WASM: LGPL-2.1; OCCT sisältää oman lisenssipoikkeuksensa.
[Kirjastojen lisenssit ja lähdelinkit](public/licenses/NOTICE.txt) ovat mukana
myös tuotantopaketissa.
