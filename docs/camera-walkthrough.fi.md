# Kamerakierros ja animaation renderöinti — 13.11.2026

Tavoite on ohjattu esittely mallinnetun tilan sisällä: siirtymä tilasta toiseen,
nimetty pysähdys, yksityiskohdan esittely ja objektien liike samalla aikajanalla.
Toteutus käyttää Nivon nykyistä animaatio- ja renderöintipohjaa.

## Kokeile valmista kierrosta

1. Avaa tyhjän projektin **Kamerakierros · tilaesimerkki**, tai avaa
   `public/examples/kamerakierros.nivo` tavallisena projektina.
2. Avaa **Animaatio → Kamera & reitti**.
3. Valitse **Renderöity esikatselu → Toista**. Kierros kestää 23 sekuntia.
4. Valitse **Siirry sceneen** tai kelaa aikajanaa. Toisessa scenessä kamera
   zoomaa pöydän esineeseen. Liukuovi ja vedin liikkuvat erillisillä objektiraidoilla
   9–12 sekunnin kohdalla; kamera kulkee oven läpi sen avauduttua.
5. Pysäytä kuva ja valitse **Tarkenna pysähdyksissä**. Valitse 64, 256 tai
   1024 näytettä. **Tallenna PNG** tallentaa näkyvän tarkennetun kuvan;
   nopeassa tilassa se tuottaa 1920 px leveän materiaaliesikatselun.
6. Esc tai X sulkee esikatselun. Animaation sulkeminen palauttaa mallin
   perustilan ja kameraseurannan alussa tallennetun mallinnuskameran.

## Tee kierros omasta tilasta

- Luo animaatioklippi. Rajaa kamera normaalisti kiertämällä, panoroimalla ja
  lähentämällä näkymää. **Lisää nykyinen kuvakulma** tallentaa sen.
- Ensimmäinen piste tulee aikajanan nykyhetkeen. Seuraavat lisätään reitin
  loppuun: oletuksena 1,5 s pysähdys ja 3 s siirtymä. Saapumisaikaa voi muuttaa
  pisteen kentästä, jolloin pisteiden järjestys päivittyy.
- Nimeä piste esimerkiksi _Aula_, _Keittiö_ tai _Työtason liitos_.
  **Pysähdys 0 s** tekee tavallisen reittipisteen.
- Pisteen valinta avaa sen näkymän. Säädä näkymää hiirellä ja valitse
  **Korvaa nykyisellä näkymällä**, kun haluat muuttaa tallennettua rajausta.
- **Objektiivi** muuttaa polttoväliä, ei kameran paikkaa. Kohdistuslistasta
  voi valita mallin osan keskipisteen. Tarkat kameran ja katseen XYZ-kentät
  ovat avattavassa lisäosiossa; mitat ovat millimetrejä.
- **Yksityiskohtazoom** muuttaa polttoväliä ja katsesuuntaa pysähdyksen aikana.
  Valitse kohde ja loppupolttoväli. **Zoomin alku** lasketaan saapumisesta;
  **Zoomin kesto** määrää lähennyksen ajan. Molempien tulee mahtua pysähdykseen.
  Vanhoissa reiteissä zoom käyttää edelleen koko pysähdyksen. Useita yksityiskohtia varten lisää useita
  peräkkäisiä scenejä.
- **Valitse kohdistettava kohta mallista** aloittaa pintapisteen valinnan hiirellä.
  Zoomilla on oma vastaava painike. Osan keskipisteen voi edelleen valita listasta.
- **Muokkaa kameraa reitillä** palauttaa ulkopuolisen mallinnusnäkymän.
  Vedä näkyvää kameramerkkiä hiirellä: siirto tapahtuu katselusuuntaan nähden
  poikittaisella tasolla ja säilyttää kameran katsesuunnan. Kamera tallennetaan
  samaan sceneen; muutos on peruttavissa. XYZ-kentillä voi säätää kaikkia akseleita.
- **Seuraa kameraa** näyttää aikajanan kameran. Ota seuranta pois, kun haluat
  tarkastella koko reittiä ulkopuolelta. **Näytä reitti** näyttää kaarteen ja
  sen pisteet mallin päällä. Kameran toisto piilottaa reittiapuviivat.
- **Objektit**-välilehdellä toimii nykyinen osien ja ryhmien avainanimaatio.
  Kameran ja objektien ajat ovat samassa klipissä. Kameran pysähdys ei pysäytä
  objektin omaa animaatiota eikä muuta sen avainten ajoitusta.
- Tallenna tavallisella **Tallenna tiedosto** -toiminnolla. Reitti kulkee
  `.nivo`-projektissa; selaimen normaali automaattitallennus toimii myös.

## Toteutus ja suorituskyky

`model/cameraAnimation.ts` validoi ja evaluoi kameraraitaa. Pehmeä paikka
interpoloidaan centripetaalisella Catmull–Rom-käyrällä; siirtymien alku ja
loppu hidastetaan smoothstepillä. Katsesuunta interpoloidaan quaternionilla,
jotta vastakkaisiin suuntiin katsovien pisteiden väliin ei synny nollapituista
katsesuuntaa. Suora siirtymä on valittavissa esimerkiksi ahtaaseen käytävään.

Kamera kulkee pysähdysten kautta; tämä ei ole tasanopeuksinen kamera-ajo
kaaripituuden mukaan. Lisäpisteet ja pisteiden väliset ajat määräävät vauhdin.
Käyrä voi kaartaa suorien pistevälien ulkopuolelle. Reitti täytyy tarkistaa
seinien ja kulkuaukkojen kohdalla. Toistosilmukassa viimeinen piste kannattaa
asettaa ensimmäisen kohdalle, jos alun ja lopun pitää liittyä saumattomasti.

Nykyinen `createAnimationPreview` omistaa yhden kellon. Kamera ja objektit
päivittyvät siitä suoraan ilman React-renderiä, CAD-laskentaa, Undo-historiaa
tai automaattitallennusta joka ruudulla. Renderöity esikatselu käyttää
`createRenderScene`-toteutusta: olemassa olevat verkot ja materiaalit säilyvät,
objekteista muuttuvat vain matriisit. Taustalla oleva mallinnusnäkymä ei piirrä
kameran jokaista ruutua esikatselun päällekkäiseksi työksi.

Liikkeessä käytetään rasteriesikatselua. Säteenseuranta saa jatkua vasta, kun
sekä kamera että objektit ovat pysähtyneet. Geometrian BVH päivitetään tarvittaessa
objektin uuden asennon vuoksi, ei jokaisella liikkuvalla ruudulla. Pelkkä kameran
liike ei rakenna mallia uudelleen. Selaimen piilottaminen tauottaa esikatselun.
Kylmä shader-käännös voi kestää kymmeniä sekunteja; liikkeenaikainen kuva ei
ole samanlaatuinen kuin pitkään tarkentunut still-kuva.

Tekninen pohja: [Three.js CatmullRomCurve3](https://threejs.org/docs/pages/CatmullRomCurve3.html).
Renderöinti käyttää projektin lukittua WebGLPathTracer 0.0.26 -versiota;
[kirjaston uusi päähaara](https://github.com/gkjohnson/three-gpu-pathtracer)
on WebGPU-pohjainen eikä sitä vaihdettu tämän ominaisuuden mukana.

## Renderöi valmis animaatio

**Renderöity esikatselu → Renderöi animaatio · HD–4K** avaa vientiasetukset.

- HD 1280 × 720, Full HD 1920 × 1080, 2K DCI 2048 × 1080, QHD 2560 × 1440
  ja 4K UHD 3840 × 2160. Esikatselun kuvasuhde seuraa valintaa.
- 24, 25, 30 tai 60 fps sekä klipin sisällä oleva alku- ja loppuaika.
- 1–65 536 näytettä per ruutu ja valinnainen kohinanpoisto. Näytteiden
  kasvattaminen vähentää kohinaa; resoluutio lisää pikseleitä. Kumpikaan ei
  lupaa tiettyä laatua tai laskenta-aikaa kaikille materiaaleille ja valaistuksille.
- **Testrenderöi nykyinen ruutu** tallentaa aikajanan nykyhetken PNG:nä
  valitussa resoluutiossa ja laadussa. Arvioi kuvaa ennen pitkää renderöintiä.
- **Renderöi animaatio** laskee jokaisen ruudun täyteen näytemäärään.
  Kamera, zoom ja objektien/ryhmien tallennetut animaatiot käyttävät täsmälleen
  samaa aikaa. Mallin keskeneräiset asentoluonnokset tulee ensin tallentaa avaimiksi.
- MP4 käyttää selaimen H.264-koodausta korkealla laadulla. Tuki tarkistetaan
  valitulle resoluutiolle ennen renderöintiä. Chrome/Edge voi tallentaa suoraan
  valittuun tiedostoon; ilman tiedostotukea video ladataan lopuksi, enintään
  256 Mt pakattua videota muistissa. PNG on vaihtoehto, jos koodekkituki puuttuu.
- PNG-kuvasarja on häviötön 8-bittinen kuvavienti. Kansiotuen kanssa luodaan
  uusi alikansio ja kuvat kirjoitetaan yksitellen. Muuten latautuvat noin 64 Mt:n
  ZIP-osat, joissa on ruudut, ajoitusmanifesti ja FFmpeg-ohje. Selain saattaa
  pyytää sallimaan useita latauksia; pitkissä töissä suora kansiovienti on suositeltu.
- Keskeytys vapauttaa renderöintityön. Valmiit PNG-ruudut säilyvät, manifesti
  kertoo valmistuneen määrän. Keskeneräinen MP4 ei ole valmis video.

Renderöinti pitää välilehden näkyvissä; piilotettu välilehti tauottaa GPU-työtä.
Pitkän työn automaattista jatkamista selaimen sulkemisen jälkeen ei vielä ole.
Jäljellä oleva aika arvioidaan valmistuneista ruuduista ensimmäisen ruudun
alustuksen jälkeen. Arvio tarkentuu työn aikana, eikä ole laatutakuu.

Teknisesti yksi yksityinen tilannekuva ja yksi WebGL-renderöijä palvelevat koko
työtä. Materiaalit, tekstuurit ja ohjelmat säilyvät ruutujen välillä. Kamera-ajo
päivittää kameran; objektien liike päivittää myös geometrian BVH:n. Näytteet ja
kohinanpoiston historia nollataan jokaiselle ruudulle. Videon aikaleima on
ruutunumero / fps, joten GPU:n nopeus ei muuta videon nopeutta. Mediabunny 1.66.0
hoitaa videon pakkaamisen ja MP4-säiliön; sen lisenssi on mukana jakelussa.

## Rajaus ja seuraava vaihe

Ensiversio on kameraesittely. Siinä ei ole WASD-kävelijää, törmäysväistöä,
automaattista oviaukkojen hakua, kameran rullauskulmaa, liikkuvan kohteen
jatkuvaa seurantaa tai kameran GLB-vientiä. Zoomin kohde on
valintahetken maailmanpiste: myöhemmin siirtyvä objekti ei vedä kameraa mukanaan.

Seuraavia mahdollisia vaiheita ovat törmäysvaroitukset, jatkuva kohteenseuranta,
liike-epäterävyys, ruutujen välistä tietoa hyödyntävä kohinanpoisto ja renderöintityön
jatkaminen sulkemisen jälkeen. Korkeakaan näytemäärä ei yksin korvaa materiaalien,
valaistuksen ja sommittelun viimeistelyä.

## Varmennus

- 11 kameran yksikkökoetta: ajoitus, pysähdykset, zoom, vastakkaiset katsesuunnat,
  toistuvat paikat, suora siirtymä, epäkelpo data, projektituonti, historia ja esimerkki.
- Koko yksikkö-/geometriasarja: 864 hyväksyttyä, 6 ennestään ohitettua.
- Animaation 11 olemassa olevaa selainkoetta läpäisty; mukana GLB-objektianimaatio.
  Testien yläpalkkitoiminnot päivitettiin käyttämään myös nykyistä suppean näkymän valikkoa.
- Paikallinen Chrome-käyttöliittymäkoe: nimeäminen, lisäys, päällekkäisen ajoituksen
  hylkäys, poisto, tallennus, uudelleenavaus ja kameran palautuminen.
- Renderöintikoe: zoomin polttoväli välissä 51,53 mm (32 → 65), kamera paikallaan;
  oven siirtymä −2000 mm; PNG-vienti; säteenseuranta pysähdyksessä ja keskeytys liikkeessä.
  Renderin `sceneBuilds` pysyi yhdessä koko toiston ajan.
- Nopean esikatselun 240 peräkkäisen selainruudun kokeessa RAF-välin keskiarvo
  16,68 ms ja p95 16,80 ms 1440 × 960 -ikkunassa. Tämä osoittaa pienen esimerkin
  pysyvän näytön noin 60 Hz tahdissa; luku ei ole GPU:n puhdas laskenta-aika.
- Tarkennuksen käynnistyksen aikainen sulkeminen ja avaaminen: kolme kierrosta,
  ei JavaScript-virheitä tai jäljelle jääneitä renderöintikankaita. 1194 × 834
  -ikkunassa esikatselun vaakasuuntainen ylivuoto oli 0 px.
- Testilaitteena Windows / Chrome / ANGLE D3D11 / RTX 2060 SUPER, renderöintialue
  1242 × 560. Kylmässä kokeessa 8 säteenseurantanäytettä noin 35 s sisältäen
  shader-käännöksen. Muita testejä oli samanaikaisesti käynnissä, joten tämä ei ole
  eristetty suorituskykyvertailu eikä FPS-lupaus suurille asiakasmalleille.
- Kolme vanhaa testien Windows-WASM-polkuvirhettä korjattiin `fileURLToPath`-muunnoksella.
  Renderikirjaston ennestään olevat deprekaatio-/shader-varoitukset jäivät näkyviin;
  kamerakokeessa ei tullut JavaScript-virheitä.

Käyttöliittymäkuvat ja paikallisen ajon lokit: `output/playwright/camera-*.png`,
`camera-roundtrip.nivo`, `animation-regression.log`, `glb-regression.log` ja
`full-unit-tests.log`. Ne ovat paikallisia testiartefakteja, eivät julkaisun assetteja.

## Renderöinnin palaute ja nopeutus — 16.11.2026

Vienti näyttää nyt varsinaisen säteenseurantakuvan näytteiden kertyessä. Ensimmäinen
kuva ilmestyy ensimmäisen kokonaisen näytteen jälkeen. Siihen asti vaiheteksti
kertoo materiaalien lataamisesta, geometrian valmistelusta tai GPU-ohjelman
kääntämisestä. Kokonaisedistyminen, nykyisen ruudun näytteet, valmistuneiden
ruutujen määrä ja kulunut aika näkyvät myös vientiasetusten ollessa suljettuna.
Edellisen valmiin ruudun pikkukuva säilyy seuraavan ruudun laskennan aikana.
Valmis kuva jää näkyviin myös työn päättyessä tai keskeytyessä.

Laatuvalinnat:

| Valinta                  | Näytteitä / ruutu | Valon kimmokkeita | Kohinanpoisto |
| ------------------------ | ----------------: | ----------------: | ------------- |
| Nopea animaatio (oletus) |                64 |                 4 | Kyllä         |
| Tasapainoinen            |               256 |                 8 | Kyllä         |
| Tarkka                   |              1024 |                16 | Kyllä         |

Arvot voi muuttaa itse. Kimmokkeiden vähentäminen muuttaa myös kuvaa: epäsuora
valo, lasin läpi kulkeva valo ja peilit voivat jäädä tummemmiksi. Kohinanpoisto
ei korvaa puuttuvaa valaistusta eikä takaa yksityiskohtien säilymistä 64 näytteellä.
Se on nykyinen ohjauskuvia hyödyntävä spatiaalinen a-trous-suodatin, ei OIDN eikä
ruutujen välistä tietoa käyttävä temporaalinen suodatin. Tarkista aina testruutu.

**Lataa suorituskykyraportti** tallentaa työn jälkeen JSON-raportin. Se kertoo
resoluution, näytemäärän, BVH/näkymäpäivitysten ja kamerapäivitysten määrät,
tekstuurikartan varauksen, shader-käännökset sekä kahdeksan viimeisen ruudun
valmistelu-, näytteistys-, viimeistely- ja kirjoitusajat. GPU-aikoja raportoidaan
vain ajastinlaajennuksen ollessa käytettävissä; CPU-lähetysaika ei ole GPU-aikaa.
Tekstuurikartan tavumäärä ei ole renderöinnin koko VRAM-kulutus. Ensimmäisen
näytteen seinäkelloaika sisältää valmistelua ja komentojen lähettämistä.

GPU-työtä ei enää sidota näytön virkistystaajuuteen. Yksi rajattu erä pysyy
kerrallaan jonossa, ja selain saa vuoron lyhyen peruutettavan ajastimen kautta.
Kamera-ajo rakentaa näkymän/BVH:n kerran ja päivittää seuraaville ruuduille vain
kameran. Animoitu geometria päivitetään tarvittaessa. Näytteet kertyvät GPU:lla;
esikatselu käyttää suoraan samaa renderöintikangasta. Valmis pikkukuva kopioidaan
vain ruudun valmistuessa. PNG/MP4-vienti lukee vain valmiita ruutuja.

### Mitattu vertailu julkisella esimerkillä

Windows, Chrome, ANGLE D3D11, RTX 2060 SUPER. Malli
`public/examples/kamerakierros.nivo`, kamera-aika 1,8–1,9 s, kolme ruutua,
1280 × 720, 32 näytettä, kohinanpoisto. Alla kahden jälkimmäisen ruudun
keskimääräinen seinäkelloaika; ensimmäinen valmistelu on jätetty pois.

| Asetus                           | Sekuntia / ruutu |
| -------------------------------- | ---------------: |
| 16 kimmoketta, vanha RAF-ajastus |             8,37 |
| 4 kimmoketta, vanha RAF-ajastus  |             7,55 |
| 4 kimmoketta, uusi ajastus       |             4,98 |

Pelkkä ajastusmuutos lyhensi saman laadun aikaa noin 34 %. Kaikki kolme PNG:tä
olivat tavuilleen identtiset ennen ja jälkeen ajastusmuutoksen. Kimmokkeiden
vähentämiselle ei väitetä samaa kuvan säilymistä. Full HD / 64 näytettä / 4
kimmoketta vei samalla julkisella esimerkillä lämpimänä noin 23 s / ruutu.
Luvut ovat paikallisia lyhyitä mittauksia, eivät yleisiä nopeuslupauksia.

Myös käyttäjän erillinen tallennettu kamerakierros tarkistettiin paikallisesti.
Asiakasmallia, sen kuvia tai yksityisiä raportteja ei julkaista repositoriossa.
Suuren sisätilan GPU-laskenta voi edelleen kestää sekunteja näytettä kohti:
BVH-välimuisti, denoiser tai WebGPU-nimike eivät yksin takaa millisekunteja.
Kylmä GPU-ohjelman käännös voi yhä kestää kymmeniä sekunteja. Ensimmäinen
GPU-erä käyttää valmistelun odotusrajaa, myöhempi työ lyhyempää jumitusrajaa.
Odottaminen ja peruutus pysyvät näkyvissä.

Pysähdyksissä muuttumaton kamera ja geometria käyttävät edellistä valmista kuvaa.
Jokainen videoruutu kirjoitetaan oikealla aikaleimalla, mutta samaa kuvaa ei lasketa
uudelleen. Vertailu käyttää täsmälleen samoja kamera- ja projektiomatriiseja;
objektin liike, kameran liike tai zoom estävät uudelleenkäytön. Raportin
`reusedFrames` ja ruudun `reused` erottavat nämä lasketuista ruuduista. Tämä
nopeuttaa pysähdyksiä muuttamatta videon kestoa. Jäljellä olevan ajan arvio piilotetaan, kun pysähdysruutuja käytetään uudelleen:
halvan pysähdyksen jälkeen tuleva liikkuva osuus voi olla huomattavasti hitaampi.

Varmennus 16.11.: 873 yksikkökoetta hyväksytty, 6 ennestään ohitettua;
tuotantokäännös Pages-polulla läpäisty. Selainkokeissa varmistettiin valmistuvat
PNG-ruudut, MP4-vienti (kolme H.264-ruutua, 1280 × 720, 30 fps), molemmat
keskeytysvaiheet, tabletin leveys, pysähdysten uudelleenkäyttö ja tavallinen
kuvarenderöinti mallinnuksen jatkuessa. Uudelleenkäytetyt PNG:t olivat keskenään
tavuilleen samat. Koko kamerakierrosta ei renderöity loppuun; suorituskykyluvut
ovat lyhyistä mittausosuuksista. Rakennuksessa säilyvät ennestään olevat
suurten JavaScript-osien ja fflate-tuonnin varoitukset.
