# Arkkitehtuuri — v0.7.1

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

V5:n auktoritatiivinen geometria on tarkka resepti ja sijainti, yhdistämisen
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
pinnan jaon kanssa. Piirtotason poiminta on erillään osan luontitavasta.
Normaalitilassa piirto luo aina uuden itsenäisen osan kutsumatta pinnanjakoa.
`editingBodyId` avaa yhden osan piirtomuokkaukseen; `surfaceMode=region`
jakaa vain kyseisen osan pintaa. Aloitus toisen osan pinnalta ei vaihda kohdetta:
hyväksyntä hylätään selkeällä viestillä, ellei käyttäjä valitse Uusi osa.
E/O ovat suoria operaatioita eivätkä muuta pysyvää muokkauskontekstia.
Avatussa kontekstissa valinta, E/O, siirto, kierto ja kumitus rajaavat kohteen;
viitepoiminta ja tartunnat käyttävät edelleen kaikkia näkyviä osia.
Muokkauskonteksti on väliaikainen, ei projektin tai undo-historian osa.
Lopeta muokkaus, Esc tai Valitse-työkalun tuplaklikkaus tyhjään päättävät sen; poistaminen, piilottaminen tai Hold sulkee
muokkauskelvottomaksi muuttuneen kohteen. Cut/Join edellyttää normaalitilaa.
Workerin vanha `allowUnsplit`-rajapinta säilyy yhteensopivana, mutta käyttöliittymä
ei enää päättele piirron kohdetta profiilin pinta-alasta.
Suorakulmion/ympyrän luonnos säilyy ensimmäisen napsautuksen jälkeen:
mousemove päivittää, toinen napsautus tai veto hyväksyy ja epoch/Esc peruu.
Numerolukot ja synkroniset luonnosviitteet ovat yhteisiä molemmille eleille. Cut vähentää kaikki työstökappaleet jokaisesta kohteesta;
Join yhdistää kaikki valitut osat ensimmäiseen kohteeseen. Roolien vaihto,
työstökappaleiden säilyttäminen ja historia käsitellään projektitasolla.

Offset siirtää tasopinnan ulkorajaa sisään ja aukkojen rajoja ulos OCCT:n
2D-offsetilla. Suorat kulmat käyttävät leikkaavaa liitosta. Tulos kulkee saman
pinnan jaon läpi kuin piirretty profiili, joten E ja läpileikkaus käyttävät yhtä
geometriapolkua. Epäkelpo tai erillisiksi alueiksi hajoava inset hylätään atomisesti.

Poista rajaus käyttää BRepin yhteisiä reunoja ja samansuuntaisia samantasoisia
pintapareja. `BodyMesh.boundaries` sisältää parin pintaviitteet ja yhteisen
rajan tesselloidut käyrät osoitusta varten. Pelkkä pintojen geometrinen
päällekkäisyys ei riitä: niiden pitää jakaa sama topologinen reuna.
Osoitus tarkistaa näkyvyyden ja Holdin ja korostaa molemmat yhdistyvät pinnat.
Worker tarkistaa parin uudelleen, kutsuu `ShapeUpgrade_UnifySameDomain`-operaatiota
ja suojaa kaikki muut reunat `KeepShape`-kutsuilla. Hyväksyntä vaatii yhden
pinnan vähenemisen, kelvollisen BRepin sekä säilyneet rajat, pinta-alan ja
tilavuuden. Näin muu tarkoituksellinen pinnanjako ei katoa samalla.
Tulos serialisoidaan normaaliksi BRepiksi; aiempaa työkaluhistoriaa ei tarvita.

Offsetin esikatselu käyttää samaa tarkkaa inset-laskentaa kuin hyväksyntä,
mutta palauttaa vain ääriviivan. Hiiripyyntöjä on enintään yksi laskennassa;
seuraavaksi suoritetaan viimeisin odottava arvo. Vanhentunutta vastausta ei
näytetä uuden pinnan tai työkalun päällä. Hiirisuunta määräytyy lähimmästä
pinnan reunasta; sisäisiä kolmioverkon reunoja ei käytetä.

Siirto kuljettaa varsinaista tartuntapistettä. Kopion esikatselussa alkuperäinen
pysyy näkyvissä. Hyväksyntä lisää itsenäisen osan uudella UUID:llä yhteen
transaktioon; peruminen ennen hyväksyntää ei muuta projektia. Tavallinen
valintaklikkaus valitsee objektin, kun taas E/O ja juuri jaettu alue käyttävät
pintaviitettä. Yläpalkin fullscreen-tila seuraa selaimen fullscreenchange-tapahtumaa.

V5 lisää kappaleen `locked`, `hidden` ja `groupId`-tiedot sekä nimetyt `groups`.
V1–V4 muunnetaan avatessa; vanhat osat ovat vapaita ja näkyviä. Näkymälle ja
sen tartunnoille annetaan vain näkyvät osat. Ryhmäpiilotus säilyttää osan oman
näkyvyystilan. Akselien tyyli ja nimitekstit tallentuvat projektin asetuksiin.

Kierto muuttaa tarkkaa BRepiä pivotin, yksikköakselin ja asteluvun avulla.
VertexRefs kartoittaa myös siirtyneet vanhat ankkurit tuloksen paikallisiin
koordinaatteihin. Kappaleeseen kiinnitettyjen apuviivojen suunta ja offset
kiertyvät mukana. Esikatselu käyttää samaa rotaatiota näyttömeshille;
hyväksyntä laskee CAD-tuloksen yhdessä transaktiossa.

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

Muistissa historia säilyttää enintään 100 undo-askelta. Selaintallennuksen
versioitu historiasnapshot sisältää nykyisen mallin sekä lähimmät past/future-
askeleet: enintään 20 yhteensä ja 8 MiB UTF-8-tekstiä. Vanhimmat askeleet
pudotetaan ensin. Aktiivinen projekti ja snapshot kirjoitetaan yhdessä
IndexedDB-transaktiossa. Kirjoitusjono estää hitaampaa vanhaa tallennusta
ylikirjoittamasta uudempaa mallia; vanhentuneet jonotyöt ohitetaan.
Tallennusvirheen jälkeen yritetään nykyistä projektia ilman historiasnapshotia,
jolloin käyttöliittymä kertoo historian puuttumisesta. Palautuksessa snapshotin
nykyisen mallin on vastattava aktiivista projektia täsmälleen ja kaikkien askelten
on läpäistävä skeematarkistus. Rikkinäinen, liian suuri tai eri malliin kuuluva
historia ohitetaan muuttamatta aktiivista projektia. V5-projektitiedosto ei sisällä
historiaa. Geometria varmennetaan workerissa ennen kutakin undo/redo-commitia.

## Topologia

Push/pullin toteutuva kokonaismitta haetaan valintahetkellä workerin `face-span`-pyynnöllä.
CAD-pinnan normaalin suuntainen suora leikataan tarkalla BRepillä, ja valintapisteestä
alkavan ensimmäisen yhtenäisen materiaaliosuuden pituus on nykyinen mitta.
Erillisiä solideja tai niiden välisiä tyhjiä kohtia ei lasketa mukaan.
Automaattivalinnassa reiän kohdalle osuva pinnan keskipiste korvataan pinnan
sisäpisteellä; käyttäjän osoittamaa pistettä ei siirretä huomaamatta.
Jälkimmäinen syöttötila muuntaa tavoitemitan siirtymäksi, joten geometriaoperaatio
ja tallennusformaatti säilyvät samoina. Uusi valinta tai peruminen mitätöi
vanhan mittausvastauksen. Syöttötilalla on synkroninen viite Enter/vapautus-kilpailun
estämiseksi. Tab voi vaihtaa kirjoitetun luvun merkityksen; hiirellä kenttää
vaihdettaessa nykyinen esikatselugeometria säilyy.

Tavallinen E-veto käyttää eleen alussa lukittua, kameran projektiosta laskettua
normaalin suuntaista näyttövektoria. Lähes katselusuunnan suuntainen normaali
käyttää pystysuuntaista hiiriliikettä ja paikallista mm/pikseli-suhdetta.
Laskenta ei vaihdu liikkuvan osoitinsäteen mukaan, mikä poistaa perspektiivin
lähes yhdensuuntaisten suorien singulariteetin. Shift kytkee pintakohdistuksen
päälle ja päivittää kohteen myös ilman hiiren liikettä. Vapautus alustaa vapaan
vedon hiiriankkurin ja perusmitan viimeiseen arvoon. Tyhjä/oma pinta ei muuta
hakutilan mittaa, eikä virheellinen kohde hyväksy elettä. Numerolukitus on etusijalla.

Pintakohdistus käyttää lähtöpinnan tarkkaa normaalia ja kohdepinnalle projisoitua
raycast-pistettä: siirtymä on `(kohde − lähtö) · normaali`. Yhdensuuntaiset
pinnat tulevat samalle tasolle; muussa tapauksessa kyse on poimitun pisteen
tasosta, ei pintojen kallistamisesta. Lähdepinta säilyy eleen ajan, ensimmäinen
klikkaus aloittaa ja toinen tai vedon vapautus hyväksyy. Kirjoitettu mitta
lukitsee syötön tartuntojen edelle. Hold estää lähteen muokkauksen mutta sallii
kohteen käyttämisen viitteenä.

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

Mitat tallennetaan kerran projektin dimension-taulukkoon. Lisää kokonaismitat
lisää puuttuvat akselimitat koko valinnalle yhdessä transaktiossa.
3D:n SVG-peite projisoi rajalaatikon ulkoreunat kameralla, pitää tekstin
pikselikoon samana ja siirtää päällekkäisiä mittalappuja ulospäin. Peite ei
kaappaa osoitintapahtumia. Arvot tulevat tarkasta mallista; valinnan ja
näkyvyyden muutokset päivittävät peitteen. Arkin sijoittelu jakaa päällekkäiset
mitat eri riveille ja ottaa annotaatioiden tilan mukaan sovitukseen. 3D:n
näkyvyysasetus ei vaikuta arkin mittoihin.

Osavärin vaihto päivittää valittujen kappaleiden color-kentän atomisesti.
Oma värivalitsin pitää välivärin paikallisena, kunnes käyttäjä hyväksyy sen,
jotta värin selaaminen ei täytä undo-historiaa.

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
akselilla. Sama akselinäppäin vapauttaa lukon; Esc päättää koko työkalun. Aloituspiste sulkee
muodon vain, jos myös rajoitettu päätepiste osuu aloitusverteksiin.
Mittatyökalussa Shift sallii vapaan kulman; Shift+R kytkee vapaan kierron
myös valmiille viivalle. Reunasta aloitettu apuviiva säilyttää reunan suunnan
ja saa pinnan tasossa kohtisuoran offsetin. Reunan viereinen tasopinta valitaan
ensimmäisestä vedosta pinnan puolelle. X/Y/Z rajoittaa offsetin akselille
muuttamatta viivan suuntaa; R/Shift+R muuttaa suuntaa erikseen.
Reunavalinta käyttää kohdistimen lähintä CAD-reunan pistettä, tarkistaa peittymisen
ja korostaa koko reunan; päällekkäisistä reunaprojektioista suositaan näkyvää.

Aktiivinen työkalu ja keskeneräinen luonnos ovat erillisiä tiloja. Hyväksyntä
nollaa luonnosviitteet ja lukot, luo uuden luonnostunnisteen ja jättää työkalun
odottamaan seuraavaa alkupistettä. Enter ja osoittimen vapautus eivät siten
hyväksy samaa luonnosta uudelleen. Esc tyhjentää luonnoksen ja valinnan.
Mittaikkuna on normaalisti sivupaneelin asettelussa. Otsikon pointer capture
siirtää sen fixed-sijaintiin; sovellustila säilyttää paikan työkalun vaihtuessa.
ResizeObserver ja ikkunan resize pitävät siirretyn paneelin ruudun sisällä.

Numerosyöttö lukitsee kirjoitetut kentät, Tab kiertää kenttiä.
Osoittimen vapautus ja Enter käyttävät samaa atomista hyväksyntää;
synkroniset luonnosviitteet estävät vanhan React-tilan tallentumisen.
Kynän itsensä leikkaava tai degeneroitunut ääriviiva hylätään ennen CAD-laskentaa.
Päällekkäisten kohteiden valintakierrätys ja erilliset muokattavat työskentelytasot
ovat jatkotyötä. Nykyinen piirtotaso voidaan poimia mistä tahansa tasopinnasta.

## Syvyys ja näkyvyys

Logaritminen syvyysbufferi ja mukautuva near/far tukevat suurta työtilaa.
Ruudukon shader käyttää samaa syvyysmuunnosta, derivaattoihin perustuvaa
reunapehmennystä ja 1/2/5-jaolla muuttuvaa askelta. Alinäytteistetyt viivat häivytetään.
Akselien viivaleveys ja origomerkki määritellään näytön koon mukaan. Tasoluonnokset piirretään
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

Apuviivan `length` määrittää edelleen viivan suunnan näkyvän perusosan.
`guideMeasurement` mittaa offset-apuviivassa lähtöankkurin ja siirretyn viivan
välin. Samat päät palvelevat 3D-tekstiä ja Viivat-listaa. `lineIntersection`
hylkää yhdensuuntaiset ja ristikkäiset, eri syvyydellä kulkevat 3D-suorat.
Tartunnat tutkivat vain kohdistimen lähellä olevien apuviivojen pareja.
Valinta ja muokkaus ovat erillisiä: viivan napsautus ei luo mittaluonnosta.

Ryhmän valinnainen `parentId` muodostaa hierarkian; tiedoston validointi hylkää
puuttuvat ja kiertävät viitteet. `groupAncestors` määrittää periytyvän näkyvyyden
ja Holdin. Osan omia lippuja ei muuteta ryhmän lipun mukana. Geometriatyökalut
ja työtilan pintapoiminta tarkistavat myös perityn Holdin.

`translateSelection` suorittaa siirron/kopioinnin yhdellä projektitransaktiolla.
Ryhmäkopio saa omat ryhmä- ja osatunnisteet, ja mitat sekä osiin sidotut
apuviitteet kohdistetaan kopioihin. Siirron esikatselu käyttää kaikkien
valittujen osien alkuperäisiä CAD-verkkoja yhteisellä siirtymällä. Tartunnat
jättävät siirrettävän valinnan omat pisteet pois, ellei kopiointitila ole päällä.
