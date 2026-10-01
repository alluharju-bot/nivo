# Validointi — 2.10.2026

Ympäristö: Apple M1 Pro, 16 Gt, macOS 26.2 arm64, Node 24.14.0.
Playwright 1.63.0 / Chromium 153.0.8010.12. Tablettiprofiili on
Chromiumin iPad Pro 11 -kosketusemulointi, ei fyysinen iPad tai Safari.

## Automaattiset tarkistukset

Muokkaustilan ja apuviivojen viimeistely: **70 yksikkö- ja CAD-testiä
hyväksytty** sekä TypeScript ja tuotantopaketointi hyväksytty. Uudet kokeet
varmentavat offsetin lähtöetäisyyden neljässä suunnassa, aidot 3D-risteykset
myös vinotasossa sekä eri syvyyksillä ja yhdensuuntaisesti kulkevien viivojen
risteystartunnan hylkäämisen. Työpöytä- ja tablettiprofiilin 20 selaintapauksesta
19 hyväksyttiin ensimmäisellä ajolla. Tablettiprofiilin Z-lukon koe paljasti
ruudulla lähellä olevan mutta akselin ulkopuolisen apuviivan häiritsevän
lukittua siirtoa; tartunta rajattiin 3D-akselille. Kohdistettu uusinta hyväksyi **4/4 tapausta**,
joten kaikki 20 erillistä selaintapausta on varmennettu. Muotoilutarkistus
on hyväksytty.

Uudet selaintyönkulut kattavat näkyvän muokkaustilan ja kohdistimen ohjeen,
tyhjään tilaan tuplaklikkaamalla poistumisen ja tavallisten napsautusten,
vetojen, kameran kierron ja piirtämisen säilymisen muokkaustilassa. Apuviiva
alkaa toisesta apuviivasta tai tarkasta risteyksestä ja tarttuu risteykseen
myös loppupisteenä. Seinän pystyreunasta mitataan 80 mm siirto eikä 600 mm
reunapituutta. Valinta ei siirrä apuviivaa; kumitus poistaa vain korostetun
viivan ja undo/redo sekä sivun päivitys säilyttävät tuloksen. Työpöydän ja
tablettiprofiilin kuvakaappaukset tarkistettiin.

V0.7.0: **63 yksikkö- ja CAD-testiä hyväksytty**. TypeScript,
tuotantopaketointi ja muotoilutarkistus hyväksytty.
Uudet geometriakokeet varmentavat:

- Tallennetun suorakulmiorajauksen poisto, muuttumattomat mitat, tilavuus, nimi ja väri.
- Vain valitun rajauksen yhdistäminen; toinen ympyrärajaus säilyy E:llä muokattavana.
- Kaarevan rajauksen poisto, vinot pinnat ja nollapaksut pinnat.
- Onton 600 × 600 × 2400 mm kaapin alapinnan korjaus aukkoa muuttamatta.
- Rakenteellisten kulmien, reikien, taskujen, vanhentuneiden pintaparien ja Holdin hylkäys.
- Historian molempien suuntien palautus, uuden haaran redo-nollaus, askel- ja
  tavubudjetti sekä vaurioituneen tai eri mallin historian ohittaminen.

Työpöydän uudet selaintyönkulut: **7/7 hyväksytty**. Piirron, Cut/Joinin,
Offsetin, push/pullin, työkalujen pysyvyyden ja tiedostotyönkulun regressioajo:
**19/19 hyväksytty (3,9 min)**. Uudet työnkulut kattavat:

- O/E-pikamuokkauksen jälkeenkin kokonaan pinnan sisäinen piirros luo uuden osan.
- Tuplaklikkaus avaa yhden osan; piirto jakaa vain sitä. Vieraan osan pinnalta
  aloitettu pintamuokkaus hylätään. Esc peruu ensin eleen ja vasta sitten kontekstin.
- Muokkaa osaa -painike toimii myös nimetyille osille; muiden osien E, siirto ja
  kumitus estetään. Hold estää muokkaustilan avaamisen.
- Uusi osa muokkaustilan sisällä tarttuu himmennetyn viiteosan kulmaan ja säilyttää
  molemmat alkuperäiset osat muuttumattomina.
- Tallennetun BRepin suorakulmiorajaus poistetaan ilman historiaa; ympyrärajaus
  säilyy. Senkin voi poistaa uudelleenavauksen jälkeen. Ulkokulmaa ei voi kumittaa.
- Undo ja redo palautuvat päivityksen yli. Muokkaustila sulkeutuu avattaessa;
  vaurioitunut historia ei estä mallin avaamista.
- Simuloitu historian tallennusvirhe: nykyinen projekti tallentuu silti,
  rajoitus näkyy tilarivillä ja malli avautuu päivityksen jälkeen.

Samat 26 työnkulkua tablettiprofiilissa: **26/26 hyväksytty (6,2 min)**.
Yhteensä **52 erillistä selaintapausta** varmennettu kahdella näyttöprofiililla.
Viiteosien ääriviivojen kontrastin viimeistelyn jälkeen muokkaustilan
kohdistettu uusinta hyväksyi **2/2 tapausta**; kummankin profiilin kuvakaappaus
tarkistettiin. Viiteosa erottuu taustasta ja tarjoaa edelleen tartunnat.

V0.6.1:n yksikkö- ja CAD-tarkistukset: **55 hyväksytty**. TypeScript ja
tuotantopaketointi hyväksytty. Uusi CAD-koe rakentaa 600 × 600 × 2400 mm
kaapin Offsetilla ja push/pullilla sekä erottaa koko oven, pienemmän aukon
ylittävän oven ja varsinaisen kehykseen rajatun pinta-alueen. Toinen koe
varmentaa alapinnalta usean kaapin yli ulottuvan nauhan: automaattinen tila
säilyttää koko profiilin omaksi osaksi, eksplisiittinen Pinnan alue säilyttää
aiemman pintaan leikkaavan toiminnan.

Tuotantopaketin kohdistettu selaintarkistus (42 tapausta, 7,6 min):
**41 hyväksytty, 1 tarkoituksella ohitettu**. Uudet työnkulut sekä piirron,
push/pullin, mittasyötön ja työkalujen pysyvyyden regressiot ajettiin
työpöytä- ja tablettiprofiileilla. Ohitus on työpöydälle soveltumaton
kosketuskoe. Muotoilutarkistus hyväksytty.

Uudet selaintarkistukset:

- Vapaa E-veto ei tartu toiseen pintaan; Shift poimii kohteen myös ilman uutta
  hiiren liikettä. Vapautus säilyttää mitan ja seuraava vapaa liike jatkuu siitä.
- Perspektiivissä suoraan pintaa kohti katsottaessa samanmittaiset hiiriliikkeet
  tuottavat samanmittaisia siirtymiä, myös alkuperäisen pinnan sisäpuolella.
  Oma pinta ei kelpaa Shift-kohteeksi eikä sen napsautus hyväksy virheellistä kohdetta.
- Offset-kaapin etukulmista kahdella napsautuksella piirretty ovi on itsenäinen
  600 × 2400 mm pinta. E antaa sille 18 mm paksuuden; kaappi säilyy täsmälleen
  ennallaan. Undo/redo ja selaimen uudelleenlataus säilyttävät molemmat osat.
- Hold-osa sopii uuden osan piirtotasoksi. Kirjoitetut mitat säilyvät hiiren
  liikkuessa ja toisella napsautuksella hyväksyttäessä.
- Ympyrän kahden napsautuksen piirto tekee edelleen pintaan E:llä muokattavan
  alueen. Ellipsin keskeneräinen piirto perutaan Escillä ilman projektimuutosta.
- Kahden vierekkäisen kaapin yli piirretty 500 mm nauha säilyy kokonaisena uutena
  osana; kumpikin kaappi ja tiedostokierros säilyvät muuttumattomina.

V0.6: **53 yksikkötestiä hyväksytty**, TypeScript ja tuotantopaketointi
hyväksytty. Tuotantopaketin kohdistettu selaintarkistus (52 tapausta, 9,7 min):
**50 hyväksytty, 2 tarkoituksella ohitettu**. Ajo kattaa uudet työnkulut
molemmilla näyttöprofiileilla, työpöydän olennaiset regressiot ja laajemman
piirto-/mallinnus-/tallennussarjan tablettiprofiilissa. Ohitukset ovat
kehitystilaan rajattu worker-koe ja työpöydällä ohitettava kosketuskoe.

Erivärisen monivalinnan viimeistelyn kohdistettu tuotantouusinta:
**2/2 hyväksytty**. Paneeli näyttää useat värit, nykyisen pääosan oman värin
voi asettaa koko valinnalle ja yksi undo palauttaa alkuperäiset eri värit.

V0.6:n uudet tarkistukset kattavat:

- Push/pullin tavoitetason laskennan kaikilta kuudelta suunnalta, negatiivisen
  ja nollasiirtymän sekä vinon lähde- ja kohdepinnan.
- Kahden klikkauksen ja vedon pintakohdistuksen: 40 → 90 → 18 mm, myös
  Hold-viite, muuttumaton kohdeosa ja undo. Kirjoitettu 25 mm ohittaa
  kohdepinnan, Esc peruu. Vinon tavoitteen osoitettu taso säilyttää
  lähdepinnan suunnan ja täsmällisen korkeuden.
- 600 × 400 × 18 mm levyn yhteiset kolme 3D-mittaa, toistuvan lisäyksen
  duplikaatittomuuden, E-muokkauksen 18 → 43 mm ja vastaavat mittakuvan/SVG:n
  arvot. Mitat, väri ja geometria säilyvät tiedostossa ja uudelleenlatauksessa.
- Väripaletin ja oman värin, monivalinnan yhden undo-askeleen sekä 3D-mittojen
  kaikki/valinta/piilotettu-asetusten tallentumisen.
- Yli kolmen päällekkäisen mittaviivan erilliset rivit, annotaatioiden huomioinnin
  mittakaavassa, arkin ylityksen ja puuttuvan kappaleviitteen havaitsemisen.
- Aikaisemmat V5-projektit täydentyvät oletusnäkyvyydellä `all`; nollapaksuutta
  ja construction-apumuotoa ei mitoiteta automaattisesti.

V0.5.1:n uudet tarkistukset: **48 yksikkötestiä hyväksytty**, TypeScript,
tuotantopaketointi ja muotoilu tarkistettu. Uusi CAD-koe varmentaa Offsetin
esikatselun maailman koordinaateissa, kaikilla kuudella sivulla, sekä hiirisuunnan
valinnan todellisesta reunasta kolmioverkon sisäreunan sijaan.

Uusien selaintyönkulkujen kohdistettu tuotantoajo: **10/10 hyväksytty**
työpöytä- ja tablettiprofiileissa:

- 60 px yhteinen yläpalkki, vanhat toiminnot saatavilla ja mallinnusalue alkaa
  heti palkin alta. Natiivi fullscreen sisään/ulos, myös selaimen aloittama
  poistuminen. 390 px ikkunassa lisävalikko ja asetukset mahtuvat näytölle.
- Pinnan osoitus → O → hiirisäätö → tarkka CAD-ääriviiva. Kirjoitettu mitta
  säilyy hiiren liikkuessa; klikkaus hyväksyy kerran ja undo palauttaa alkuperäisen.
- Offset-työkalu ensin, myös valitulle kappaleelle: pinnasta veto hyväksytään
  vapautuksessa. Liian suuri seuraava inset ja Esc eivät muuta osaa.
- Koko objektin valinta. Vedon aikana painettu Ctrl kopioi täsmälleen
  tartuntakulmasta kohdeverteksiin. Alkuperäiset osat säilyvät; undo poistaa kopion.
- Esc peruu kopioinnin; Siirrä kopio -valinta sijoittaa kopion täsmälleen
  652 mm siirtymällä ilman Ctrl-elettä.

Koko V0.5.1-tuotantoajo (86 tapausta, 14,6 min): **80 hyväksytty,
4 tarkoituksella ohitettu, 2 korjattavaa**. Nopeassa tabletin undo/redo-sarjassa
näppäinkuuntelija saattoi käyttää edellisen renderöinnin busy-tilaa; kuuntelija
päivitetään nyt layout-effectissä samassa commitissa käyttöliittymän kanssa.
Toisen tabletin testin suorakulmio alkoi kasvaneen mallinnusalueen vuoksi
vasemman työkalupalkin päältä; testipisteet siirrettiin canvasin sisälle.
Ohjeikkunan peite nostettiin samalla yhteisen yläpalkin ja mittaikkunan päälle.

Korjatun tuotantopaketin kohdistettu uusinta: **10/10 hyväksytty (2,2 min)**.
Molemmat korjatut työnkulut sekä yläpalkki/fullscreen/ohjeikkuna, hiiri-Offset
ja suora numerosyöttö ajettiin kummallakin näyttöprofiililla. **82 erillistä
selaintyönkulkua varmennettu koko ajon ja kohdistetun uusinnan avulla.**

V0.5:n tarkistus: **47 yksikkötestiä hyväksytty**, TypeScript, tuotantopaketointi
ja muotoilu tarkistettu. Uudet geometriakokeet varmentavat 18 mm Offsetin
600 × 600 × 2400 mm laatikon kaikilla kuudella sivulla, täsmällisen taskutilavuuden,
läpireiän sekä vastapintaan päättyvällä että sen ylittävällä siirtymällä.
Myös ympyrä, vino pinta ja olemassa olevan reiän ympärille jäävä offset testataan.
Kierto säilyttää tilavuuden ja ankkurit; monivalinta, mielivaltainen kiertoakseli,
origoon siirto, lukitus ja V4→V5-tiedostomuunnos sisältyvät kokeisiin.

Tuotantopaketin koko 76 tapauksen ajo: **70 hyväksytty, 4 tarkoituksella ohitettu,
2 tabletin testielettä korjattavaksi** (12,8 min). Kynätestin viimeinen piste osui
näkymäpainikkeeseen; piste siirrettiin sen alapuolelle. Tabletin ruudukon zoomikoe
vaihdettiin hiiren rullasta kahden sormen nipistyseleen käyttöön.
Lisäksi Offsetin viimeksi käytetty arvo säilytettiin seuraavalle pinnalle.
Kohdistettu tuotantouusinta hyväksyi **10/10 tapausta**: nämä kaksi työnkulkua ja
kaikki kolme Offset/pintakorostustyönkulkua molemmilla näyttöprofiileilla.
Näin **72 selaintyönkulkua on varmennettu koko ajon ja kohdistetun uusinnan avulla**.
Lopuksi Offset-mittaikkunan otsikko korjattiin; tyyppitarkistus ja paketointi ajettiin uudelleen.

Uudet selaintyönkulut kattavat:

- Vapaan pinnan osoitus → E ilman erillistä valintaa; Hold estää E:n ja Offsetin.
- Kaapin etupinta → O → 18 mm → E → jäljelle 18 mm → Leikkaa läpi → undo ja avaus.
- Työkalu ensin → pintavalinta, liian suuren insetin atominen hylkäys,
  peräkkäiset sisennykset ja lopullinen mitta 0.
- Hillityt oletusakselit, valinnaiset nimet, asetusten säilyminen,
  kauas zoomaus ja ruudukon shader ilman selainvirheitä.
- Origoon siirto, lukitus, nimeäminen, ryhmät ja piilotus sekä undo ja avaus.
- R-kierto poimitun reunan ympäri sekä rengasveto Shiftin 15°-porrastuksella.

V0.4.2:n selaintestit kattavat reunan korostuksen kohdistimen kohdalla,
perspektiivissä kannen ja sivupinnan suuntaan vedetyn apuviivan sekä X/Y/Z-siirron,
joka säilyttää viivan alkuperäisen suunnan. Peräkkäiset siirrot, suorakulmiot,
viivat ja pintamuokkaukset käyttävät samaa aktiivista työkalua. Esc tyhjentää
myös lukitun luonnoksen. Mittaikkunan sivutelakka, siirto, paikan säilyminen,
uuden muodon aloittaminen numeroilla ja paluu sivupaneeliin tarkistetaan.

V0.4.1:n lisäys: 652 mm kappaleen lopullinen mitta voidaan kirjoittaa suoraan.
Uudet CAD-testit muuttavat 652 mm → 150/550/750 mm kaikilta kuudelta pinnalta
ja varmistavat vastakkaisen pinnan pysymisen paikallaan. Lisäksi varmennetaan
vinon levyn tarkka paksuus, taskun pohjalle jäävä 5 mm materiaali, reiän kohdalle
osuvan automaattisen pintakeskipisteen käsittely sekä erillisen solidin jättäminen
mittauksen ulkopuolelle. Etumerkit, yksiköt, Tab-vaihto ja virheelliset tavoitemitat
testataan samoilla siirtymälaskelmilla joita sovellus käyttää.

Uusissa selaintesteissä 652 → 550, −150 → Tab → 150 mm, Shift+Tab,
automaattitallennus, vedon suunnan mukainen 150, sen ohittava +150,
hiiren vapautuksella hyväksyntä sekä 5 mm taskunpohja ja muuttumaton mitta.
Kolme uutta työnkulkua hyväksytty ensin työpöytäprofiilin kohdistetussa ajossa.

| Tarkistus                    | Tulos                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                   | 53 testiä hyväksytty.                                                                                                                |
| Kehitystilan selaintestit    | V0.5:n seitsemän uutta työnkulkua hyväksytty työpöydällä ennen tuotantoajoa. Aiemmat CAD-worker-kokeet säilyvät.                     |
| `npm run build`              | TypeScript ja tuotantopaketointi hyväksytty.                                                                                         |
| Tuotantopaketin selaintestit | Mittasyöttö, apuviivat, Shift-viite, kynä, yhdistäminen sekä aiemmat työnkulut työpöydällä ja tablettiprofiilissa. Ajotulokset alla. |
| `npm run format:check`       | Lähdekoodin ja dokumentaation muotoilutarkistus.                                                                                     |

V0.4.2:n tuotantotarkistus: **58 hyväksyttyä työnkulkua, 4 tarkoituksella
ohitettua**. Koko 62 tapauksen ajossa 56 hyväksyttiin; sama tilavalikkotesti
molemmilla profiileilla odotti työkalun vanhaa nollautumista. Testi päivitettiin
aktiivisena pysyvän työkalun yhden painalluksen tilavalikkoon, ja kohdistettu
uusinta hyväksyttiin molemmilla profiileilla (2/2). Sovelluskoodi ei muuttunut
ajojen välillä. 40 yksikkötestiä, TypeScript, tuotantopaketointi ja
muotoilutarkistus hyväksyttiin.

V0.4.1:n koko tuotantotestisarja:
`NIVO_PREVIEW=1 npm run test:e2e` — **52 hyväksytty, 4 tarkoituksella ohitettu**
(6,5 min). Kaikki uudet ja aiemmat työnkulut ajettiin työpöytä- ja
tablettiprofiileissa. 40 yksikkötestiä, TypeScript, tuotantopaketointi ja
muotoilutarkistus hyväksyttiin. Uuden lopullisen mitan tiedostokierto,
Tab/Shift+Tab, hiiren vapautus, etumerkit ja jäljelle jäävä materiaali sisältyvät ajoon.

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
- Ympyrän jakaminen 100 × 100 × 20 mm levyyn säilyttää tilavuuden 200 000 mm³.
  Säteen 10 mm tasku vähentää π × 100 × syvyys mm³; läpileikkaus vähentää
  π × 100 × 20 mm³. BRep säilyy tiedostokierrossa.
- Suorakulmainen ja kolmiomainen alue pystypinnalla pursottuvat oikeaan
  suuntaan ja muuttavat tilavuutta pinta-ala × paksuus.
- Kaksi kohdetta ja kaksi pyöreää työstökappaletta, myös käänteinen Cut,
  verrataan laskennallisiin tilavuuksiin. Join yhdistää päällekkäiset osat.
- Irrallinen leikkuri ei muuta kohdetta; kokonaan leikatun kohteen poistuminen
  ja tasoluonnoksen hylkäys työstökappaleena varmennetaan.
- Vino ellipsi säilyttää tarkan tilavuuden ja rajalaatikon.
- Muuttumaton kulmaviite säilyy pinnan jaossa, poistettu kulma katkeaa.
  Join siirtää säilyneen työkalun ankkurin kohteeseen ja tiedostokierros säilyttää sen.
  Reunan keskiosan leikkaus katkaisee siihen viittaavan ankkurin vaikka
  molemmat päätepisteet säilyvät; jäljellä olevan reunan viite toimii.
- V3-projektit siirtyvät V4:ään oletuskäyttötarkoituksella `model`.

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
    R ja Shift+R toimivat luonnin jälkeen. Sama akselinäppäin vapauttaa lukon;
    Esc päättää työkalun.
    Valmista viivaa voi valita suoraan näkymästä.
17. Kappaleen alle jäävä apuviiva peittyy, viivakohtainen x-ray näyttää sen,
    globaali x-ray säilyy uudelleenlatauksessa.
18. Kynän kolmas viiva lukittuu Shiftillä. Ensimmäisestä pisteestä poimittu
    pituus on täsmälleen 200 mm ja tuottaa oikean neljännen kulman. Shiftin
    vapautuksen jälkeen aloitusverteksiin tarttuminen sulkee muodon.
    Ctrl/Cmd+Z ja Ctrl/Cmd+Shift+Z säilyvät historiaoikoteinä myös kynän ja
    mittatyökalun aikana; Z-akselin lukko ei kaappaa niitä.
19. X/Z-lukoilla tehty pystypinta, lukon vapautus samalla akselinäppäimellä, E-pursotus 20 mm
    ja syntyneen BRep-kappaleen palautuminen uudelleenlatauksessa.
20. 80 000 × 60 000 × 18 mm levyn ja seinämän neljä kamerakulmaa sekä
    rinnakkaisprojektio renderöityvät ilman selainvirheitä. Kuvantarkistus
    täydentää automaatiota; yksittäiset kuvat eivät todista kaikkien laitteiden
    tai jokaisen animaatioruudun välkkymättömyyttä.

SVG-tarkistus varmistaa A4:n `297mm × 210mm`-koon ja vastaavan viewBoxin.
600 mm leveä kappale mittakaavassa 1:5 käyttää 120 mm paperileveyttä.
Mittatekstin koko määritellään paperiyksiköissä eikä kamerasta tai pikseleistä.

V0.4:n uudet selaintyönkulut, molemmilla profiileilla:

1. Ympyrä kappaleen pinnalle → valittu alue → E → Leikkaa läpi → undo/redo
   ja uudelleenlataus säilyttävät tarkan mallin.
2. Suorakulmion negatiivinen paksuus pystypinnalle sekä kynällä piirretty
   kolmio ja E muodostavat erimuotoiset taskut.
3. Kahden levyn leikkaaminen kahdella sylinterillä, työstökappaleiden poisto,
   undo/redo ja selaintallennuksesta palautuminen.
4. Kohteiden poiminta näkymästä, ryhmien vaihto, käänteinen Cut säilytetyllä
   työkalulla ja Join samasta valikosta.
5. Ellipsin tarkat halkaisijat ja paksuus, nimetty osa, Enter-hyväksyntä
   ominaisuuskentästä sekä säännöllinen monikulmio apumuotona.
6. Kohteeseen osumaton Cut säilyttää projektin ja kertoo virheestä;
   tasoluonnosta ei voi valita leikkuriksi.
7. Syvyyden poiminta toisesta pinnasta antaa valitulle alueelle −30 mm;
   referenssikappale säilyy muuttumattomana.
8. Vinolta CAD-tasolta aloitettu ympyrä pysyy täsmälleen pinnassa ja
   E:n negatiivinen syvyys muodostaa taskun muuttamatta osan ulkorajoja.

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
- Muuttumattomien verteksien apuviitteet säilyvät Cut/Join- ja pintamuutoksissa.
  Muuttuvien verteksien automaattinen uudelleenkohdistus ja pysyvät yleiset
  pintaviitteet ovat jatkotyötä.
- Piirtotaso valitaan aloittamalla kappaleen tasopinnalta. Tyhjän tilan
  suorakulmiot ja ympyrät syntyvät XY-tasolle. Kynän vapaa taso seuraa näkymää
  ja edellistä pistettä; X/Y/Z sekä geometriapisteet tukevat 3D-pisteitä.
  Suljettavan muodon on oltava tasomainen. Kappaleen vapaa kierto on tuettu R-työkalulla.
- Apuviivan tartunta edellyttää samaa tasoa. Haettu 3D-viite projisoidaan
  aktiiviseen tasoon. Keskipiste on kappaleen rajalaatikon keskipiste.
- Yhdistäminen edellyttää tilavuuskappaleita. Tasopinnan push/pull toimii myös
  yhdistetylle osalle, kaareville pinnoille ei vielä. Kaarevareunainen
  tasopinta, kuten ympyrä, on tuettu.
- Nimetty osa on itsenäinen kappale. Linkitetyt komponenttimäärittelyt ja
  instanssien yhteismuokkaus ovat jatkotyötä.
- Arkilla on yksi näkymä. Ulkomittojen tekstit ja viivat saavat tarvittaessa
  omat rivit. Jos malli ja mittarivit eivät mahdu A4:lle, vienti estyy ja
  käyttöliittymä pyytää pienentämään mittakaavaa tai vähentämään mittoja.
  Usean arkin/näkymän taitto sekä kahden vapaan pisteen ja vinon reunan
  mitoitus ovat jatkotyötä. 3D:n ulkomitat ovat maailman X/Y/Z-suunnissa.
- Pintakohdistus koskee tasopintoja. Yhdensuuntaiset pinnat tulevat samalle
  tasolle, vinosta tavoitteesta poimitaan osoitetun pisteen taso lähteen
  normaalin suunnassa. Kaarevan pinnan tangentti-/ääripistetartunta on jatkotyötä.
- Esimerkkikaappi todentaa kuuden levyn rungon. Täydelliset hyväksymisesimerkit
  A–C odottavat linkitettyjä komponentteja, materiaaleja ja scenejä.
