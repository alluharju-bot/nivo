Toteuta selaimessa toimiva avoimen lähdekoodin 3D-suunnitteluohjelma, jonka tärkeimmät käyttökohteet ovat kalustesuunnittelu, rakennusosien mallintaminen, tilasuunnittelu sekä selkeiden mittakuvien ja havainnekuvien tuottaminen.
Ohjelman keskeinen lupaus on: ideasta mitoitettuun malliin ja esitettävään kuvaan mahdollisimman vähillä työvaiheilla.
Käyttötuntumassa tavoitellaan SketchUpin välittömyyttä sekä Fusionin kaltaista materiaalien sijoittelun hallintaa. Käyttöliittymän pitää olla oma, selkeä kokonaisuutensa.
Ohjelman pitää toimia sekä tietokoneella että tabletilla. Tablettikäyttö vaikuttaa arkkitehtuuriin ja vuorovaikutukseen ensimmäisestä toteutusvaiheesta alkaen.
Toimi tuotteen suunnittelijana ja toteuttajana. Tee perustellut tekniset valinnat, toteuta toimivia kokonaisuuksia ja varmista niiden toiminta käytännön suunnittelutehtävillä.
1. Optimoi ohjelma seuraavia todellisia työtehtäviä varten.
Käyttäjän pitää voida:
Aloittaa tyhjä projekti ja piirtää ensimmäinen mittatarkka kappale nopeasti.
Piirtää muoto olemassa olevan kappaleen pinnalle ja pursottaa sitä ulos tai leikata sisään.
Muokata kappaleiden pintoja, reunoja ja mittoja suoraan näkymässä.
Rakentaa levyistä kaappi, hylly, pöytä tai muu kaluste.
Tehdä osista komponentteja ja käyttää samoja komponentteja useita kertoja.
Mallintaa seinä, aukot ja yksinkertaisia rakennekokonaisuuksia.
Vaihtaa sujuvasti 3D-suunnittelun, tyylitellyn havainnekuvan ja teknisen piirustusnäkymän välillä.
Tuottaa samasta mallista etu-, sivu-, ylä- ja leikkauskuvat mittoineen.
Tallentaa erilaisia näkymiä sceneiksi ja palata niihin yhdellä painalluksella.
Tehdä kaikki keskeiset työvaiheet myös tabletilla ilman fyysistä näppäimistöä.
Rakenteiden mallinnus ja dokumentointi kuuluvat tuotteeseen. Kuormitus- ja lujuuslaskenta eivät kuulu tämän toteutuksen ensimmäiseen kokonaisuuteen.
Tärkeimmät onnistumiskriteerit ovat tarkkuus, käyttötuntuma, nopea työn aloitus ja työn säilyminen.
2. Rakenna tarkalle geometrialle ja helposti muokattaville kappaleille kestävä perusta.
Arvioi lähtökohtana TypeScript, Three.js sekä OpenCascade.js / Replicad. Tarkista riippuvuuksien nykyiset rajapinnat, ylläpito, lisenssit ja soveltuvuus ennen sitoutumista niihin.
Hyödynnä valmista geometriaydintä pursotuksiin, leikkauksiin, viisteisiin ja pyöristyksiin. Eristä sen käyttö oman sovituskerroksen taakse.
Erota toisistaan:
Projektin tietomalli.
Tarkka geometria ja sen topologia.
Näyttämistä varten muodostettava mesh.
Valinta-, tartunta- ja työkalulogiikka.
Materiaalien sijoittelu.
Tallennetut näkymät.
Mitoitus ja piirustusarkit.
Tallennus ja tiedostovienti.
Ruudulla näkyvä kolmioverkko ei saa olla tarkkojen CAD-kappaleiden ainoa tietolähde. Kolmioinnin muuttuminen ei saa itsessään hävittää mittojen tai materiaalien yhteyttä malliin.
Käyttäjälle kappaleiden pitää silti tuntua suoraan muokattavilta. Pintaan tarttuminen, sen siirtäminen ja mitan kirjoittaminen eivät saa edellyttää teknisen mallirakenteen ymmärtämistä.
Huomioi erikseen myös varsinaiset mesh-kappaleet:
CAD-kappaleella ja tuodulla polygonimeshillä voi olla eri sisäinen esitysmuoto.
Meshille tarvitaan pisteiden, reunojen ja pintojen valinta sekä tuetut suorat muokkaukset.
Säilytä loogiset polygonipinnat mahdollisuuksien mukaan, jotta käyttäjän ei tarvitse käsitellä pelkkiä renderöintikolmioita.
Älä oleta, että mielivaltainen tuotu mesh muuttuu automaattisesti tarkaksi, vapaasti muokattavaksi CAD-kappaleeksi.
Näytä selkeästi, mitkä toiminnot ovat valitulle kappaletyypille käytettävissä.
Tee mahdollisesta muunnoksesta erillinen, peruttava toiminto.
Tallenna kappaleille pysyvät tunnisteet. Suunnittele pintojen ja reunojen viittausten päivittäminen geometriaoperaatioiden yhteydessä. Pelkkä kolmion tai pinnan järjestysnumero ei riitä pysyväksi viitteeksi.
Jos mittauksen viite katoaa, merkitse mittaus korjattavaksi. Älä yhdistä sitä hiljaisesti väärään reunaan.
3. Toteuta mallinnustyökalut välittöminä ja mittatarkkoina.
Tarvittavat perustyökalut:
Viiva, suorakulmio, ympyrä ja suljettu monikulmio.
Piirtäminen pääkoordinaatiston tasoille ja valitulle tasopinnalle.
Push/pull ulospäin ja sisäänpäin.
Pursotus annettuun etäisyyteen, kohdepintaan tai kappaleen läpi.
Siirto, kierto, kopiointi ja peilaus.
Hallittu koon muuttaminen tarkkojen mittojen avulla.
Reunan viiste ja pyöristys.
Kappaleiden yhdistäminen, vähentäminen ja yhteisen tilavuuden muodostaminen.
Jakaminen tasolla.
Tasomaisen ääriviivan offset esimerkiksi kehysten ja reunusten tekemiseen.
Monivalinta sekä piste-, reuna-, pinta- ja kappalevalinta.
Määrittele pintojen muokkaukselle selkeä toimintatapa. Pinnalle piirretty suljettu alue voidaan esimerkiksi pursottaa lisäykseksi tai poistaa leikkauksena. Koko olemassa olevan pinnan siirtäminen on erotettava tästä tarvittaessa omaksi toiminnokseen.
Kaikissa olennaisissa työkaluissa pitää olla:
Selkeä esikatselu.
Tarkka numerosyöttö.
Näkyvä hyväksyminen ja peruminen.
Toimiva undo/redo.
Lyhyt ohje siitä, mitä käyttäjän pitää seuraavaksi tehdä.
Epäonnistumisesta ymmärrettävä palaute, joka säilyttää edellisen ehjän mallin.
Geometriaoperaatiot tehdään transaktioina. Virheellinen pyöristys tai leikkaus ei saa jättää mallia osittain muutettuun tilaan.
Aja raskas geometrialaskenta Web Workerissa. Käyttöliittymän pitää pysyä reagoivana laskennan aikana. Vanhentunut laskentatulos ei saa korvata käyttäjän uudempaa muokkausta.
4. Tee tarttumisesta ja mittasyötöstä ohjelman vahvimpia ominaisuuksia.
Toteuta tarttuminen:
Kulma- ja päätepisteisiin.
Reunojen keskipisteisiin.
Ympyröiden keskipisteisiin.
Reunoihin ja pintoihin.
Käytettävissä oleviin leikkauspisteisiin.
Koordinaattiakseleihin.
Yhdensuuntaisiin ja kohtisuoriin suuntiin.
Apuviivoihin ja käyttäjän määrittelemiin etäisyyksiin.
Tarvittaessa ruudukkoon.
Näytä visuaalisesti, mihin tartunta kohdistuu. Määrittele tartuntojen prioriteetit ja riittävä vakaus, jotta kohde ei vaihdu levottomasti viereisten vaihtoehtojen välillä.
Käyttäjän pitää voida aloittaa vetäminen ja kirjoittaa esimerkiksi 600, 18 mm tai 2,4 m. Oletusyksikkö on millimetri. Hyväksy suomalainen desimaalipilkku.
Tarjoa akselilukitus sekä näppäimistöllä että kosketuskäyttöliittymässä.
Erota geometrisen koon muuttaminen ja objektin skaalaus toisistaan. Esimerkiksi kaapin leventämisen ei pidä vahingossa paksuntaa kaikkia levyjä. Älä kuitenkaan lupaa automaattista kalusteen rakenneälyä ennen sen erillistä toteutusta.
5. Toteuta layerit, ryhmät ja komponentit erillisinä käsitteinä.
Layerit ohjaavat mallin järjestämistä, näkyvyyttä ja lukitusta.
Tarvitaan:
Layerin luominen, nimeäminen ja poistaminen.
Objektien siirtäminen layerille.
Näkyvyys ja lukitus.
Usean layerin hallinta kerralla.
Valitun objektin layerin selkeä näyttäminen.
Scene-kohtaisesti tallennettavat näkyvyysasetukset.
Määrittele hierarkian ja layerien yhteiset näkyvyys- ja lukitussäännöt yksiselitteisesti. Piilotettu tai lukittu sisältö ei saa tarttua vahingossa normaaliin muokkausvalintaan.
Ryhmät kokoavat kappaleita yhteen siirrettäväksi ja muokattavaksi.
Komponenteilla on yhteinen määritelmä ja siitä luodut instanssit:
Valinnasta tehdään komponentti yhdellä selkeällä toiminnolla.
Komponentille annetaan nimi, paikallinen koordinaatisto ja sijoituspiste.
Komponenttia voidaan kopioida linkitettyinä instansseina.
Yhteisen määritelmän muokkaaminen päivittää instanssit.
”Tee uniikiksi” katkaisee valitun instanssin yhteyden.
Sisäkkäiset komponentit ovat mahdollisia.
Muokkaustila kertoo selvästi, muokataanko yhteistä komponenttia vai yksittäistä kappaletta.
Instanssikohtaiset materiaalipoikkeukset ovat mahdollisia ilman tahattomia muutoksia muihin instansseihin.
Tarjoa projektin komponenttikirjasto ja myöhemmässä vaiheessa projektien välillä uudelleenkäytettävä paikallinen kirjasto.
6. Toteuta rinnakkaisprojektio, perspektiivi ja tallennetut scenet.
3D-näkymässä pitää voida vaihtaa perspektiivin ja ortografisen rinnakkaisprojektion välillä.
Vaihdossa säilytetään katselukohde ja suunnilleen sama rajaus. Näkymä ei saa hypätä odottamattomaan paikkaan.
Tarjoa suorat näkymät:
Edestä ja takaa.
Vasemmalta ja oikealta.
Ylhäältä ja alhaalta.
Isometrinen näkymä.
Valitun pinnan suuntainen näkymä.
”Sovita valintaan” ja ”Sovita malliin”.
Scene tarkoittaa tallennettua näkymäasetusta samaan malliin. Se ei tarkoita erillistä kopiota geometriasta.
Sceneen voidaan tallentaa:
Kamera, katselukohde, projektio ja rajaus.
Layerien sekä tarvittaessa objektien näkyvyys.
Leikkaustasot.
Esitystapa ja tausta.
Valaistuksen asetukset.
Näytettävä mitoitus- tai annotaatiokokonaisuus.
Scene pitää voida luoda nykyisestä näkymästä, nimetä, monistaa, järjestää ja päivittää. Päivittäminen tapahtuu tarkoituksellisella toiminnolla.
Näytä sceneistä pienet esikatselukuvat. Tarjoa pikatoiminnot esimerkiksi etu-, sivu-, ylä- ja havainnekuvan muodostamiseen valitusta kalusteesta.
7. Tee materiaalien lisäämisestä ja tekstuurien sijoittelusta helppoa.
Tarjoa pieni, laadukas aloituskirjasto:
Maalattu levy.
Puu ja viilu.
Vaneri.
Metalli.
Kivi tai betoni.
Kangas.
Kirkas ja himmeä lasi.
Valoa tuottava materiaali.
Materiaalin pitää voida kohdistua kappaleeseen, komponenttiin tai valittuihin pintoihin. Määrittele materiaaliperinnän säännöt selkeästi.
Käyttäjä voi tuoda oman kuvan tekstuuriksi sekä materiaalikokonaisuuden, johon kuuluu esimerkiksi värikartta, karheuskartta ja normaalikartta.
Toteuta suoraan mallin päällä käytettävä ”Sijoita tekstuuri” -työkalu:
Vapaa siirto pinnan suunnassa.
Vapaa kierto ja tarkka astesyöttö.
Skaalaus ja todellisen kuviokoon syöttö millimetreinä.
Kääntöpisteen asettaminen.
Peilaus.
Nopea 90 asteen kääntö puunsyiden suunnalle.
Kohdistaminen valittuun reunaan.
Toiston ja yksittäisen kuvan sijoittelun valinta.
Sijoittelun kopiointi toiselle pinnalle.
Käyttäjän ei tarvitse avata erillistä UV-editoria tavallisen levyn puunsyiden kääntämiseksi.
Erota materiaalin määritelmä sen sijoittelusta. Saman puumateriaalin pitää voida olla kahdella levyllä eri suunnassa ja eri kohdassa.
Materiaalikokonaisuuden eri kartat seuraavat oletusarvoisesti samaa sijoittelumuunnosta. Koko tekstuurin kiertäminen ei saa jättää normaalikarttaa eri asentoon.
Tekstuurin fyysisen mittakaavan pitää säilyä ennakoitavasti kappaletta muokattaessa. Tarjoa erikseen kuvan venyttäminen koko pinnalle.
Säilytä sijoittelu kappaleen siirroissa, kierroissa ja komponenttien kopioinnissa. Määrittele myös uuden leikkauspinnan materiaalin oletuskäyttäytyminen.
Tallenna käyttäjän tekstuurit projektin mukana. Projekti ei saa olla riippuvainen väliaikaisista selainosoitteista tai alkuperäisen tiedoston sijainnista.
8. Toteuta kaksi selvästi erilaista esityspolkua samalle mallille.
Ensimmäinen on tyylitelty 3D-esitys.
Tavoittele siistiä, rauhallista ja asiakkaalle esiteltävää ilmettä:
Hyvin luettavat muodot.
Tyylitellyt mutta tunnistettavat materiaalit.
Hallitut reunaviivat.
Pehmeät varjot.
Kevyt ympäristövarjostus.
Hyvä oletusvalaistus.
Muutama valmis tausta- ja valaistustyyli.
Käyttäjän pitää saada hyvä kuva ilman laajaa renderöintiasetusten säätämistä. Tyylittely ei saa muuttaa varsinaisen mallin geometriaa tai mittoja.
Lasi tarvitsee ymmärrettävät asetukset värille, kirkkaudelle ja sameudelle. Tarjoa tabletilla tarvittaessa kevyempi esikatselu.
Valoa tuottavan materiaalin pitää voida sekä näyttää valaisevalta että valaista ympäröiviä pintoja. Pelkkä emissive-väri tai bloom ei täytä jälkimmäistä vaatimusta.
Reaaliaikaisessa esityksessä valaisevaan pintaan voidaan liittää hallittu valolähdeapproksimaatio. Esimerkiksi LED-nauhan lisääminen ei saa edellyttää lukuisten valojen käsin sijoittamista. Valojen pitää seurata kappaleen muutoksia ja kopioita.
Mahdollinen tarkempi renderöinti voi käyttää erillistä laskentapolkua myöhemmin. Peruskäyttö ei saa riippua raskaasta renderöinnistä tai palvelimesta.
Toinen esityspolku on tekninen 2D-piirustus.
Sen pitää käyttää aina ortografista rinnakkaisprojektiota. Perspektiivi ei saa päästä vahingossa tekniseen mittakuvaan.
Toteuta:
Selkeät ulkoreunat ja näkyvät rakenneviivat.
Piiloviivojen poistaminen tai näyttäminen katkoviivoina.
Tasopintojen sisäisten renderöintikolmioiden poistaminen piirustuksesta.
Hallitut viivanpaksuudet.
Valkoinen tai vaalea tausta.
Materiaalitekstuurien piilottaminen oletusarvoisesti.
Myöhemmässä vaiheessa leikkauskuvat ja leikkauspintojen kuviotäytöt.
Johda teknisen kuvan viivat geometriasta ja näkyvyystarkastelusta. Pelkkä 3D-näkymän kuvakaappaus reunaviivaefektillä ei riitä lopulliseksi piirustusratkaisuksi.
9. Tee ensimmäisten mittakuvien tuottamisesta erityisen nopeaa.
Käyttäjän pitää voida valita kaluste ja käynnistää ”Luo mittakuvat”.
Toiminto ehdottaa etu-, sivu- ja yläkuvaa sekä kokonaisleveyden, korkeuden ja syvyyden mittoja. Käyttäjä hyväksyy ehdotuksen ja lisää tarvittaessa yksityiskohtia.
Tarvittavia mittatyyppejä ovat:
Vaaka- ja pystymitta.
Kahden pisteen välinen kohdistettu mitta.
Reiän halkaisija.
Pyöristyksen säde.
Kulma.
Ketjumitoitus ja samasta lähtöpisteestä tehtävä mitoitus.
Teksti ja osoitinviiva.
Mitat perustuvat mallin geometriaan. Niitä ei lasketa ruudun pikseleistä.
Erota todellinen geometrinen pituus ja näkymätasoon projisoitu etäisyys. Älä esitä vinon kappaleen lyhentynyttä projektiota huomaamatta sen todellisena pituutena.
Mitoitus on ensisijaisesti assosiatiivista dokumentointia: se seuraa mallin muutoksia. Täysi mittojen ohjaama parametrinen ratkaisija on erillinen mahdollinen jatkokehitys.
Mitoituksen tekstikoko ja viivanpaksuus määritellään tulostettavan arkin yksiköissä. Zoomaus ei saa muuttaa lopullisen PDF tekstikokoa.
Tarjoa:
A4- ja A3-arkit vaaka- ja pystysuunnassa.
Sopivat valmiit mittakaavat, kuten 1:1, 1:5, 1:10 ja 1:20.
Useita näkymiä samalle arkille.
Siisti oletussijoittelu.
Muokattava otsikkokenttä projektin, osan, päivämäärän, revision ja mittakaavan tiedoille.
Vektoripohjainen PDF- ja SVG-vienti.
PNG-vienti nopeaan jakamiseen.
Varmista viennin fyysinen mittakaava automaattisesti tarkistettavalla esimerkillä. Tulostusohjeessa ilmoitetaan tarvittaessa 100 prosentin tulostuskoko.
10. Suunnittele käyttöliittymä ja tablettikäyttö yhtenä kokonaisuutena.
Mallinnusnäkymälle annetaan mahdollisimman paljon tilaa. Pidä usein tarvittavat työkalut näkyvissä ja näytä lisäasetukset valinnan tai aktiivisen työkalun perusteella.
Tarvitaan selkeät alueet työkaluille, mallihierarkialle, layereille, komponenteille, materiaaleille, sceneille ja valinnan ominaisuuksille. Kaikkien paneelien ei tarvitse olla auki samanaikaisesti.
Työkalun tila näkyy esimerkiksi lyhyenä ohjeena:
”Valitse pinta.” ”Vedä tai anna etäisyys.” ”Valitse leikattava kappale.”
Tablettikäytössä:
Tavallinen napautus valitsee.
Muokkaustyökalun ollessa aktiivinen yhden sormen tai kynän veto käyttää työkalua.
Kahden sormen eleet navigoivat.
Panoroinnin, zoomauksen ja orbitoinnin säännöt ovat johdonmukaiset.
Tarjoa tarvittaessa erillinen navigointitila virheellisten muokkausten välttämiseksi.
Numerosyötölle on kosketettava kenttä ja sopiva numeronäppäimistö.
Undo, redo, hyväksy, peruuta, monivalinta ja akselilukitus ovat saavutettavissa ilman näppäimistöä.
Keskeisten painikkeiden kosketusalue on vähintään noin 44 × 44 CSS-pikseliä.
Mikään olennainen toiminto ei saa riippua hoverista, oikeasta hiirenpainikkeesta tai pikanäppäimestä.
Näytön kääntäminen ei saa hävittää keskeneräistä työtä.
Kynätukea voidaan hyödyntää, mutta kynä ei ole vaatimus.
Testaa pienien reunojen ja pintojen valintaa kosketuksella. Tarjoa tarvittaessa suurennettu valinta-alue tai tapa kiertää päällekkäisiä valintakohteita.
11. Toteuta tallennus, tiedostot ja palautuminen alusta alkaen.
Ohjelman perustoiminta ei vaadi käyttäjätiliä tai palvelinyhteyttä.
Projektiformaatti on dokumentoitu ja versioitu. Sen pitää säilyttää:
Geometria ja mesh-kappaleet.
Objektien ja komponenttien tunnisteet.
Hierarkia ja layerit.
Komponenttimääritelmät ja instanssit.
Materiaalit, tekstuurit ja niiden sijoittelu.
Scenet.
Mitat, annotaatiot ja piirustusarkit.
Yksiköt ja projektiasetukset.
Toteuta paikallinen automaattitallennus, palautuminen sivun uudelleenlatauksen jälkeen sekä projektitiedoston vienti ja tuonti.
Paikallisen selaintallennuksen lisäksi tarvitaan käyttäjän ladattava projektitiedosto. Pelkkää selaimen tallennustilaa ei käsitellä pysyvän säilymisen takeena.
Käytä tablettiselaimissa toimivia tiedostonvalinnan ja lataamisen ratkaisuja. Edistyneitä tiedostojärjestelmärajapintoja voidaan hyödyntää lisäominaisuutena.
Lisää tarkoituksenmukaisissa vaiheissa STEP-vienti tarkalle geometrialle sekä GLB- ja STL-vienti niitä tarvitseviin työnkulkuihin. Oma projektitiedosto säilyttää muokkauskelpoisuuden ja sovelluksen lisätiedot.
12. Aseta suorituskyvylle mitattavat tavoitteet.
Tavoitteena on sujuva tavallisen kalusteen, huoneen ja satoja yksinkertaisia osia sisältävän kokonaisuuden käsittely.
Hyödynnä:
Komponenttien geometrian jakamista.
Tarvittaessa instanssirenderöintiä.
Näkymän mukaan sovitettua geometrian tarkkuutta.
Rajattuja tekstuurikokoja ja muistibudjetteja.
Valikoivaa uudelleenlaskentaa.
Muokkausten aikaista kevyempää esikatselua.
Muistin vapauttamista poistettujen objektien ja tekstuurien yhteydessä.
Optimointi ei saa rikkoa yksittäisen komponentti-instanssin valintaa, pintamateriaaleja tai mitoitusta.
Määritä ja kirjaa vertailulaitteet sekä testimallit. Tavoittele tavallisessa navigoinnissa noin 60 fps tietokonekokemusta ja vähintään noin 30 fps tablettikokemusta sovitulla testimallilla. Nämä ovat mitattavia tavoitteita, eivät oletettuja saavutuksia.
13. Etene seuraavissa toteutusvaiheissa.
Vaihe 0: tarkista perusta ja suurimmat riskit.
Tutki olemassa oleva projekti ja sen ohjeet. Jos projektia ei ole, luo tarkoituksenmukainen pohja.
Varmista pienillä kokeiluilla:
CAD-ytimen toiminta selaimessa ja workerissa.
Pursotus, leikkaus ja pyöristys.
Pintavalinnan yhdistäminen tarkkaan geometriaan.
Geometrian tallentaminen ja avaaminen.
Kosketusohjauksen perusrakenne.
Ortografisen teknisen kuvan tuottamisen toteutuskelpoisuus.
Kirjaa valinnat ja todetut rajoitukset lyhyesti.
Vaihe 1: toteuta ensimmäinen kokonainen työnkulku.
Käyttäjä pystyy:
Aloittamaan projektin.
Piirtämään tarkan suorakulmion.
Antamaan sille paksuuden push/pull-toiminnolla.
Valitsemaan ja siirtämään kappaletta tartuntojen avulla.
Vaihtamaan perspektiivin ja rinnakkaisprojektion välillä.
Avaamaan etukuvan ja lisäämään siihen mitan.
Tallentamaan ja avaamaan työn.
Perumaan ja palauttamaan muokkauksia.
Viemään ensimmäisen yksinkertaisen mittakuvan SVG-muodossa.
Tämän työnkulun pitää olla käytettävissä myös kosketusohjauksella.
Vaihe 2: toteuta layerit, ryhmät ja komponentit.
Varmista erityisesti linkitettyjen instanssien muokkaus, uniikiksi tekeminen, hierarkia sekä näkyvyys- ja lukitussäännöt.
Vaihe 3: laajenna mallinnus.
Lisää pintaan piirtäminen, sisäänpäin leikkaaminen, boolean-operaatiot, viisteet, pyöristykset, offset ja mesh-kappaleiden sovitut muokkaustoiminnot.
Vaihe 4: toteuta materiaalit.
Lisää materiaalikirjasto, omat tekstuurit, pintakohtainen sijoittelutyökalu, lasi ja valoa tuottavat materiaalit.
Vaihe 5: toteuta scenet ja tyylitelty 3D-esitys.
Lisää tallennetut näkymät, esitystyylit, toimivat valaistusoletukset ja kuvavienti.
Vaihe 6: viimeistele tekniset piirustukset.
Toteuta piiloviivojen käsittely, assosiatiiviset mitat, piirustusarkit, PDF-vienti, automaattiset perusnäkymät ja leikkauskuvat.
Vaihe 7: viimeistele tablettikäyttö ja suorituskyky.
Testaa kokonaisia suunnittelutehtäviä tavoitelaitteilla. Korjaa havaittuja kitkakohtia, valintavirheitä ja pullonkauloja.
Jokaisen vaiheen jälkeen sovelluksen pitää pysyä ajettavana ja aiempien työnkulkujen toimivina.
14. Varmista toiminta oikeilla esimerkkitöillä.
Esimerkki A: yksinkertainen kaappi.
Ulkomitat 600 × 800 × 560 mm.
Levypaksuus 18 mm.
Rungon osat, hylly ja ovi erillisinä muokattavina osina.
Linkitettyjä hyllykomponentteja.
Rungolle, oville ja mitoitukselle omat layerit.
Puutekstuuri, jonka syysuuntaa voi kääntää eri osissa.
Etu-, sivu- ja yläkuva sekä tyylitelty havainnekuva.
Esimerkki B: työtaso.
Mitat 1800 × 600 × 30 mm.
Toisella kappaleella leikattu aukko.
Valittujen reunojen pyöristys tai viiste.
Omaan kuvaan perustuva materiaali.
Tekstuurin siirto, kierto ja todellisen mittakaavan säätö.
Mittakuva, jossa näkyvät tason koko sekä aukon koko ja sijainti.
Esimerkki C: yksinkertainen seinärakenne.
Seinä ja oviaukko.
Kerroksia tai rakenneosia eri layereilla.
Tallennettu 3D-näkymä, naamakuva ja leikkausnäkymä.
Aukon mitoitus.
Näkyvyyksien vaihtuminen scenejen mukana.
Testaa lisäksi:
Komponentin yhteinen muokkaus ja uniikiksi tekeminen.
Materiaalin sijoittelun säilyminen tallennuksen jälkeen.
Mittauksen päivittyminen mallin muuttuessa.
Kadonneen mittausviitteen näkyvä virhetila.
Epäonnistuneen geometriatoiminnon turvallinen peruminen.
Undo/redo usean erilaisen muokkauksen yli.
PDF tai SVG fyysinen mittakaava.
Valaisevan materiaalin vaikutus viereiseen pintaan.
Koko projektin avaaminen tekstuureineen ilman alkuperäisiä lähdetiedostoja.
Käytä geometrian oikeellisuudessa esimerkiksi mittojen, tilavuuksien ja kelvollisuuden tarkistuksia. Pelkät kuvakaappaukset eivät riitä todentamaan laskennan oikeellisuutta.
Käytä käyttöliittymän arvioinnissa oikeita työnkulkuja. Älä väitä toimintoa testatuksi fyysisellä tabletilla, jos olet käyttänyt vain selaimen kosketusemulointia.
15. Aloita toteutus konkreettisesti.
Aloita tutkimalla projekti, määrittelemällä tietomallin perusta ja toteuttamalla vaiheiden 0–1 toimiva kokonaisuus.
Tee tavalliset tekniset valinnat itsenäisesti. Kysy vain sellaisista olennaisista ristiriidoista, joita ei voi ratkaista tämän määrittelyn perusteella.
Pidä kokonaisvisio mukana, mutta toteuta kerrallaan toimiva työnkulku. Käyttöliittymässä näkyvien valmiiksi merkittyjen toimintojen pitää tehdä oikea työ.
Raportoi toteutuksen jälkeen:
Mitä käyttäjä pystyy nyt tekemään.
Miten sovellus käynnistetään.
Mitkä työnkulut tarkistettiin.
Mitkä rajoitukset havaittiin.
Mikä on seuraava toteutettava vaihe.
Suunnittele kaikki niin, että käyttäjä voi avata ohjelman, mallintaa mittatarkan kalusteen ja tehdä siitä luettavan mittakuvan mahdollisimman nopeasti.
