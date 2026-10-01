# Arkkitehtuuri — v0.4

Tarkistettu 30.9.2026 npm-rekisteristä, pakettien rajapinnoista ja ajettavilla kokeilla.

## Tekninen valinta

| Osa                    | Versio  | Perustelu / lisenssi                                                            |
| ---------------------- | ------- | ------------------------------------------------------------------------------- |
| TypeScript             | 7.0.2   | Tiukka tyypitys projektirajalla ja workerissa. Apache-2.0.                      |
| React                  | 19.3.0  | Paneelit ja työkalutila, erillään 3D-renderöinnistä. MIT.                       |
| Vite                   | 8.3.1   | ESM-worker, WASM erillisenä resurssina. MIT.                                    |
| Three.js               | 0.186.1 | WebGL2, raycasting, kamerat ja kosketusnavigointi. MIT. npm-muokkaus 24.9.2026. |
| Replicad               | 1.1.0   | BRep-operaatiot, serialisointi ja HLR-projektio. MIT. npm-muokkaus 4.9.2026.    |
| replicad-opencascadejs | 1.1.0   | Single-threaded CAD-WASM omassa workerissa. LGPL-2.1-only.                      |
| Zod                    | 4.6.5   | Tiedostotuonnin ja transaktiorajan validointi. MIT.                             |

Lockfile lukitsee versiot. Kirjastot olivat tuoreesti päivitettyjä tarkistushetkellä;
ylläpidon jatkumista ei oleteta taatuksi. CAD-rajapinta on eristetty vaihtamista varten.

Ensisijaiset lähteet:

- [Replicadin integrointi ja worker-suositus](https://github.com/sgenoud/replicad/blob/main/packages/replicad-docs/docs/use-as-a-library.md)
- [Replicadin lähde ja lisenssi](https://github.com/sgenoud/replicad)
- [CAD-WASM-buildin lähde](https://github.com/sgenoud/replicad/tree/main/packages/replicad-opencascadejs)
- [Serialisoinnin rajapinta](https://replicad.pages.dev/docs/examples/serialization/)
- [Three.js](https://github.com/mrdoob/three.js)
- [OpenCascade.js](https://github.com/donalffons/opencascade.js)
- [OCCT-lisenssi](https://github.com/Open-Cascade-SAS/OCCT/blob/master/LICENSE_LGPL_21.txt)
- [OCCT-poikkeus](https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt)

## Vastuut

```text
src/model      tarkka lähdemalli, UUID:t, mitat, historia, yksiköt, tartunnat
src/cad        worker-protokolla, BRep, kelvollisuustarkistus, mesh ja HLR
src/viewport   Three.js, kamerat, pintavalinta ja osoitineleet, esikatselu
src/drawing    ortografisen CAD-projektion sijoitus fyysiselle SVG-arkille
src/storage    IndexedDB, projektitiedostot ja lataus
src/useEditor  atominen muutos, vanhojen vastausten hylkäys, historia, tallennus
src/App        työkalutila, paneelit, käyttöohjeet
```

V4:n auktoritatiivinen geometria on tarkka resepti ja sijainti, yhdistämisen
litistetty lähdejoukko tai serialisoitu OCCT-BRep. Tasomainen kynämuoto voi
sisältää paikallisia 3D-pisteitä. Worker rakentaa ja tarkistaa geometrian;
näyttöverkko on sen johdannainen. Yleisen tasopinnan push/pull pursottaa
valitun CAD-pinnan normaalinsa suuntaan ja yhdistää tai vähentää prisman.
Laatikon pintamuutokset ja XY-pursotuksen pohja/kansi säilyttävät reseptin.
Muut muutokset tallentuvat paikallisena BRepinä samoilla kappaleen UUID:llä
ja värillä. Muokattava operaatiohistoria on jatkotyötä.

Profiili sisältää suorakulmion, tarkan ympyrän/ellipsin tai monikulmion sekä
kohtisuoran piirtokehyksen ja etumerkillisen paksuuden. Aloitus valitulta
tasopinnalta lukitsee piirtotason myös vinoilla pinnoilla. Raycast-osuma
projisoidaan CAD-pinnan tarkalle tasolle; näyttömeshin float32-normaalia ei
käytetä CAD-tason määrittelyyn. Rajat lasketaan OCCT:n AddOptimal-operaatiolla
ilman kolmioverkkoa tai toleranssilaajennusta, myös kaareville pinnoille.

Pintaan piirretty profiili leikataan valitulla pinnalla ja jaetaan
BRepAlgoAPI_Splitterillä. Alue tunnistetaan uudelleen tallennetusta BRepistä,
jotta E kohdistuu sisäalueeseen. Paksuus voidaan toteuttaa samassa transaktiossa
pinnan jaon kanssa. Cut vähentää kaikki työstökappaleet jokaisesta kohteesta;
Join yhdistää kaikki valitut osat ensimmäiseen kohteeseen. Roolien vaihto,
työstökappaleiden säilyttäminen ja historia käsitellään projektitasolla.

## Atominen laskenta ja resurssit

Validointi → ehdokasprojekti → worker → geometrian kelvollisuus → projektin ja
meshien yhteinen commit → historia → automaattitallennus.
Virhe säilyttää edellisen projektin. Undo/redo vaihtaa historiaa vasta ehjän
geometrian valmistuttua.
Transaktio voi ottaa asynkronisen ehdokasprojektin rakentajan: pintamuutoksen
CAD-operaatio ja sitä seuraava mallin rakentaminen kuuluvat samaan revisioon.
Peruminen tai virhe kummassakaan vaiheessa säilyttää aiemman projektin.

Worker käsittelee pyynnöt jonossa. Pääsäie hyväksyy vain nykyisen revision
vastauksen. Peruminen kasvattaa revisiota ja pysäyttää workerin. Uusi toiminto
käynnistää uuden ytimen. 45 sekunnin aikaraja katkaisee jumittuneen laskennan.

Geometria välimuistitetaan UUID:n, reseptin ja sijainnin perusteella.
Jokainen objekti tuottaa yhden Three.Meshin sekä erillisen reunaviivaesityksen.
Vanha Yhdistä-pikatoiminto korvaa valitut lähteet uudella UUID:llä ja yhdellä CAD-tuloksella;
undo palauttaa lähteet. Erilliset solidit voivat olla saman objektin compoundissa.
Muuttumattomia kappaleita ei lasketa uudelleen. Korvatut BRep- ja GPU-resurssit
vapautetaan. CAD-operaatiot käyttävät omia erikseen rakennettuja muotoja,
eivät worker-välimuistin omistamia olioita. Välitulokset ja compoundien
osamuodot vapautetaan operaation jälkeen. Näkymää renderöidään muutoksissa,
ei jatkuvana animaationa paikallaan ollessa.

Tallennusvirhe näkyy käyttäjälle ja malli säilyy muistissa. Ladattava tiedosto
ei vaadi File System Access API:a. Automaattitallennus ei ole varmuuskopio.

## Topologia

Kappaleella on UUID. Nykyisen suorakulmaisen pursotuksen pinnat ovat `x:min`,
`x:max`, `y:min`, `y:max`, `z:min`, `z:max`. CAD-meshin faceGroup liitetään
CAD-pintaan hashCode/faceId:n kautta. Sen mukana välitetään CAD-pinnan indeksi,
ulospäin osoittava normaali, keskipiste ja tasomaisuustieto. Laatikon
semanttinen pintanimi päätellään normaalista. Muiden mallien `surface:n` on
vain hetkellinen valinta nykyiseen geometriaan, ei pysyvä topologiaviite.

Mittaus viittaa UUID:hen, akseliin ja min/max-rajoihin. Uudelleenkolmiointi tai
mitan muuttuminen ei katkaise viitettä. Poistettu kappale jättää näkyvän
rikkoutuneen mittaviitteen ja estää viennin, kunnes viite on korjattu/peruttu
tai mitta poistettu. Viitettä ei siirretä hiljaisesti toiseen kappaleeseen.

Apuviiva viittaa kappaleen UUID:hen ja verteksiin tai reunan kahteen
verteksiin ja niiden väliseen parametriin. Laatikossa käytetään
semanttista kulmaa, monikulmiossa pisteindeksiä ja pohja/kansi-tietoa.
Yhdistetyssä osassa ankkuri on paikallinen CAD-verteksi; siirrot säilyttävät sen.
Pinnan jako, push/pull ja Cut/Join kartoittavat muuttumattomat CAD-verteksit
`vertexRefs`-taulukkoon. Join siirtää kulutettujen osien säilyneet ankkurit
tuloskappaleeseen. BRepin `topologyId` estää vanhan ankkurin käytön ilman
tarkistettua vastinetta. Reuna-ankkurin piste tarkistetaan tuloksen todellisilta
suorilta reunoilta. Viivat-lista näyttää puuttuvan viitteen.
Tartuntapisteet otetaan CAD-reunoista, eivät rajalaatikon kuvitteellisista kulmista.
Kappaleen keskipiste tarkoittaa rajalaatikon keskipistettä.

Muuttuneiden tai poistuneiden verteksien automaattinen uudelleenkohdistus
ja pysyvät pintaviitteet ovat jatkotyötä. Mesh-tuonti saa oman tyypin.

## Piirustus ja kosketus

OpenCascaden hidden-line-removal käsittelee koko kappalejoukon. Näkyvät ja
piilossa olevat viivat erotetaan; renderöintikolmiot eivät siirry piirustukseen.
Kukin piirustus käyttää erikseen määriteltyä ortografista kameraa.
Rakentamisen apumuodot jätetään projektiosta pois; piirrosroolin kappaleet
annetaan HLR:lle reunayhdistelmänä, jolloin ne eivät peitä varsinaisia osia.
Nimetty osa on tässä vaiheessa itsenäinen kappale, ei linkitetty instanssi.

SVG:n 297 × 210 mm ja vastaava viewBox tekevät yhdestä SVG-yksiköstä yhden
paperimillimetrin. Mallipolut skaalataan `1/mittakaava`. Mittateksti (3,2 mm)
ja mittaviiva (0,18 mm) ovat paperiyksiköissä mallimuunnoksen ulkopuolella.
600 mm → 1:5 → 120 mm paperilla tarkistetaan automaattisesti.

Pointer Events kattaa hiiren, kosketuksen ja kynän. Napautus valitsee.
Yksi sormi käyttää työkalua; toinen sormi keskeyttää muokkausvedon ja vaihtaa
panorointiin/zoomaukseen. Navigoi-tila tarjoaa orbitoinnin yhdellä sormella.
Keskeiset painikkeet ovat kosketuksella vähintään 44 CSS-pikseliä.
Tartunnat suosivat todellisia verteksiä ja reunojen keskipisteitä ennen
apuviivoja, viitteen suuntia ja 45° ennakointia. Hystereesi vähentää värähtelyä.
Shift poimii juuri haetun pisteen ja vapautus poistaa viitteen; kosketuksella
viite poimitaan painikkeella. Kesken kynän viivan Shift lukitsee nykyisen
piirtosuunnan. Toinen piste, reuna tai pinta antaa pituuden projisoimalla
poimitun pisteen lukitulle suoralle. X/Y/Z käyttää samaa projektiota kiinteällä
akselilla. Esc vapauttaa lukon säilyttäen luonnoksen. Aloituspiste sulkee
muodon vain, jos myös rajoitettu päätepiste osuu aloitusverteksiin.
Mittatyökalussa Shift sallii vapaan kulman; Shift+R kytkee vapaan kierron
myös valmiille viivalle. Reunasta aloitettu apuviiva säilyttää reunan suunnan
ja saa kohtisuoran offsetin, kunnes käyttäjä kiertää sen tai valitsee akselin.

Numerosyöttö lukitsee kirjoitetut kentät, Tab kiertää kenttiä.
Osoittimen vapautus ja Enter käyttävät samaa atomista hyväksyntää;
synkroniset luonnosviitteet estävät vanhan React-tilan tallentumisen.
Kynän itsensä leikkaava tai degeneroitunut ääriviiva hylätään ennen CAD-laskentaa.
Päällekkäisten kohteiden valintakierrätys ja erilliset muokattavat työskentelytasot
ovat jatkotyötä. Nykyinen piirtotaso voidaan poimia mistä tahansa tasopinnasta.

## Syvyys ja näkyvyys

Kameran near/far mukautuvat mallin rajapalloon ja kameran etäisyyteen. Tämä
parantaa syvyysbufferin tarkkuutta suurissa malleissa. Tasoluonnokset piirretään
peittävinä, varjotaso ei kirjoita syvyyttä ja kappaleiden itsevarjostus on pois.
Pinnan hover-korostus muuttaa olemassa olevan materiaalin emissive-väriä,
joten samaan tasoon ei lisätä kilpailevaa korostuspintaa.

Apuviivat käyttävät normaalisti syvyystestiä. Projektin tai yksittäisen
viivan x-ray poistaa sen kyseisiltä viivoilta; myös mittalapun peittyminen
noudattaa asetusta. Tartunta ja valinta käyttävät CAD-pisteitä ja -reunoja.

## Tuotantopaketti ja kirjaston vaihto

WASM on erillinen resurssi (`replicad-opencascadejs/wasm?url`). Single-threaded-
build ei vaadi cross-origin-isolation-otsakkeita. Paketti on noin 23 Mt,
gzip noin 7,3 Mt: ensilataus hitaalla yhteydellä on todellinen rajoite.
Tuotantopalvelimella kannattaa käyttää gzip/Brotli-pakkausta ja versioitujen
assetien pitkäikäistä välimuistia.

Vite ulkoistaa CAD-loaderin Node-haaran `node:module`-tuonnin. Selain ei suorita
sitä haaraa; tuotantopaketin selaintesti tarkistaa tämän käytännössä.

WASM:n lisenssit, lähdeversio ja build-konfiguraatio ovat
`public/licenses/NOTICE.txt`-tiedostossa. Muokatun kirjaston voi rakentaa
upstreamin Docker/ytt-konfiguraatiolla, korvata npm-paketin omalla buildilla tai
vaihtaa workerin init/WASM-tuonnit ja ajaa `npm run build` uudelleen.
Sovelluksen lisenssi sallii kirjaston vaihtamisen ja muokkaamisen.

## Mitattavat suorituskykytavoitteet

Referenssit: M1 Pro / 16 Gt / macOS 26.2 / Chromium; fyysinen iPad/Safari on
vielä sovittava ja testattava. Testimallit ovat kuuden levyn kaappi ja 200
600 × 400 × 18 mm levyä.

Tavoite on noin 60 fps tietokoneella ja vähintään 30 fps tabletilla navigoitaessa.
Näitä ei ole vielä mitattu saavutetuiksi. Nyt mitataan 200 osan worker-laskenta.
Komponenttien jaettu geometria, GPU-instanssitus, tekstuuribudjetit ja fyysisen
tabletin muisti-/fps-profiilit kuuluvat myöhempiin vaiheisiin.
