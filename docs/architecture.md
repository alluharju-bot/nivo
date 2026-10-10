# Arkkitehtuuri — v0.14.0

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
src/render     erillinen esitysnäkymä, fyysiset materiaalit, studiovalo ja PNG
src/drawing    ortografisen CAD-projektion sijoitus fyysiselle SVG-arkille
src/storage    IndexedDB, projektitiedostot ja lataus
src/useEditor  atominen muutos, vanhojen vastausten hylkäys, historia, tallennus
src/App        työkalutila, paneelit, käyttöohjeet
```

V7:n auktoritatiivinen geometria on tarkka resepti ja sijainti, yhdistämisen
litistetty lähdejoukko tai serialisoitu OCCT-BRep. Tasomainen kynämuoto voi
sisältää paikallisia 3D-pisteitä. Worker rakentaa ja tarkistaa geometrian;
näyttöverkko on sen johdannainen. Yleisen tasopinnan push/pull pursottaa
valitun CAD-pinnan normaalinsa suuntaan ja yhdistää tai vähentää prisman.
Laatikon pintamuutokset ja XY-pursotuksen pohja/kansi säilyttävät reseptin.
Muut muutokset tallentuvat paikallisena BRepinä samoilla kappaleen UUID:llä
ja värillä. Reunakäsittelyllä on muokattava lähde; yleinen operaatiohistoria on jatkotyötä.

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
lähes yhdensuuntaisten suorien singulariteetin. Shift kytkee piste-/pintakohdistuksen
päälle ja päivittää kohteen myös ilman hiiren liikettä. Jos E on jo valinnut
osoitetun pinnan, Shift käynnistää eleen siitä ilman uutta lähtöklikkausta. Vapautus alustaa vapaan
vedon hiiriankkurin ja perusmitan viimeiseen arvoon. Tyhjä/oma pinta ei muuta
hakutilan mittaa, eikä virheellinen kohde hyväksy elettä. Numerolukitus on etusijalla.

Kohdistus käyttää samaa näkyvyyden tarkistavaa näytön pistehakua kuin muut
työkalut: CAD-kulma, keskipiste, reuna, apuviiva ja viimeisenä tasopinta.
Lähdeosan oman liikkuvan tason pisteet ja osan keskipiste suodatetaan ennen
valintaa; muiden osien samantasoiset pisteet ovat sallittuja.
Kohdistus käyttää lähtöpinnan tarkkaa normaalia ja poimittua CAD-/raycast-pistettä: siirtymä on `(kohde − lähtö) · normaali`. Yhdensuuntaiset
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
OrbitControlsin kohdistinzoomaus toimii perspektiivissä ja ortografisessa
näkymässä; kosketus käyttää kahden sormen keskipistettä. `cameraNavigation`
laskee zoomin työskentelykeskuksen näkyvän valinnan rajalaatikosta, ensisijaisesti
muokattavasta osasta. Kierron alussa poimitaan erikseen osoittimen alla oleva
näkyvä pinta. Osumaton kierto käyttää muokattavan osan tai valinnan keskusta,
ja ilman valintaa nykyistä OrbitControlsin targetia. Raycast huomioi piirretyt
osan pinnat ja geometriaesikatselut; piilotetut pinnat, apuviivat ja kiertokahvat
ohitetaan. Piste lukitaan eleen ajaksi ja osoitetaan pienellä renkaalla.
Zoomin syvyysviite projisoidaan kameran katseluakselille muuttamatta
kameran sijaintia tai suuntaa. Kiertoliikkeen aikana keskus säilytetään kameran
paikallisissa koordinaateissa siirtämällä kameraa ja OrbitControlsin targetia
yhdessä. Näin sivussa oleva yksityiskohta toimii kiertokeskuksena ilman
valinnan aiheuttamaa näkymän hyppyä. Panorointi säilyy vapaana.
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

## Skaalaus

`model/scaling.ts` määrittää koko valinnan yhteisen kiintopisteen ja positiiviset
kertoimet. GPU-esikatselu lainaa nykyisiä geometria- ja reunapuskureita: veto
muuttaa matriisia, eikä pyydä CAD-laskentaa. Kulmakahvat skaalaavat tasaisesti,
sivukahvat yhtä maailman akselia. Kerroin tai tavoitemitta antaa saman operaation.

Tasainen CAD-skaalaus käyttää nykyistä Replicad-ydintä. Sen WASM-paketista puuttuva
`BRepBuilderAPI_GTransform` ladataan vasta hyväksytyssä epätasaisessa skaalauksessa
`brepjs-opencascade@0.15.6`-lisäytimestä. Muutos siirtyy ytimien välillä tarkkana
BRep-tekstinä, ei kolmioverkkona. Lisä-WASM on noin 26 Mt (gzip 8 Mt); mallin
avaaminen, tavallinen mallinnus ja esikatselu eivät lataa sitä. Se ei vaadi
cross-origin-isolation-otsakkeita. Vaihtaminen onnistuu `cad/affineKernel.ts`:n
init/WASM-tuontien kautta; lähdeversio ja build-ohje ovat lisenssien NOTICE:ssa.

Affiinimuunnos voi esittää suorankin pinnan ja reunan B-splinenä.
`cad/planarity.ts` tunnistaa tasomaisuuden ja suoruuden kontrollipisteistä,
jotta Offset, Push/Pull ja reunoihin sidotut mitat säilyvät käytettävinä.
Yhden BRep-osan raja on 16 Mt; projektitiedoston 64 Mt:n raja säilyy.
Skaalauksen hyväksynnän aikaraja on 120 sekuntia, muut operaatiot 45 sekuntia.
Peruutus katkaisee workerin ja jättää aiemman projektin ennalleen.

Linkitetty perhe muunnetaan kerran. Muut valitut esiintymät saavat skaalatun
sijainnin ja normaalin komponenttisynkronoinnin; ulkopuolisten kopioiden sijainti
säilyy, mutta yhteinen muoto päivittyy. Eri asennoissa olevien kopioiden
ristiriitainen akseliskaalaus pyytää tekemään osat uniikeiksi tai skaalaamaan
tasaisesti. Hold suojaa myös epäsuorasti muuttuvia kopioita. Vanhojen verteksien
avaimet säilyvät, myös kopioissa. Operaatiosta syntyy yksi kumottava historiavaihe.

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

Reunakäsittely käyttää tesselloinnista riippumattomia CAD-reunaindeksejä.
`BodyMesh.detailEdges` sisältää kunkin reunan polylinjan poimintaa varten;
kaarevat reunat kuuluvat samaan valintaan. Työkalun väliaikainen valinta
nollautuu projektin geometrian vaihtuessa tai työkalun päättyessä.
`edge-detail` valitsee alkuperäisen BRepin reunat EdgeFinderin kautta ja
suorittaa OpenCascaden fillet-/chamfer-operaation. Tulos validoidaan ja
sarjallistetaan BRepiksi. Esikatselut yhdistetään yhdeksi jonoksi ja vanhentuneet
vastaukset ohitetaan. Hyväksyntä on yksi projektitransaktio.

## Esityskuva

`render/scene.ts` muodostaa erillisen Three.js-näkymän samasta CAD-tesselloinnista.
Mallinnuksen kamera ja geometria säilyvät. Näkyvät model/component-osat käyttävät
MeshPhysicalMaterial-materiaaleja, PMREM-studioympäristöä, ACES-sävykuvausta ja
valinnaisia pehmeitä varjoja. Puutekstuuri syntyy selaimen canvasilla ilman
verkkolatauksia. Mallinnuksen Hold- ja valintavärit eivät siirry esityskuvaan.

Osan valinnainen `material` ja projektin valinnainen `settings.render` ovat
V5-formaatin taaksepäin yhteensopivia kenttiä. Väri ja materiaali säilyvät myös
kopioinnissa ja BRep-muunnoksissa. Muutokset kulkevat saman historia- ja
tallennustransaktion kautta kuin muut projektimuutokset. Esikatselun valotussäädin
päivittyy paikallisesti ja tallentuu vasta eleen päätyttyä.

PNG-vienti piirtää nykyisen perspektiivikameran valittuun pikselileveyteen,
säilyttää kuvasuhteen ja palauttaa interaktiivisen piirtoalueen koon. Näkymä
piirretään vain muutoksissa; sulkeminen vapauttaa geometriat, materiaalit,
tekstuurit, ympäristökartan, varjokartan, kuuntelijat ja WebGL-renderöijän.

Mittauksen loppupään `measureTargetAt` kokoaa CAD-pisteet, reunat ja apuviivat
samassa näytön pikselietäisyyteen perustuvassa poiminnassa. Aktiivisen tason ja
akselilukon kelpoisuus tarkistetaan ennen lähimmän kohteen valintaa. Poimittu
kohde säilyttää oman korostuksensa, vaikka rinnakkaisen apuviivan etäisyys
lasketaan kohtisuoraan lähtöreunasta. Vapaa mittaviiva tallentaa myös
loppupääksi poimitun CAD-reunan ankkurin.

Rakennusviivat käyttävät olemassa olevaa `purpose: construction` -roolia ja
nollapaksuista profiilia. Uutta tiedostoformaattia ei tarvita. Näkymä piirtää
vain katkoviivaisen ääriviivan; CAD-pinta säilyy tartuntapisteiden laskentaan,
mutta sen raycast ohitetaan. Valinta ja siirto poimivat ääriviivan erikseen.
Pintatyökalut ja piirtotason poiminta tavoittavat alla olevan oikean kappaleen.

## Kappalelistan järjestely v0.8.2

`moveInTree` muuttaa vain osien `groupId`- tai ryhmän `parentId`-viitteitä.
Geometria, origot, tunnisteet ja mitta-/apuviitteet säilyvät. Puuttuvat kohteet
ja syklit hylätään; muuttumaton kohde palauttaa alkuperäisen projektin, joten
historiaan ei synny tyhjää askelta. Yksi `editor.transact` kattaa koko valinnan.

`useTreeDrag` erottaa napsautuksen vedosta 6 px kynnyksellä. Hiirellä koko nimi
aloittaa vedon, kosketuksella vain `touch-action: none` -kahva. Pointer capture,
window-tason päättäminen, Esc, pointercancel ja ikkunan blur pitävät keskeytykset
turvallisina. DOM-kohdistus etsii vain oman listan kohderyhmät; rAF vierittää
listan reunoilla. Vetämisen jälkeinen napsautus ei vaihda valintaa.
Aktiivisen geometriatyökalun ja osan muokkaustilan aikana raahaus on estetty.
Näkyvyys ja Hold periytyvät uudesta ryhmästä; osien omat liput säilyvät.

Listan oma vieritys pysyy erillään valinnan/työkalun vierityksestä.
ObjectTree on samassa kohdassa työkalusta riippumatta: suljetut ryhmät eivät
avaudu itsestään työkalua vaihdettaessa. Ryhmän päälle pudottaminen avaa
kohderyhmän. Harvemmin käytetyt ominaisuudet ovat natiiveissa details-osioissa.

## Reunakäsittelyn veto v0.8.3

`sizeDrag` lukitsee ruutusuunnan 4 px liikkeen jälkeen ja muuntaa etumerkillisen
siirtymän millimetreiksi vedon aloituspisteen kameramittakaavassa. Kamerasta
kohti osoittava tai kaareva reuna ei vaadi projektiotason leikkausta. Vastaliike
pienentää mittaa, ja puhdas napsautus säilyy reunavalintana.

Viewport säilyttää poimitun CAD-reunan eleen loppuun asti. Veto varmistaa
reunan kuulumisen valintaan poistamatta muita valittuja reunoja. Numerosyöttö
käyttää samaa offset-kentän lukkoa kuin nykyiset työkalut; uusi veto avaa lukon.
Pointercancel, ikkunan blur ja toinen kosketus palauttavat vetoa edeltäneen
valinnan, mitan ja numerolukon. Esc käyttää tavallista eleen nollausta.

`useEdgeDetailPreview` pitää enintään yhden CAD-pyynnön käynnissä ja yhden
uusimman odottamassa. Edellinen kelvollinen saman kohteen esikatselu jää
näkyviin uuden laskennan ajaksi; tulos kantaa todellisen esikatselukokonsa.
Eri kohteen, operaation tai reunavalinnan tulos ei vuoda seuraavaan eleeseen.
Virheellinen syöte/geometria palauttaa alkuperäisen näkymän. Vapautus ja Enter
laskevat aina hyväksyttävän geometrian viimeisimmästä kenttäarvosta, eivät
vanhasta esikatselusta. Yksi hyväksyntä tekee yhden historiatransaktion.

## V0.9.0: muokattavat reunat, mitat ja tekstuurit

Reunakäsittelyn tulos säilyy tarkkana BRepinä. Erillinen `edgeTreatment`
säilyttää lähdefeaturen, siihen sidotut reunaindeksit ja jäykän sijoituksen.
Uusi mitta tai reunan lisäys rakennetaan lähteestä, jolloin kohtaavat kulmat
ratkeavat samassa OCCT-operaatiossa. Worker palauttaa lähdereunojen poimintaviivat
erillään tulosreunoista. Tavallinen `bodyFromShape` viimeistelee aiemman
käsittelyn; kierto säilyttää sen eksplisiittisesti sijoitusta muuttamalla.
Yleistä riippuvuuspuun uudelleenlaskentaa ei tässä versiossa oleteta.

Kahden pisteen dimensio käyttää samoja ankkureita kuin apuviivat.
`pointDimensionGeometry` laskee arvon ja sijoituksen; 3D ja SVG käyttävät
samaa funktiota. SVG hyväksyy vain näkymän tasoon sopivat dimensiot ja
varaa niiden sijoittelulle paperitilan. Orvot viitteet säilyvät korjattavina.
Siirron poiminta käyttää yhtä priorisoitua ruutuetäisyyttä lähtö- ja kohdepisteelle.
Kulmat, keskipisteet ja suorat reunat tarkistetaan näkyvyyttä vasten;
liikkuvat osat eivät tarjoa itselleen kohdepisteitä. Ruudukko on erillinen
vapaan siirtymän varavaihtoehto.

Materiaalien mukana toimitettavat kuviot syntyvät deterministisesti selaimessa.
Kuvioinnin UV-projektio käyttää objektin paikallista kehystä ja pinnan normaalin pääsuuntaa. Sama geometria ja standardimateriaali toimii mallissa, rasterissa ja path tracingissa. Jaettu kuva saa jokaisella objektilla oman
Texture-instanssin ja sijoitusmatriisin. Veto muuttaa vain tätä matriisia;
CAD-worker ja meshien uudelleenluonti jäävät pois hiiriliikkeestä.
Hyväksytty muutos kulkee normaalin transaktion läpi ja muodostaa yhden
historia-askeleen. Kierto päivittää tekstuurikehyksen saman jäykän muunnoksen mukaan.

Kuvat ovat projektin `assets`-taulussa, omat materiaalit `materials`-taulussa.
Tuonti rajaa kuvan 2048 pikseliin ja tunnistaa sisällön SHA-256:lla.
Historia V2 kerää eri askelissa käytetyt kuvat kerran yhteiseen tauluun.
Tiedostovienti sisältää kaikki projektin aineistot eikä käytä väliaikaisia blob-URL:eja.

## Documentation and presentation workspaces (v0.10)

`DrawingWorkspace` owns projection scope, scale, picking and export. CAD HLR is
recomputed only when geometry/scope/view changes, not when annotation text or scale
changes. Picks resolve CAD vertices and linear edges in screen space. Model-space
anchors are persisted using the existing point-dimension schema. PDF uses the same
physical A4 SVG through dynamically imported jsPDF/svg2pdf.js. The accepting pointer
position determines placement even on touch devices without hover. Point dimensions
can be dragged in the drawing plane; their anchors stay unchanged and a release
commits one offset edit. Automatic extent annotations retain automatic lane layout.

`parts.ts` derives actual physical parts, presentation offsets and spreadsheet-safe
CSV. `PartsWorkspace` renders shifted copies only. Original BReps, origins and history
are not mutated. Dimensions are world extents; manufacturing stock dimensions and
joinery inference are deliberately a separate future domain model.

The render workspace lazily imports `three-gpu-pathtracer` 0.0.26 only when requested.
The pinned WebGLPathTracer API supports the existing WebGL2 scene and an equirectangular
environment; upstream has deprecated this API in favour of WebGPU. A future upgrade
must migrate the adapter explicitly rather than blindly upgrading the dependency.
The modeling viewport keeps its independent raster renderer. The path tracer uses
local-frame dominant-face UVs; raster materials retain triplanar blending, so curved
texture seams may differ. Emissive surfaces contribute indirect light; spotlights
are also available in raster preview. Geometry/material/camera changes reset sampling.
Closing the presentation workspace releases the tracer, accumulation targets and
GPU resources. Hidden browser documents pause sampling. Preview quality and a finite
sample target are local view settings; camera edits reset and resume completed previews.
The preview export is the current canvas size.

`useRenderJob` lives above workspace navigation. `captureRenderScene` owns copies
of geometry, materials, textures and camera, so later edits/disposal of the visible
scene cannot affect the job. `traceJob` runs a tiled, finite full-resolution render
on a separate WebGL canvas, yielding between tiles, with cancellation and explicit
GPU cleanup. The completed PNG remains in memory until dismissed or replaced.
Closing/reloading the tab loses the job; this is not a durable queue or a denoiser.

`cabinetPlan` lays out independent rectangular boards with explicit joints, back,
shelves and doors. The modal preview uses temporary box meshes without CAD jobs
per keystroke. Accepting creates real CAD solids and one named group in one
transaction. Source replacement is explicit and respects inherited Hold. The
result is ordinary editable parts, not a live parametric cabinet dependency graph.

The Pages build uses `--base=/nivo/` (local production tests use
`NIVO_BASE_PATH=/nivo/` for both build and preview); worker, WASM, icons and example paths resolve
under that base. No user project is uploaded: IndexedDB remains origin-local.

## V0.11: poiminta, ruudukko ja PBR

`viewport/picking.ts` valitsee pisteen oikeasti sisältävistä viereisistä tasopinnoista kameraa kohti olevan. Pintakolmiot estävät toisen samassa tasossa olevan alueen valinnan. Ruutupoiminta priorisoi verteksit, keskipisteet ja reunat; näkyvyys tarkistetaan vasta ruutukynnyksen sisällä oleville ehdokkaille. Piirtämisen hover ja painallus käyttävät samaa tasoa ja tarkkaa CAD-pistettä. Suorakulmion/ympyrän eksplisiittinen akseli tarkoittaa tason normaalia.

Siirron akseli valitaan alkueleen ruutuprojektiosta ja pidetään samana vedon ajan. Kohdepiste projisoidaan tälle akselille, muut koordinaatit säilyvät. Vapaa XYZ-siirto on valinnainen. Ctrl keydown vaihtaa kopioinnin, keyup ei nollaa sitä. Vapaan mitan ruudukko lasketaan suhteessa alkupisteeseen; push/pull pyöristää toteutuvan kokonaismitan. Näkyvä CAD-tartunta ja kirjoitettu luku ohittavat pyöristyksen.

`render/materials.ts` tuottaa normal-/karheuskartat paikallisista kuvioista ja lukee tuodut PBR-kanavat lineaarisina. Värikuva on sRGB. Bump muunnetaan tangenttiavaruuden normal-kartaksi, koska GPU-tracer ei tue suoraa bumpMap-kanavaa. Sijoittelu tallennetaan Texture.repeat/offset/rotation-kenttiin: tracerin atlaslataus voi palauttaa matriisin ja kutsua updateMatrixa ilman muunnoksen menetystä. Esikatselu ja tilannekuvan luonti odottavat kuvien decode-vaiheen sekä bump-muunnoksen valmistumista. Virheellinen kuva keskeyttää tarkennuksen näkyvään virheeseen.

Progressiivinen esikatselu käyttää 1×1-laatoitusta: jokainen näyte päivittää koko kuvaa. Erillinen kuvatyö säilyttää oman renderöijän, resurssikopiot ja piilotetun laskennan laatoituksen. Tarkennus odottaa uusia karttoja myös materiaalin vaihtuessa.

## Leikkauslista ja kokoonpanon esitys

`model/parts.ts` muodostaa kokoonpanon ja tekee vain esityskopioihin keskipisteiden
säteittäisen siirtymän. `model/cutting.ts` tunnistaa suorakulmaiset osat tarkkojen
CAD-pisteiden, kolmen keskenään kohtisuoran tasopintasuunnan ja tilavuuden avulla.
Reseptilaatikko voidaan lukea suoraan. Maailman rajalaatikkoa tai kaarevien pintojen
tesselloitua äärimittaa ei käytetä sahausmitaksi. Käsin annettu aihio sidotaan
geometrian tunnisteeseen ja vaatii uuden vahvistuksen geometrian muuttuessa.

Leikkausasetukset ovat valinnaiset projektissa. Laskettu sijoittelu on johdannainen:
materiaalien ja paksuuksien erottelu, kolme lajittelua ja kaksi guillotine-jakosääntöä,
lyhyen sivun sovitus, levyjen määrän minimointi kokeiden välillä ja jäännöspalojen
pinta-alan neliösumman maksimointi tasatilanteessa. Vapaat suorakulmiot eivät ole
päällekkäisiä ja sahausura vähennetään niiden väliltä. Tämä on deterministinen
heuristiikka, ei globaalin optimin todistus. Muistissa ei muuteta mallia.
`drawing/cutting.ts` tekee samasta tuloksesta SVG-arkit, vektori-PDF:n ja CSV:n;
print-CSS näyttää vain levykuvat ja osaluettelot fyysisillä A4-vaakasivuilla.

## Suuret mallit ja työmaanäkymät (v0.14)

CAD-client sarjallistaa `sync`-pyynnöt ja siirtää vain geometriamuutokset ja
osien järjestyksen. Worker palauttaa vain muuttuneet verkot. Nimi, väri, ryhmä,
leikkaustaso ja kuvat eivät käynnistä osien uudelleentessellointia. Samankaltaiset
siirretyt osat voivat käyttää yhden tarkan CAD-lähteen kloonia ja muunnettua
näyttöverkkoa. Verkkoankkurin `bodyId` vaihtuu aina oikealle esiintymälle.

Viewport säilyttää muuttumattomat geometriat ja kokoaa saman muodon/materiaalin
instanssipiirroiksi. Tarkat osakohtaiset poimintaverkot säilyvät CPU:lla.
Valinnan siirron haamut käyttävät samaa eräpiirtoa ja siirtyvät muunnoksella.
Staattista varjokarttaa ei piirretä uudelleen kameran/osoittimen liikkuessa.
AABB-puu rajaa sädehaun ja ruututilan tartuntahaun ehdokkaat; tarkka CAD-piste
ja peittymistarkistus ratkaisevat edelleen lopullisen tartunnan. Yli 400 rivin
mallipuusta pidetään DOM:ssa vain näkyvä osuus ja pieni ylimääräinen reuna.

Validointi palauttaa muuttumattomille osille/featureille aiemmat olioviitteet.
Historia säilyttää enintään 100 askelta, lisäksi konservatiivinen 64 MiB:n
UTF-16-tilannekuva-arvio karsii vanhimpia askelia. Aktiivista mallia ei karsita.
Tämä ei ole koko selaimen/WASM/GPU-muistin yläraja. Selaimeen tallentuva historia
on edelleen enintään 20 askelta / 8 MiB, kuvat yhteisessä varastossa. Kukin
säilytettävä tilannekuva serialisoidaan vain kerran tallennuskierroksella.

Näkymäleikkaus käyttää GPU:n paikallista clipping-tasoa ja samaa ehtoa
poiminnassa. Worker muodostaa täytöt tarkan BRepin ja tasofacen yhteisestä
osasta. Reiät säilyvät CAD-topologiassa ja cap-kolmioissa. Toistuvien osien
saman paikallisen leikkauksen tulos käytetään uudelleen; 3D-täytöt piirretään
yhtenä yhdistettynä esitysverkkona. Vanhat worker-vastaukset eivät pääse uuteen
tasoon. Piirustus käyttää rajattujen CAD-solidien HLR-projektiota; leikkausrajan
käyrät saadaan facejen ulko- ja sisäkehistä ja muunnetaan yhteiseen tasokoordinaatistoon.

Pohjakuvat ovat itsenäisiä teksturoituja näkymätasoja. Ne eivät muuta CAD-mittoja,
raycast-geometriaa, osaluetteloa tai renderöintimateriaaleja. Piirtäminen voi
käyttää kuvan tasoa lähtötasona, kun osoittimen alla ei ole CAD-pintaa.
