# Nivo

**Ideasta mitoitettuun muotoon.** Selaimessa toimiva avoimen lähdekoodin
3D-suunnittelutyökalu kalusteille, rakennusosille ja tiloille.

Versio **0.51.2** tuo **P → Valo** -osion mallinnusnäkymään. Valitse osa
tai pinta, säädä LED-/spottiasetukset ja suuntaa spotti napsauttamalla
kohdepistettä. Keilan apuviivat päivittyvät suunnan ja leveyden mukana.
Valon suunta voi olla vapaa ja kääntyy osan mukana; asetukset säilyvät renderiin.

Versio **0.51.1** lisää Metallit-kokoelmaan hieman ruostuneen raudan,
kiillottuneen patinoituneen raudan ja mustan raudan. Saumattomien pintojen
väri, karheus, metallisuus ja hienovarainen kohokuvio toimivat mallinnuksessa,
renderissä ja GLB-viennissä. Sävyä ja kiiltoa voi säätää tavalliseen tapaan.

Versio **0.51.0** lisää **Animaatio → Sarana / Liuku**. Valitse kiinteä
ankkuri ja liikkuvat osat, poimi pivot pisteestä tai reunasta ja määritä
avautumiskulma tai liukumatka. Jokaisella liikkeellä on oma Suljettu–Auki-asento:
esimerkiksi kuusi laatikkoa avautuvat erikseen. Esikatselu ei muuta geometriaa.
Nimetyt pivotit, pysyvät osatunnisteet ja avaus-/sulkemisanimaatiot kulkevat
GLB-viennissä myös muihin 3D-ohjelmiin. [Pivotit ja animaatiot](docs/pivotit-ja-animaatiot.fi.md).

Versio **0.50.3** korjaa kynän jaon saman tason kolmiorajojen yli.
Piirto jakaa koko vedon alle jäävän pinnan, ja alueita voi pursottaa erikseen.
Kynäviivojen ja kappaleiden reunojen todelliset risteykset ovat nyt yhteisiä
tartuntapisteitä. Järjestys on kulmat, keskipisteet, risteykset ja reunat;
tarkka tähtäys ja näkyvyys huomioidaan edelleen. Geometriamuokkauksessa
pienet koordinaattivirheet eivät enää jätä lähes tasaisiin pintoihin
satunnaisia kolmioreunoja. Tarkoitukselliset pinnanjaot säilyvät.

Versio **0.50.2** säilyttää kynällä jaetut pinta-alueet, kun saman paksun
kappaleen toista aluetta pursotetaan. Myös suorakulmioiden ja ympyröiden
rajaukset säilyvät erikseen muokattavina. Osan muokkauksessa uusi kynäviiva
ei enää täytä vanhan viivaverkoston muita silmukoita uudelleen: jo tehtyjen
painaumien päälle ei synny sen vuoksi irrallista peittävää pintaa.

Versio **0.50.1** korjaa muokkaustilassa pinnalle piirtämisen. Ghost-osa
säilyy muokattavana, ja sen päällä oleva erillinen tasomuoto antaa tartuntoja
kaappaamatta muokkauksen kohdetta. Lähellä mutta eri korkeudella oleva
apuviiva ei enää nosta piirron aloitusta pois pinnalta. Shiftillä viitteen
voi projisoida aktiiviselle tasopinnalle. Kynän reunasta reunaan vedetty
viiva jakaa pinnan heti, ja uusia alueita voi pursottaa erikseen.

Versio **0.50.0** lisää **P → Pintakerrokset**: pölyn, naarmut, sormenjäljet
ja vesijäljet pohjamateriaalin päälle. Lisää kerros koko osalle tai pinnalle,
tai aseta paikallinen jälki napsauttamalla tasopintaa. Kokoa, kiertoa,
voimakkuutta ja sävyä voi muuttaa; kerroksen voi piilottaa tai poistaa.
Kerrokset näkyvät myös renderissä ja GLB-viennissä. Paikallinen jälki on tässä
versiossa rajattu tasopintoihin; koko pinnan kerros toimii myös kaarevilla pinnoilla.
Veitsi käsittelee nyt sekakappaleen suljetut tilavuudet ja paksuudettomat pinnat
niin, ettei kelvollinen vapaa viilto peruunnu väärään tilavuusvertailuun.

**Muodot → Polkua pitkin** luo viivasta tai Bézier-käyrästä putken, johdon,
kanavan tai listan. Valitse pyöreä tai suorakulmainen profiili ja haluttaessa
seinämä. Lähtöpolku säilyy ja valmis osa on itsenäinen. Ympyrän, ellipsin
ja pallon **Pinnan tarkkuus** tarjoaa nyt 3–128 sivua myös suoraan tavallisessa
muototyökalussa. Tarkka kaareva CAD-muoto pysyy oletuksena; sivumäärä tekee
ympyrästä aidon monikulmion ja pallosta kolmioverkon.

Valitse osa ja **Ghost** näkymäpalkista: **Läpinäkyvyys**-liukusäädin
näyttää pohjakuvan mallin läpi. Reunat ja tartunta säilyvät. Säätö koskee
valittuja osia tai muokkaustilassa aktiivista osaa; ilman valintaa koko
näkymää. Materiaalit ja renderöinti eivät muutu. **Solid** palauttaa pinnat.

Versio **0.49.0** lisää **Julkisivut**-materiaalit: betonin sekä hienon ja karkean
rappauksen. Laaja sävykuvio, pieni fyysinen normal-rakenne ja karheus toimivat
mallissa, renderissä ja GLB-viennissä. Myös aiemmille betoni-, kipsi- ja
tasoitepinnoille voi kytkeä **Pinnan rakenne · PBR → Laaja pintakuvio**.
Vanhojen mallien ulkonäkö ei vaihdu automaattisesti.

GLB-vienti jakaa identtiset geometriat ja materiaalit. Valinnaiset GPU-instanssit
sekä kolmen etäisyysversion **LOD-paketti** löytyvät **Vie 3D-malli → GLB**.
Paketin raportti kertoo toteutuneet kolmiomäärät; etäisyydet asetetaan
kohdeohjelmassa. Sylinterin tasainen pääty säilyy push/pull-muokattavana myös
geometriamuokkauksen skaalaamisen jälkeen, ja pyöreä reunasilmukka valitaan
yhdellä napsautuksella. [Materiaalien ja viennin ohje](docs/julkisivut-ja-glb.fi.md).

Versio **0.48.2** korjaa geometriamuokkauksen symmetristen monikulmioiden
kolmioinnin. Symmetrisen reunan laskeminen muodostaa symmetrisen pinnan
myös käännetyssä kappaleessa. Tahalliset epäsymmetriset pisteiden siirrot
säilyvät vapaina. Esikatselu ja hyväksytty CAD-osa käyttävät samaa laskentaa.

Versio **0.48.1** koventaa Verkko ja pinta -työnkulun. Uusi leikkaussilmukka
jää oranssiksi valinnaksi ja sitä voi heti siirtää, kiertää tai skaalata
kahvoilla tai tarkoin mitoin. Suojausmaski rajaa muotoilua ja maalausta;
sivellin huomioi pintojen yhteyden ja näkyvyyden. Verkon eheys tarkistetaan
taustalla ennen geometriamuutoksen hyväksymistä. Keskeneräinen työ varmistetaan
paikallisesti ja tarjotaan palautettavaksi samaa osaa avattaessa.
[Ohje ja testimallit](docs/verkko-ja-pinta.fi.md).

Versio **0.48.0** lisää yleisen **Verkko ja pinta** -työnkulun. Valitse yksi osa
ja avaa toiminto näkymän yläreunasta tai ominaisuuspaneelista. Erillisessä
työversiossa voi säätää verkkotiheyttä, luoda ympyrän/sylinterin/pallon
valitulla sivumäärällä, lisätä leikkaussilmukoita, peilata ja muotoilla
siveltimellä. Automaattinen UV-kartta, värin/karheuden/metallisuuden maalaus
sekä normal-, AO- ja materiaalikarttojen bake kuuluvat samaan näkymään.
Alkuperäinen osa säilyy; hyväksytty työ tallentuu yhdeksi projektihistorian
toiminnoksi. Kartat tallentuvat projektiin ja GLB-vientiin, ja niitä voi
ladata myös PNG-kuvina. Tämä on kolmioverkon työnkulku: CAD-pintatyökalut
ovat edelleen käytettävissä alkuperäiseen tarkkaan osaan.

Versio **0.47.6** yhdistää renderiohjelman kahteen kertaan sisältämän varjo- ja
materiaalilaskennan yhteiseksi laskentapoluksi. Valot, heijastukset ja
läpinäkyvyys säilyvät: GPU-vertailussa vanhan ja uuden laskennan pikselit
ovat samat. Kamera- ja materiaaliasetusten peräkkäiset muutokset valmistellaan
yhtenä ohjelmana; ylänäkymä ei enää käännä ensin ylimääräistä oletusohjelmaa.
Windowsin useiden minuuttien aloitusviive on käyttäjän mukaan yhä olemassa
0.47.5:ssä. Sen korjaantumista ei ole vielä vahvistettu RTX-laitteella.

Versio **0.47.5** poistaa renderin tekstuurihauista tarpeettoman pikselien
välisen riippuvuuden. Windowsin shader-kääntäjä voi joutua sen takia
avaamaan suuren sädepolkusilmukan, vaikka mallissa olisi vain yksi osa.
Materiaalien alkuperäinen tekstuuritaso ja suodatus säilyvät. Heijastusten
apuohjelma jätetään valmistelematta, jos materiaalit eivät tarvitse sitä.
Renderin
**Kuva → Renderöinnin vianmääritys** antaa ladattavan raportin valmisteluajoista,
selaimesta ja näytönohjaimesta. Raportti ei sisällä mallia eikä lähde
automaattisesti verkkoon. Windowsin nopeutuminen vaatii vielä laitetestin.

Versio **0.47.4** korjaa geelin ja peilien lähikuvassa toistettua GPU-jumia.
Renderi laskee yhden sädepolun pikseliä kohti kerrallaan; ongelmallinen
kiiltävien pintojen toinen laskenta saman shader-kutsun sisällä on poistettu.
Renderiohjelma esivalmistellaan oikealle kuvaformaatille, joten ensimmäinen
näyte ei käynnistä uutta estävää shader-käännöstä. Materiaalit, heijastukset,
taittuminen, kohinanpoisto ja kuvan lopullinen tarkkuus säilyvät.

Versio **0.47.3** tarkentaa renderin käynnistystilaa ja rajaa jumittuneet odotukset.
Materiaalien lataus, renderiohjelman valmistelu ja näytönohjaimen odotus näkyvät
erikseen. Kesken olevan valmistelun voi perua; valmistelun aikana ei lähetetä
tyhjiä GPU-eriä. Tämä päivitys ei muuta valolaskentaa tai kuvanlaatua.

Versio **0.47.2** selkeyttää mitoitusta ja huomautuksia. Mittateksti pysyy
ruudulla vaakasuorassa ja sen kiertoa voi säätää valitun dimension paneelista.
Uudessa viivatyylissä apuviivat ovat keskeltä katkotut ja päätemerkit vinot;
alkuperäisen yhtenäisen tyylin voi valita asetuksista. Sama esitys toimii
mittakuvissa sekä SVG- ja PDF-viennissä. Myös Hold-lukittuihin osiin voi mitata.
Huomautuksen kohdistusviivalla on oma väri, ja teksti- sekä kehysasetukset
ovat suoraan näkyvissä. **Huomautus → Korostussuorakulmio** rajaa alueen
ilman tekstiä tai geometriaa; väri, viivatyyli, paksuus ja kevyt taustaväri
ovat muokattavissa. Mittakuvan **Korosta alue** käyttää samoja valintoja.

Versio **0.47.1** korjaa renderin puutekstuurien pehmenemistä. Kohinanpoisto
säilyttää saman pikselialueen syykuvion, jonka varsinainen renderi laskee.
Materiaalikuvat pakataan eri kokoisina 128 MiB:n muistirajan sisään; tummat
sävyt ja normaalikartat säilyvät aiempaa tarkempina. Heijastusten karheutta
ei enää kasvateta laskennassa keinotekoisesti. Korjaus toimii näkymässä ja
kuvanviennissä. Puuta, kromia ja heijastuvaa puupintaa verrataan automaattisessa
GPU-testissä 4 096 näytteen raakakuvaan, ei pelkkään kuvan tasaisuuteen.
Myös osien reunojen kohinaa käsitellään niiden todellisen peittävyyden avulla.
Pintamaalaus ei enää monista spottivaloja, ja nopean esikatselun varjokarttojen
tekstuurirajan ylitys on korjattu. [Mittaukset ja rajat](docs/performance.md).

Versio **0.47.0** erottaa kiiltävän pinnan perusvalaistuksen ja heijastuksen
kohinanpoistossa. Heijastuvan pinnan tiedot suojaavat yksityiskohtia. Tässä
versiossa lisätty toinen sädepolku poistettiin vakauden vuoksi versiossa 0.47.4.
Sama laskenta toimii
renderinäkymässä ja kuvanviennissä. Aiempi terävien reunojen korjaus säilyy.

Geometrian muokkaus rakentaa muutetun tasopinnan kolmioinnin uudelleen
rajojen ja aukkojen perusteella. Ympyrän reunapisteen nosto ei enää levitä
vanhaa kolmioiden viuhkaa koko pinnan yli. Valinnainen **Pehmeä muotoilu**
vaikuttaa pintaa pitkin lähimpiin pisteisiin; tarkka pistesiirto on oletus.
Pintajaot, materiaalit, historia ja verkkokopion selkeä erottelu säilyvät.

Versio **0.46.7** korjaa tarkentuvan renderin pehmeitä ja rosoisia osien reunoja.
Kameran näytteet pysyvät oman pikselin alueella, ja kohinanpoisto säilyttää
vinojen reunojen pehmennyksen. Renderikuvan sovittaminen näyttöön ei enää sekoita
eri tarkkuuksien reunoja. Myös hieno värikuvio ja jo tarkentuneet valoerot säilyvät
paremmin. Sama korjaus toimii näkymässä ja kuvanviennissä. Valoläikkäkorjaus säilyy;
heijastusten ja reunapikselien kohina voi edelleen tarvita lisää näytteitä.

Versio **0.46.6** korjaa geometrian muokkauksen avaamisen pitkään auki olleessa
välilehdessä. Työkalu latautuu sovelluksen mukana, joten päivityksen poistama
vanha skriptitiedosto tai myöhemmin katkennut yhteys ei estä sen avaamista.

Versio **0.46.5** korjaa vaaleiden pintojen venyneitä valoläikkiä.
Kohinanpoisto tunnistaa saman vinon pinnan ja seuraa jäljellä olevaa kohinaa
vaiheittain. Se tasoittaa kirkkaita kohinaryhmiä säilyttäen puunsyyt, pintojen
rajat ja pienet valokohdat. Korjaus toimii sekä renderinäkymässä että kuvan
viennissä. Peiliheijastusten kohina tarvitsee edelleen jatkokehitystä.

Versio **0.46.4** korjaa tarkentuvan renderin toistuvaa raekuviota ja
pienten sisävalojen näytteistystä. Myös pyöreät LED-pinnat osallistuvat
suoraan valonäytteistykseen. Kohinanpoisto käsittelee harvat kirkkaat osumat
useassa mittakaavassa; materiaalien syyt, pinnan muodot ja reunat ohjaavat
suodatusta. Korjaus koskee sekä näkymää että tarkkojen kuvien vientiä.
Peilit ja koteloidut valot voivat edelleen tarvita enemmän näytteitä.

Versio **0.46.3** korjaa kynän klikkaukset lähellä mallia: aloitus ja
jatkopisteet käyttävät piirrettävää tasoa myös origon jäädessä kameran taakse.
Ympyrän tarkka kaarireuna tunnistetaan osan pintaan kuuluvaksi myös
suorakulmiota aloitettaessa. Kynän suunta löytyy myös heti kameran käännön jälkeen.

Versio **0.46.2** lisää geelit, aerogeelin pinta-arvion ja kymmenen uutta
muovimateriaalia. Materiaalin **Läpäisy ja sisäinen sävy** -säädöt toimivat
maalaustyökalussa, osapaneelissa ja renderissä. Sisäinen sävy voimistuu
paksuuden mukana; aerogeelin tilavuussironta on jatkokehityksessä.

Versio **0.46.1** korjaa ruudukkoa pienemmän liikkeen kirjoitussuunnan,
kameran liikuttamisen keskeneräisen pursotuksen aikana ja leikatun sylinterin
pituuden muuttamisen. Pintaan piirretty muoto leikkaa myös reiän pyöristyksen
yli. Pyörityskahva mukautuu zoomiin. Muodoissa on **Suorakulmio keskeltä**,
ja työkalupalkissa kevyet Piirrä / Muokkaa / Mittaa -ryhmittelyt.

Versio **0.46.0** toi geometrian muokkauksen samaan mallinnusnäkymään.
Avaa osa ja valitse yläreunasta **Koko osa / Pisteet / Reunat / Pinnat**.
Reunaan voi tarttua suoraan ja vetää sitä myös paksuudettomalla pinnalla.
**M / R / L** siirtää, kiertää tai skaalaa valittua geometriaa. Liittyvät
pinnat mukautuvat, muut pisteet pysyvät paikoillaan. Koko osa -valinta
palauttaa tavallisen osakohtaisen käsittelyn.

Kamera, työkalupalkki ja projektin Peru/Palauta säilyvät yhteisinä.
Shift lisää geometriaa valintaan; siirron aikana se poimii tarkan viitteen
myös muista osista ja mittaviivoista. Tavalliseen pintatyökaluun voi vaihtaa
suoraan. Kelvollinen keskeneräinen muutos hyväksytään ensin; virheellinen
muutos jää korjattavaksi. **Valmis** sulkee työtilan.

**Muokkaa mittoja** löytyy sekä normaalista osapaneelista että geometriatilasta.
Perusmuodon leveys, syvyys, halkaisija ja paksuus säilyvät muokattavina.
Tuetun CAD-osan ulkomitta muuttuu päätypintaa siirtämällä, jolloin esimerkiksi
reikä ja pyöristyssäde säilyvät. Epäselvää päätypintaa ei päätellä väkisin.
Tämä ei ole vielä kaikkien mallinnusvaiheiden parametrinen muokkaushistoria.

Suorareunaiset tasopinnat palautetaan tarkaksi CAD:ksi. Kaarevan CAD-osan
vapaa pistemuokkaus tarvitsee edelleen erikseen hyväksytyn verkkokopion;
CAD-pintatyökalut säilyvät alkuperäisessä osassa. Hold, linkitykset,
uniikiksi tekeminen ja mittapisteiden viitteet huomioidaan.
[Työnkulku, rajat ja jatkokehitys](docs/roadmap.md#v0460--yhteinen-geometriatyötila).

Versio **0.44.1** lisää **Omat osat → Tuo osia kirjastoon** -toiminnon.
Valitse yksi tai useampi valmis .nivo-tiedosto ja lisää osat myöhemmin malliisi.
Tuonti säilyttää avoimen projektin ja sen historian. Kaikki valitut tiedostot
tarkistetaan ennen yhteistä tallennusta; valmistajien aineistoa ei jaeta sovelluksen mukana.

Versio **0.44.0** lisää **Projektikirjasto → Tuotekirjasto** -näkymän:
43 tuotetta ja tuoteperhettä SAVOlta, Blumilta, GRASSilta, Hettichiltä,
Häfeleltä, Geberitiltä, Orakselta, GROHElta, hansgrohelta ja Gustavsbergiltä.
Hae nimellä tai tuotekoodilla ja rajaa valmistajan tai käyttötarkoituksen mukaan.
SAVOn tarkistetuista asennusmitoista voi lisätä aukkoluonnoksen tai upotustilan.
Ne ovat asennusmittojen mukaisia yksinkertaisia CAD-muotoja, eivät varsinaisia
tuotemalleja. Valmistajan oman STEP-, GLB/glTF- tai STL-mallin voi tuoda
tuotekortin kautta ja tallentaa Omiin osiin. Tuotekoodi ja lähde säilyvät
projektissa; moniosainen tuonti muodostaa suljetun kokoonpanon.
Kirjastoon ei sisälly valmistajien jaeltavia CAD-malleja tai tuotekuvia.
Tuotesivujen lähdealue ja tarkistuspäivä näkyvät kortissa; valikoima ei ole
myyntitilastoihin perustuva suosituimmuuslista. [Rajaukset ja jatkokehitys](docs/roadmap.md).

Versio **0.43.0** lisää **Tasajaon** osille, muodoille ja mitta-/apuviivoille.
Valitse kohteet → **Tasajako** oikeasta paneelista tai kontekstivalikosta.
Kopioi valinta tai järjestä nykyiset osat kokonaismitan, jakovälin tai vapaan
välin mukaan. Ulkoreunojen kokonaismitta huomioi osien paksuudet; viitekohdiksi
voi valita ala-/alkureunan, keskipisteen tai ylä-/loppureunan. Viivoissa
5 väliä tarkoittaa 6 viivaa rajat mukaan lukien. Kaavio näyttää jaon ennen hyväksyntää.
Jaon asetukset tallentuvat projektiin: valitse sarjan osa → **Muokkaa tasajakoa**.
**Toteuta ja käytä leikkureina** avaa Cutin valmiilla työstökappaleilla.
Myös suljetut tasomuodot kelpaavat nyt Cutin läpileikkaaviksi leikkureiksi.
Jaon muokkaaminen ei laske jo tehtyä Cutia uudelleen; peru leikkaus, säädä jako
ja leikkaa uudelleen. Paksujen leikkureiden rajattu leikkaus toimii ennallaan.

Versio **0.42.1** tarjoaa Cutin yhteydessä valinnan tehdä kohteista uniikkeja
tai säilyttää niiden linkitykset. Uniikiksi tekeminen ja leikkaus peruuntuvat
yhdessä. Tab vaihtaa Cutin kohde- ja työstökappalevalinnan välillä.

Versio **0.42.0** parantaa tarkentuvan renderin kirkkaita pintoja. Kohinanpoisto
seuraa valonäytteiden vaihtelua ja suojaa puunsyitä, pintojen rajoja ja heijastuksia.
Valonäytteet painottavat lähellä olevia, pintaa kohti suuntautuvia valoja. GPU:n
laskentaerän koko mukautuu mitattuun valmistumisaikaan. Pienen materiaalivalikoiman
lähikuvissa mänty, tammi ja amerikkalainen pähkinä käyttävät 2K-karttoja.
Materiaalikuvien tarkentuvan renderin muistiraja säilyy 128 MiB:ssä.

Versio **0.41.1** vähentää mallintamisen aikaisia pysähdyksiä. Pilvisynkronointi
odottaa kahdeksan sekunnin työskentelytaukoa ja tarkistaa mallin taustasäikeessä.
Muuttumattoman mallin sisältötunnistetta ei lasketa uudelleen joka tarkistuksella.
Kynän esikatselu säilyttää valmiiden mittaviivojen grafiikan osoittimen liikkuessa.

Versio **0.41.0** parantaa tarkentuvan renderin kohinan pehmennystä myös kirkkailla
pinnoilla. Pinta-, normaalikartta- ja syvyystieto suojaavat materiaalien yksityiskohtia.
**Renderöi → Kuva → Kuvan ilme** tarjoaa realistisen peruskuvan lisäksi pehmeän
hehkun, unenomaisen ja utuisen viimeistelyn. Niitä voi säätää valmiiseen kuvaan
laskentaa aloittamatta alusta; sama ilme tallentuu myös PNG-kuviin.

Versio **0.40.5** täydentää saman toiminnon osan muokkaustilaan: Bézier-käyrän
ja kynäviivan sulkema rajaus voi luoda uuden pinnan myös osan avoimeen kohtaan,
esimerkiksi altaan sisään. Pinta kuuluu muokattavaan osaan, ja sitä voi pursottaa
Push/Pullilla. Olemassa olevien pintojen päälle ei lisätä päällekkäistä pintaa.

Versio **0.40.4** korjaa Bézier-kaaren sulkemisen kynän suoralla viivalla.
Yksi kaari ja yksi suora voivat muodostaa pinnan: **Valmis viiva** säilyttää
käyrän, ja sen päätepisteet yhdistävä kynäviiva täyttää rajauksen muokattavaksi
pinnaksi. Kaareva reuna säilyy myös Push/Pullissa.

Versio **0.40.3** valmistelee Supabasen käyttöönoton yhdellä komennolla:
migraatiot, kirjautumisen paluuosoitteet, sähköpostin linkki ja koodi sekä
julkiset selainasetukset. Pilviprojektin nimi ja versio päivittyvät listaan
heti synkronoinnissa, ja koodikirjautumisen voi hyväksyä Enterillä.
Nivon oma Supabase-palvelu on otettu käyttöön 13.10.2026. Projektikirjaston
pilviosiossa voi kirjautua ja ottaa projektin synkronoinnin käyttöön.
Aluksi sähköpostilinkit toimivat vain Supabase-tiimin osoitteilla; laajempi
käyttö ja omat viestipohjat vaativat erillisen SMTP-palvelun.
[Käyttöönotto](docs/cloud-sync.md).

Versio **0.40.2** selkeyttää siirron tartuntaa. **Shift** päivittää viitehaun heti
myös paikallaan olevan kohdistimen alla. Poimittu piste ja sen nimi näkyvät
viitekohteessa, ja katkoviiva yhdistää sen siirron päätepisteeseen. Valittu
akseli tai vino siirtosuunta säilyy. Kohdepinnan keskipiste poimitaan pinnalta
eikä kappaleen sisältä, ja kaarevan reunan tarkka osoitus ohittaa saman reunan
viereisen segmentin kameran läheisyyden.

Versio **0.40.1** muistaa mallilistan avatut ja suljetut ryhmät projektikohtaisesti
samassa selaimessa myös välilehtien vaihdon ja sivun päivityksen yli. Mallista
valittu osa tulee näkyviin listassa, sen oma ryhmäpolku avautuu ja korostuu.
Muut suljetut ryhmät säilyvät suljettuina. Rivien **Riviväri** löytyy listan
palettipainikkeesta tai rivin oikealla napsautuksella. Värit tallentuvat `.nivo`-tiedostoon
ja ovat erillisiä osien materiaaleista. Listan paikannuspainike näyttää osan
oranssina viisi sekuntia myös seinän läpi.

Suorakulmion ja ympyrän **Shift-viite** poimii myös piirustustason ulkopuoliset
kaarevat reunat: esimerkiksi pyöristetyn oven reunan sijainti siirtyy viitteeksi
etupinnan tasolle ilman, että piirretty muoto hyppää pyöristyksen syvyyteen.

Versio **0.40.0** lisää Supabase-pilvisynkronoinnin ensimmäisen toteutuksen:
kirjautuminen, projektikohtainen taustatallennus, avaaminen toisella laitteella
ja rinnakkaisten muutosten säilyttäminen. Palvelu vaatii oman Supabase-projektin
asetukset ja tietokantamigraation; ilman niitä paikallinen tallennus jatkuu normaalisti.
[Käyttöönotto, testaus ja nykyiset rajat](docs/cloud-sync.md).

Reunakäsittelyt säilyvät nyt ketjuna: esimerkiksi 45 mm nurkkapyöristyksen päälle
tehty 2 mm reunapyöristys seuraa päädyn Push/Pullia ja käsittelyt voi poistaa
uusimmasta alkaen. Vanha geometriaan sulautunut, suorakulmaisesta aihiosta tehty
nurkkapyöristys palautetaan vain, jos koko geometria voidaan todistaa vastaavaksi.

Mallilistassa lukitusta näyttää yksi lukkokuvake. Ryhmän lukituskomento koskee
kaikkia alaisia ryhmiä ja osia myös vapautettaessa. Ryhmävalinta tarjoaa samat
yhteiset materiaali- ja muotoilutoiminnot kuin muut valinnat. Muodon käyttö ja
viitteen poiminta ovat oikeassa paneelissa poissa kiinnitetyn mallilistan alta.

Versio **0.39.0** kokoaa mittakuvan työkalut: suorat projektiot kuudesta suunnasta,
**Lisää mitta**, **Tekstilaatikko** ja **Korosta alue**. Tekstilaatikon voi sijoittaa
ilman kohdistusviivaa, muokata tuplaklikkaamalla ja siirtää vetämällä. Merkinnät
säilyvät projektissa ja tulevat PDF/SVG-vientiin. Samat merkinnät toimivat
leikkauskuvissa ja usean projektion arkeilla. Arkin projektioon pääsee mitoittamaan
tuplaklikkaamalla. Mallin sopivaan suuntaan piirretyt dimensiot näkyvät automaattisesti.

Yläpalkin **Projektin muutokset** vertaa mallia nimettyyn paikalliseen versioon
tai aiempaan .nivo-tiedostoon. **Lisätty** on vihreä, **Poistettu** punainen haamu ja
**Muokattu** meripihkan värinen. Numeroitu luettelo kertoo muuttuneet tiedot,
kohdistaa osan näkymään ja tallentuu CSV:ksi. Nykyinen geometria ja materiaalit
säilyvät. Nimetyt versiot tallentuvat tähän selaimeen; vertailutiedoston voi ladata
mukaan toiselle laitteelle. Versiot eivät vielä synkronoidu käyttäjätilille.

Versio **0.38.0** antaa puhelimella enemmän tilaa mallintaa: kapeampi
54 px työkalupalkki, avattavat mallilista ja ominaisuudet sekä yksi työtilavalikko.
Koko näytön painike pysyy näkyvissä. Selaimessa aloitus vaatii yhden napautuksen;
kotinäytölle lisätty Nivo avautuu erillisenä sovellusikkunana ilman osoitepalkkia.
Kotinäyttöasennus ei vielä sisällä offline-välimuistia.

Kosketuksella piirretty suorakulmio, ympyrä, ellipsi, monikulmio tai pallo jää
esikatseluun: **piirrä → tarkista mitat → Hyväksy muoto**. Sama numerovaihe on
kosketuksella Push/Pullissa ja Offsetissa. Hiiren välitön hyväksyminen säilyy.
Renderin pinnat ja valot avautuvat puhelimella erilliseen suljettavaan paneeliin.

**Lisää toimintoja → Jatka toisella laitteella** valmistelee jaettavan .nivo-tiedoston.
Puhelimella voi käyttää selaimen jakovalikkoa, muulloin ladata tiedoston.
Projektitunnus ja sisältöversio kulkevat mukana: saman version avaaminen käyttää
paikallista tallennetta, erilainen versio säilytetään erillisenä kopiona.
Tiedostosiirto toimii myös ilman pilvitiliä. Uudemman pilvisynkronoinnin käyttöönotto on kuvattu yllä.

Versio **0.37.0** lisää **Projektikirjaston** projektin nimen viereen:
useita selaimeen tallentuvia projekteja omine historioineen sekä **Omat osat**
uudelleenkäyttöä varten. **Lisää malli nykyiseen projektiin** tuo toisen
Nivo-mallin ryhmineen, materiaaleineen ja sisäisine linkkeineen yhdellä peruttavalla
toiminnolla. **Tallenna valinta kirjastoon** löytyy valinnan toimintovalikosta.

**Avaa** ja **Lisää malliin** lukevat myös STEP/STP-, STL- ja GLB/glTF-tiedostoja.
STEP on muokattavaa CAD-geometriaa; kolmiomalleja voi siirtää, kiertää, skaalata
ja maalata. **Vie 3D-malli** tallentaa STL:n 3D-tulostuksen sliceriin, STEP:n
CAD-ohjelmaan tai GLB:n materiaaleineen. STL-viennissä valitaan tarkkuus ja
sijoitus tulostusalustalle, ja avonaiset pinnat ilmoitetaan.

Valintapaneelin **Lukitse / Vapauta**, **Piilota** ja **Haamu** ovat ensimmäisellä pikarivillä. Ne toimivat koko monivalinnalle; linkitys on niiden alla. Jos vain osa valinnasta on lukittu, **Vapauta** poistaa valittujen lukot ja säilyttää muiden osien lukitukset.
Uniikiksi muuttaminen irrottaa linkin; linkitettäessä käyttäjä valitsee lähtöosan.
Oikean napin valikko kokoaa muut komennot **Muokkaa**, **Järjestä** ja
**Tallenna ja vie** -kohtiin. Koko näytön Esc huomioi selaimen tuen, jotta
kokonäytöstä poistuminen ei samalla peru keskeneräistä työkalua.

Versio **0.36.13** korjaa tarkentuvan renderin väärille osille päätyvät
pintamateriaalit ja LED-pinnat. Sama korjaus koskee tallennettavaa renderikuvaa.
Push/Pull muuttaa reunakäsitellyn levyn koko päätyä säilyttäen pyöristykset
ja viisteet. Offsetilla erikseen rajatut pinnat toimivat edelleen taskuina.

Versio **0.36.12** korjaa sylinterin päätypinnan Offsetin myös ontossa,
skaalatussa ja kierretyssä kappaleessa. Kehän sisennys suuntautuu oikein sekä
ulko- että sisäreunasta. Skaalaus poistaa laskennan kopiosta vanhan piirtoverkon,
joka saattoi estää muuten ehjän sylinterin muokkaamisen.

Versio **0.36.11** näyttää valittujen Hold-lukittujen osien kohdalla lukkokuvakkeen
ja lämpimän reunakorostuksen. Valinnan tiedoista näkee lukittujen osien määrän,
nimet ja mahdollisen lukitsevan ryhmän. Osaan voi keskittää kameran menettämättä
monivalintaa. Mallilistassa lukitus näkyy lukkopainikkeessa ilman erillistä Hold-tekstiä.

Versio **0.36.10** yhtenäistää kumittimen korostuksen ja napsautuksen.
Jakoviivan päässä oleva tartunta ei vaihdu tyhjän tilan valinnaksi.
Korostetun rajauksen voi kumittaa myös viereisen osan tai päällekkäisen
piirrosviivan läheltä; muokkauskohde seuraa korostettua rajausta.
Kynä tunnistaa jakopinnan myös olemassa olevan piirrosviivan päätepisteestä.

Versio **0.36.9** parantaa kynän pinnanjakoa: piirtopinta tunnistetaan osan
omista reunoista ennen ulkopuolisia viitteitä. Saman pinnan reunat, kulmat ja
keskipisteet saavat etusijan lähellä oleviin tason ulkopuolisiin pisteisiin.
Lukittu suunta tarttuu reunan todelliseen risteykseen. Kirjoitettu mitta
ohittaa tartunnan; Shiftin viitepoiminta ja vapaa kolmiulotteinen piirto säilyvät.

Versio **0.36.8** siirtää vinoa osaa sen omien reunojen suuntaisesti.
Magentan suuntalinjan näkee osan läpi. Kirjoitettu mitta ja ruudukon askel
lasketaan tätä suuntaa pitkin; positiivinen mitta seuraa vetoa.
X/Y/Z vaihtaa maailman akselille. Viitepisteet, Ctrl-kopiointi ja toisto
säilyttävät vinon suunnan.

Versio **0.36.7** korjaa automaattisen kiinnityspisteen 180° suunnanvaihdon.
Ankkurin läpi kulkevan linjan kauempi pää toimii oletuksena myös pinnalta poimitulla
ankkurilla. Shift vapauttaa kierron kulma-askelmat ja säilyttää viitetartunnan
myös käsin valitulla kiinnityspisteellä.

Versio **0.36.6** erottaa kierron ankkurin ja kiinnityspisteen. Kulma-ankkurin
vastapiste seuraa oletuksena samaa pitkää reunaa; keskiankkuri käyttää keskilinjaa.
**Valitse kiinnityspiste** poimii liikkuvan pisteen erikseen. Oranssi ankkuri,
sininen kiinnityspiste ja niiden välinen linja näyttävät kohdistuksen.
Tartunta käyttää tätä pistettä myös kiertorenkaasta tai muualta osasta vedettäessä.

Versio **0.36.5** tuo Rotaten **Valitse ankkuri** -painikkeen heti näkyviin.
Napsauta kulmaa, reunaa tai mittaviivaa ja vedä osan toisesta pisteestä tai renkaasta.
Kierto tarttuu mittaviivoihin ja muiden osien pisteisiin täsmällisellä kulmalla;
Shift vapauttaa tartunnan. Keskipiste säilyy oletuksena.

Versio **0.36.4** korjaa suurten mallien lyhyeksi kutistuvan Peru-historian.
100 vaihetta käyttää yhteistä geometriaa, ja myös selaimeen tallennetaan enintään
100 vaihetta. Toimintohistoria näyttää todellisen Peru/Palauta-määrän;
muisti- ja tallennusrajojen aiheuttama lyhentäminen ilmoitetaan.

Versio **0.36.3** säilyttää karkean renderikuvan seuraavan tarkkuuden pohjana.
Pikselit tarkentuvat neljään pienempään; uusi valolaskenta korvaa vanhan kuvan
asteittain. Vanhan kuvan vaikutus poistuu kokonaan kahdeksassa näytteessä.
GPU-erät hyödyntävät vapaata kapasiteettia rajatusti ja väistävät kameran liikettä.
Edellinen renderi on tallessa Git-tagissa
`render-before-continuous-refinement-v0.36.2`.

Versio **0.36.2** aloittaa renderin kevyesti ja tarkentaa kuvaa automaattisesti
kameran pysähdyttyä. Erillinen Kevyt/Täysi-valinta poistuu. Kameraa liikuttaessa
palataan heti nopeaan esikatseluun; näkyvä kuva päivittyy kokonaisina näytteinä.
GPU-laskenta ja esikatselun kuvakoko ovat rajattuja. Grafiikkayhteyden katkeamisesta
voi palautua projektia tyhjentämättä, ja renderkamera säilyy palautuksessa.

Versio **0.36.1** tallentaa myös profiloitujen osien aihiomitat automaattisesti.
Pituus on pisin mitta; linkitetyt kopiot jakavat mitat. Pyöristys ja viiste
säilyttävät aihion ilman uutta tarkistuspyyntöä. **F** valitsee nykyisiä reunoja,
myös useasta osasta, ja lisää uuden käsittelyn. Edellistä käsittelyä voi muokata
erikseen. Läheltä poiminta toimii perspektiivissä, ja kaarevalle kyljelle
piirtäminen aloittaa muodon kosketuspisteen tangenttitasoon.
Tarkentuva renderi ja kuvarenderi rajoittavat epäsuorien valonäytteiden
poikkeuksellisia kirkkauspiikkejä valkoisten firefly-pisteiden vähentämiseksi.

Versio **0.36.0** lisää **Muodot → Pinnan korkeudet**: piirrä esimerkiksi lattian,
suihkualueen ja pyöreän kaivon rajat, anna korkeudet **0 / −10 / −20 mm** ja
muodosta yhtenäinen pinta tai paksu lattia. Korkeuksia voi muuttaa myöhemmin
osan tiedoista. [Ohje ja esimerkkimalli](docs/surface-levels.fi.md).
Raskaiden osien Peru/Palauta hyödyntää rajattua geometriavälimuistia.
**Renderöi → Kuva → Kuvakulmat** tallentaa nimetyt kamerapaikat ja polttovälit projektiin.

Versio **0.35.0** lisää **P → Koko osa / Pinta** -maalauksen ja **Pipetin (I)**.
Pipetti poimii osoitetun pinnan materiaalin, sävyn, kiillon ja tekstuurin sijoittelun;
seuraava napsautus maalaa. Myös lukitusta osasta voi poimia materiaalin.
Siirto, kierto ja skaalaus käsittelevät koko osaa.

Kynän **R** kiertää alkaneen viivan suuntaa viimeisen pisteen ympäri **22,5°**
välein. Kirjoita halutessasi tarkka kulma. Napsautus tai Enter vahvistaa suunnan,
sitten osoita tai kirjoita pituus. Shift poimii pituuden myös tason ulkopuolelta.
**Renderöi → Kuva → Polttoväli** säätää objektiivia **12–200 mm** reaaliajassa.
24/35/50/85 mm pikavalinnat käyttävät 35 mm kennokoon vastaavuutta;
kameran paikka säilyy ja polttoväli tallentuu projektiin sekä vietyyn kuvaan.

Versio **0.34.2** erottaa pintavalinnan ja työkalun kohteen: **oranssi pistekuvio**
on valittu pinta, **sininen** on Push/Pullin tai Offsetin kohde. Valittu pinta
säilyy E/O-työkalua vaihtaessa myös hiiren ollessa toisen pinnan päällä.
Muokkaustilassa Delete käsittelee pintavalintaa myös muiden työkalujen aikana.
Siirto, kierto ja skaalaus käsittelevät kokonaista osaa; pintamaalaus on lisätty
versiossa 0.35.0.

Versio **0.34.1** korjaa offset-kehän keskelle jäävän paksuudettoman pinnan
poistamisen. Avaa osa muokattavaksi, napsauta keskialuetta ja paina **X/Delete**
tai **Poista pinta**. Myös **Cut** ja **Leikkaa aukko** tunnistavat pelkän
pinta-alueen poistumisen, vaikka kappaleen tilavuus ei muutu. Peru palauttaa
pinnan. Umpinaisen osan seinäpinnat säilyvät; niiden aukot tehdään Push/Pullilla
tai leikkaamalla.

Versio **0.34.0** lisää projektin omat **osatyypit ja määrälaskennan**.
Valitse yksi tai useampi osa ja luo **Tyyppi → Uusi tyyppi**: esimerkiksi
Laudelauta ja laskentatavaksi **Pituus · m**. Valinnan tiedoissa näkyvät
kappalemäärä ja yhteispituus. **Valitse kaikki samantyyppiset** kokoaa tyypin osat.
**Osat → Määrät** näyttää projektin tai ryhmän tyypit, pituuserittelyn ja CSV-viennin.
Vaihtoehdot ovat **kpl, m ja aihioala m²**; piilotetut osat ja kopiot lasketaan
mukaan, apugeometria jätetään pois. Kierto säilyttää pituuden. Tunnetun aihion
työstö päivittää mitat osan omassa suunnassa; epäselvät mitat vahvistetaan käsin.
Aihioalasta ei vähennetä aukkoja. Tyyppi luokittelee osat itsenäisesti niiden
ryhmästä, kokoonpanosta ja geometrian linkityksestä.

Versio **0.33.2** lisää yhdisteltävät **X/Y/Z**-painikkeet skaalaukseen.
Jätä esimerkiksi **X ja Y** päälle ja kytke **Z pois**, niin leveys ja syvyys
muuttuvat samalla kertoimella ja korkeus säilyy. Rajaus toimii myös kahvoista
vetäessä. Akselien vaihtaminen säilyttää syötetyn kertoimen.

Versio **0.33.1** nopeuttaa raskaiden CAD-osien siirtoa, kiertoa ja skaalausta.
Siirto ja kierto käyttävät valmista piirtoverkkoa, ja akseliskaalaus välttää
raskaan NURBS-tuloksen tarpeettoman verkotuksen säilyttäen tarkkuusrajat.
Rei'itetyn kiukaan paikallisessa vertailussa siirto **4,02 → 0,36 s**, kierto
**8,88 → 1,44 s** ja Z-skaalaus **64,77 → 42,13 s**. Myös Offsetin esikatselu,
Push/Pullin mittaus ja linkitettyjen kopioiden päivitys hyödyntävät valmista CAD-dataa.
Tarkka akselimuunnos on edelleen raskas suurilla kaarevilla kappaleilla.
[Menetelmä, rajat ja testit](docs/performance.md).

Versio **0.33.0** lisää **Skaalaa (L)** -työkalun osille, monivalinnalle ja
kokoonpanoille. Vedä kulmasta tasaisesti tai sivukahvasta yhtä akselia pitkin,
kirjoita kerroin tai tavoitemitta ja valitse kiintopiste. Esikatselu käyttää
nykyistä piirtoverkkoa; tarkka CAD lasketaan vasta hyväksyttäessä. Reiät ja
seinämät skaalautuvat mukana. Linkitetyt kopiot jakavat koon, ellei valita
**Vain valitut · tee uniikeiksi**. Myös raskas rei'itetty kiuas on testattu;
sen akselikohtainen venytys voi edelleen kestää kymmeniä sekunteja.

Versio **0.32.2** korjaa tiheästi rei'itetyn osan jäätymisen **Siirrä**-työkalussa.
Tartuntahaku ohittaa turhat reunaviivojen peittymistarkistukset ja etsii vain
parhaan näkyvän tartunnan. Paikallaan oleva osa ei saa päällekkäistä siirtohaamua.
Tarkat kulma-, reuna- ja apuviivatartunnat, akselit sekä Ctrl-kopiointi säilyvät.

Versio **0.32.1** nopeuttaa rei'itettyjen ja pyöristettyjen osien käsittelyä:

- Valittu kaareva tilavuuskappale ei enää peity satoihin pistemerkkeihin.
  Piirtokäyrien tartuntapisteet sekä kaikkien osien tarkat tartunnat säilyvät.
- Pintojen osoittaminen käyttää kolmiohakupuuta. Yhden pinnan valinta ei lisää
  piirtokutsua jokaiselle kappaleen muulle pinnalle.
- CAD-reunat ja pinnat indeksoidaan toistuvien kaikkien parien vertailujen sijaan.
  Muokkaus säilyttää vanhat tartuntaviitteet verkottamatta vanhaa osaa uudestaan.
- Pyöristyksen ja viisteen hyväksyntä käyttää valmiin esikatselun geometriaa ja
  piirtoverkkoa. Samaa käsittelyä ei lasketa uudestaan hyväksyttäessä.

[Mitattu vaikutus ja testin rajat](docs/performance.md).

Versio **0.32.0** selkeyttää **Join**-yhdistämisen ja lisää kierron kopioinnin sekä
aukkojen ympyrätoiston:

- **Join — Yhdistä**: valitse kaikki yhdistettävät osat samasta listasta tai mallista.
  Myös samalla tasolla olevat paksuudettomat muodot yhdistyvät: suorakulmio ja
  ympyrät voivat muodostaa yhden pyöristetyn leikkausmuodon. Alkuperäiset osat
  korvautuvat tuloksella; Peru palauttaa ne. Cut säilyttää kohde-/työstöjaon.
- **R + Ctrl**: Ctrl-napautus kytkee kierron kopioinnin päälle tai pois.
  Alkuperäinen jää paikalleen ja uusi kopio kiertyy valitun pisteen tai reunan ympäri.
  Sama toimii monivalinnalle, ryhmille ja kokoonpanoille; komponenttilinkit säilyvät.
- **Leikkaa aukko → Toisto → Ympyrä**: valitse 1–100 aukkoa, X/Y/Z-kiertoakseli
  ja tarvittaessa kiertopiste. Oletuksena aukot jaetaan tasan 360 asteelle; voit myös
  antaa oman kulmavälin. Leikkaussuunta kiertyy muodon mukana. Syvyys rajaa työstön
  esimerkiksi sylinterin lähimpään seinämään; tyhjä syvyys leikkaa myös vastapuolen.
  Punainen esikatselu, kohteiden valinta ja yksi Peru koko sarjalle ovat käytössä.
  Suoran sarjan toisto ja osittaisen ympyräsarjan jatkaminen toimivat Toista aukko -painikkeesta.
- **Suuret leikkaussarjat**: Cut ja Leikkaa aukko laskevat erilliset leikkurit
  pienissä yhteisissä erissä. Päällekkäiset leikkurit käsitellään turvallisesti
  erikseen, ja ohi osuvat jätetään laskennasta. Myös valmiin geometrian
  pinta-/reunahaku on nopeampi. Koko leikkaus palautuu yhdellä Peru-toiminnolla.
- **Kaarevien reunojen käsittely**: Reunat-työkalu ohittaa sileiden pintojen saumat.
  Pyöreät ja puolipyöreät reunat sekä kaarevaan seinämään leikatun aukon reunat
  voi pyöristää tai viistää. **Uusi reunakäsittely** säilyttää edellisen muodon
  ja avaa sen muut reunat käsiteltäviksi omalla säteellä tai viisteellä.

Versio **0.31.1** korjaa pinnan keskipistetartunnan: mitta- ja piirtotyökalut
tarttuvat näkyvän tasopinnan keskelle kappaleen sisällä olevan tilavuuskeskipisteen
sijaan. Reunasta vedettävä apuviiva poimii viitemitan myös eri korkeudella olevalta
pinnalta muuttamatta omaa tasoaan. Esimerkiksi lattian keskikohtaan saa yhtä pitkät
mitat vastakkaisilta seiniltä. Tarkasti osoitettu piste voittaa sivussa olevan
apuviivojen risteyksen.

Versio **0.31.0** lisää **mittamuistin**, tasomuotojen yhdistämisen ja ulospäin
tehtävän offsetin sekä selkeyttää **Leikkaa aukko** -työkalua:

- Viisi viimeistä erilaista mittaa tarjoaa kevyen tartunnan kynälle, mitta- ja
  apuviivoille, suorakulmioille, pinta-alueille ja ympyrä-/ellipsi-/monikulmiotyökalulle.
  Kohdistimen **mittamuisti**-vihje kertoo ehdotuksesta. Todellinen tartuntakohde,
  Shift-viite ja kirjoitettu mitta ovat ensisijaisia; **Alt** ohittaa muistiehdotukset.
  Myös esimerkiksi 98 mm toimii 10 mm ruudukossa. Muisti säilyy sivupäivityksessä
  saman projektin ja selainvälilehden istunnon ajan.
- Valitse samalla tasolla olevat täytetyt muodot ja paina **Yhdistä muodot**
  oikealta tai kohdevalikosta. Päällekkäisyydet ja sisärajat poistuvat; tarkat
  kaaret ja reiät säilyvät. Irralliset alueet pysyvät erillisinä pintoina samassa osassa.
- **O → Ulospäin** tai ulospäin veto tekee 2D-muodolle uuden ulkokehän.
  Miinusmitta tarkoittaa ulospäin. Kehä on valittuna: **E** nostaa siitä seinät,
  ja alkuperäinen lattia säilyy. Tämä toimii myös yhdistetyllä huoneen muodolla.
- **Leikkaa aukko**: napsauta kohteita mallissa tai valitse ne listasta.
  Sininen korostaa kohteet; punainen läpikuultava leikkausmuoto näyttää suunnan ja
  syvyyden. Suoraan näkyvä **Leikkaussyvyys** rajaa työstön muodon tasosta sisään;
  tyhjä kenttä tarkoittaa läpileikkausta. Esikatselua voi kiertää ja zoomata.

Versio **0.30.1** korjaa suorakulmion numerosyötön: ensimmäinen napsautettu
kulma pysyy paikallaan myös negatiivisissa piirtosuunnissa, kun leveyttä ja
syvyyttä muutetaan ja kenttää vaihdetaan Tabilla.

Versio **0.30.0** selkeyttää työkalujen oikeaa paneelia ja lisää **33 lyhyttä
havainneanimaatiota**. Työkalun **Näytä esimerkki** avaa juuri sen ohjeen;
yläpalkin **Käyttöohje** avaa saman haettavan kirjaston. Animaation voi pysäyttää,
kelata tai katsoa vaihe kerrallaan. Ohje ei muuta mallia tai keskeneräistä piirrosta.
Paneelissa säilyvät seuraava askel, mitat ja tärkeimmät toiminnot; toistuvat
selitykset siirtyvät ohjeisiin ja harvemmin käytetyt asetukset avattaviin osioihin.
Valinnan kuusi päätoimintoa löytyvät kahdelta riviltä ennen materiaalia ja linkitystä.
[Selkeytyspassin havainnot ja rajat](docs/tool-guides.fi.md).

Versio **0.29.1** sujuvoittaa merkintöjä ja mallilistaa. Pinta-ala ottaa tason
osoitetusta lattiasta tai seinästä; **Z = XY**, **Y = XZ**, **X = YZ** vaihtaa
keskeneräisen alueen tasoa. Huomautuksen sijoitus ja veto avaavat tekstin
kirjoittamisen heti. Värit esikatsellaan kevyesti ja kohdistusviivan voi piilottaa.
Mallilistassa on roskakorit merkinnöille, Shift-rivivälivalinta ja osakohtainen
keskitä-painike. Osan päälle pudottaminen luo järjestävän ryhmän; osien sijainnit
säilyvät. Uudelle muodolle tarjotaan valinnainen nimeämiskortti: **Tab** avaa
nimen, seuraava Tab ryhmän ja **Enter** tallentaa. Jatkaminen sulkee kortin.
**H** piilottaa valinnan, **Shift+H** palauttaa viimeksi piilotetut ja **Alt+H**
kaikki piilotetut. Samat komennot löytyvät näkymän silmävalikosta ja oikean
napin **Näkyvyys**-alavalikosta. Navigoi jää työkalupalkkiin.

Versio **0.29.0** lisää mittatyökalun valikkoon **Pinta-alan** ja **Huomautuksen**.
Piirrä saman tason suorakulmiot ja paina Enter: saat yhden nimetyn, värillisen
pinta-alueen, jonka päällekkäisyydet lasketaan vain kerran. Huomautuksessa napsauta
kohdepiste ja tekstilaatikon paikka. Teksti, kehys, värit ja tekstikoko ovat
muokattavissa oikealla; laatikkoa voi siirtää vetämällä Valitse-työkalulla.
**Merkinnät**-listasta löydät ja piilotat alueet sekä huomautukset yksittäin tai
kaikki kerralla. Merkinnät tallentuvat projektiin, kumoamishistoriaan,
mallinnuksen PNG-kuvaan ja tavallisiin mittakuviin.

Versio **0.28.2** tekee dimensioista valittavia merkintöjä: napsautus korostaa
oranssilla, tuplaklikkaus avaa tekstin muokkauksen. **Mitat**- ja **Viivat**-listojen
silmäkuvakkeilla piilotat ja palautat yksittäisen dimension, mitta- tai apuviivan.
Teksti ja näkyvyys säilyvät myös mitta-/leikkauskuvissa, viennissä ja projektissa.
Tekstiin voi kirjoittaa `{mitta}` päivittyvää mittalukua varten; tyhjä palauttaa
vakioesityksen. Tekstin muuttaminen ei muuta geometriaa.

Versio **0.28.1** lisää studiovalon korkeuden (90° = suoraan ylhäältä),
varjojen yhteisen kytkimen nopeaan ja tarkentuvaan kuvaan sekä kuvanvientiin.
Studiovalot ja ympäristövalo sammuvat voimakkuuden **Pois**-asennossa.
Mallinnuksen näkymäpalkin **Tallenna näkymä PNG** tallentaa nykyisen kuvakulman
ja näkyvät mittamerkinnät ilman käyttöliittymää.

Versio **0.28.0** lisää tarkat puolipyöreät päät nykyiseen Reunat-työkaluun
sekä aukkosarjat suoraan **Leikkaa aukko** -toimintoon. Myös Push/Pullilla
tehdyn leikkauksen voi heti toistaa määrällä, välillä ja suunnalla. Rajattu
leikkaussyvyys säästää kotelon vastakkaisen seinän. Pienen reunan tarkasti
osoitettu keskipiste voittaa kauempana olevan kulman; Cut/Join löytyy suoraan
osan toiminnoista. [Kotelotestin korjaukset ja käyttö](docs/enclosure-tools.fi.md).

Versio **0.27.0** korjaa valmiiden pintojen ja käyräreunojen 3D-tartunnat.
Kynä ja vapaa mittaviiva voivat kulkea eri korkeuksien välillä; Shift poimii
viitemitan omaan lukittuun suuntaan myös alemmasta reunasta. Suorat kynäviivat
muodostavat pintoja valmiiden piirrosrajausten väliin: esimerkiksi neliön ja
10 mm alemman kaivoympyrän väliin. [Kaatopinnan työskentely](docs/through-shapes.fi.md#kaatopinta-kynällä).

Versio **0.26.0** lisää **Muodot → Muotojen läpi** -pintatyökalun: yhdistä
poikkileikkauksia tai vierekkäisiä sivukäyriä, tarkista esikatselu ja hyväksy
pinta tai umpiosa. Ympyrästä voi tehdä myös kartion kärkeen päättämällä.
Bézier kulkee nyt oletuksena napsautettujen pisteiden kautta. Käyriin voi lisätä
tartuntapisteitä ja niiden pisteitä muuttaa jälkikäteen. Rakennusympyrät ovat
oikeita ääriviivoja ilman täyttöpintaa.
[Käyttöohje, pullon esimerkki ja prototyypin rajat](docs/through-shapes.fi.md).

Versio **0.25.0** kokoaa esityskuvan **Materiaali / Valaistus / Kuva** -näkymiin.
Vedä aurinkoa suuntakehällä ja säädä korkeutta, sävyä, voimakkuutta sekä varjojen
pehmeyttä. Studio, päivänvalo, iltavalo ja omat valaisimet antavat neljä lähtökohtaa.
**Filminen** kuvailme ja kuvan tarkentuessa kevenevä kohinan pehmennys viimeistelevät
kuvaa. Valaistussäätö säilyttää geometrian ja PBR-kartat; kuvanvienti odottaa myös
heijastusympäristön valmistumisen. [Renderipassin toteutus](docs/overnight-2026-10-08-render.md).

Versio **0.24.2** nopeuttaa apuviivojen pisteiden ja mittatekstien näkyvyystarkistusta.
Käyttäjän pyöristetyllä 12 kaapin mallilla kamerakierto nousi testissä noin
20 → 120 kuvaan/s samoilla materiaaleilla ja apuviivoilla. Piirron yksityiskohdat säilyvät.
[Mittaus ja rajaukset](docs/performance.md).

Versio **0.24.1** keskeyttää työkalujen tartunta- ja osoitushakuja kameravedon ajaksi.
Siirrä-työkalun korostus ei enää vaihdu kameran alla ja aiheuta ylimääräisiä
tekstuurien GPU-latauksia. [Mittaus ja tutkimuksen rajat](docs/performance.md).

Versio **0.24.0** lisää kuparin, hapettuneen kuparin, mustan kromin ja kuusi
anodisoidun alumiinin sävyä. Metallin **sileä / harjattu** kuviointi, väri ja kiilto
säätyvät erikseen. Metallien kevyt studioheijastus näyttää värin jo mallintaessa.
Puun materiaali suuntautuu maalatessa osan pitkän sivun mukaan; olemassa oleville
pinnoille on **Suuntaa puunsyyt pituussuuntaan**. Kolme pähkinäviilua täydentävät
kokoelmaa: ruskea amerikanpähkinä sekä lämmin ja tumma euroopanpähkinä.
Aiemmat tekstuurit ja tallennetut sävyt säilyvät. Yhteensä 105 materiaalia, 28 PBR-pintaa.

Versio **0.23.0** laajentaa **Pintakokoelman** 25 PBR-pintaan ja 12 maalisävyyn.
Mukana ovat saarni, vaahtera, kirsikka, tiikki, bambu sekä lisää tammea ja pähkinää,
pellava, nahka, graniitti, terrazzo ja terrakotta. Puut, seinäpinnat, kivet ja laatat,
tekstiilit sekä maalit löytyvät saman kokoelman suodatuksesta. Kaikkiaan 93 materiaalia.
Uusien PBR-pintojen **Vaihda värisävy** säilyttää kuvion ja vaihtaa pohjan sävyä:
sininen ei muutu ruskean puukuvan kanssa lähes mustaksi. **Kuultava sävy** säilyttää
aiemman pohjaväriin yhdistämisen, jota myös vanhat projektit käyttävät.

Versio **0.22.1** säilyttää jaetun piirustuspinnan muut alueet, kun yhtä aluetta
pursotetaan. Esimerkiksi 1000 × 1000 mm neliön 250 mm offset ja keskiosan
400 mm nosto jättävät ulkokehän paikalleen. Myös kehää voi pursottaa, ja
keskiosan jatkomuokkaukset, mitat sekä tallennus huomioivat jäljelle jäävän pinnan.

Versio **0.22.0** nopeuttaa tarkentuvan kuvan valmistelua ja materiaalinvaihtoa.
Valotuksen säätö säilyttää jo lasketut näytteet. GPU:lla mustuneen lakkapinnan
laskentavirhe on korjattu. **Pintakokoelma** sisältää tässä versiossa yhdeksän paikallista CC0-PBR-materiaalia,
juuri niille tehdyt normal-, karheus- ja korkeuskartat sekä oikeat mittakaavat.
Yhteinen HDRI-studio, pehmeät studiovarjot, pois kytkettävä kohinan pehmennys ja tarkempi sisätilan
valolaskenta viimeistelevät renderiä. [Yöpassin seloste](docs/overnight-2026-10-08-render.md).

Versio **0.21.5** erottaa ensimmäisen renderinäytteen valmistelun varsinaisesta
tarkentumisesta ja poistaa tarpeettomien shader-versioiden valmistelua aloituksesta.
Katkennut kameraveto ei jätä tarkennusta tauolle, ja tavoitteen
saavuttanut kuva näytetään kokonaan tarkentuvana myös pienellä näytemäärällä.
Täysi tarkkuus toimii myös jo valmistuneen esikatselun jälkeen. Tarkentuva-painike
jatkaa myös käyttäjän tauottamaa laskentaa.

Versio **0.21.4** korjaa kynän ja vapaan mittaviivan aloituksen perspektiivissä:
tyhjässä tilassa piste seuraa näkyvää z=0-ruudukkoa, ja akselilukitus säilyttää
mittaviivan etenemissuunnan. **Peili** tarjoaa yhden tai kaksi heijastavaa puolta,
**100 × 200 mm seinälaatta** täydentää materiaalit 56 vaihtoehtoon. Matta-asetus
ohittaa kiiltoa palauttaneet pintalakan ja karheuskartan. Renderin kameraliike
ei enää lataa tekstuureja uudelleen; tarkennus jatkuu liikkeen päätyttyä.
Suorakulmaisia LED-valopintoja näytteistetään kohdennetusti myös heijastuneen
valon laskennassa. Nopea-tila ei laske epäsuoraa valaistusta; valon voimakkuus
on edelleen suhteellinen, ei lumenluku. Pienten valoaukkojen kohina vaatii jatkotyötä.

Versio **0.21.3** palauttaa 3D-orbitin aiemman liikelogiikan: pysty- ja vaakakierto
toimivat samalla vedolla ilman kertyvää sivuttaiskallistusta. Ylänäkymästä pääsee
kiertämään kumpaankin vetosuuntaan. **Maali · tasainen väri** lisää pelkän sävyn ja
kiillon ilman tekstuuria. Tarkentuva renderi lataa ohjelmakoodinsa sovelluksen
mukana, ja nopean esikatselun LED-valot huomioivat peittävän geometrian varjot.

Versio **0.21.2** kokoaa näkymän pikatoiminnot: kuutio vaihtaa katselusuuntaa
säilyttäen zoomin, ja näyttötilojen vieressä oleva **Yleisnäkymä** palauttaa koko
mallin näkyviin viistosta. Tämän version vapaan orbitin sivuttaiskallistus
korjattiin versiossa 0.21.3.
Valitse-työkalun Shift korostaa koko osan tai suljetun kokoonpanon ennen valintaa.
Push/pullin Shift säilyy viitehakuna.

Versio **0.21.1** näyttää tekstuurin sävyn heti väriä valitessa sekä mallissa että
renderöinnissä. Hyväksy sävy valintapainikkeesta tai peru esikatselu Escillä;
hyväksytty muutos on yksi historian askel. Uusien kopioiden nimet numeroidaan:
`Kynämuoto 122 (kopio #1)`, `(kopio #2)` jne. Myös kopion kopio jatkaa samaa sarjaa.

Versio **0.21.0** korjasi kynän suuntaan sidotun mittasyötön ja Shift-viitteet,
yhtenäistää risteystartunnat, lisää pyöritettävän näkymäkuution sekä näyttötilat
Solid / Tasaväri / Ghost / Wireframe. P-työkalulla voi asetella tekstuureja
ja vaihdella valittujen osien kuvioita. Materiaalin sävyä ja kiiltoa voi säätää.
Yksi viivainpainike piilottaa kaikki mallin mitta- ja apuviivat.
Kopioidut malliosat linkittyvät oletuksena; uniikiksi tekeminen on erillinen valinta.

Versio **0.20.0** lisäsi **Veitsen (N)**, pallon ja Bézier-käyrät. Veitsi paloittelee
valitut tai näkyvät vapaat kappaleet nykyisestä kamerasta: suora, taitettu reitti,
suljettu siluetti, sileä Bézier-viilto tai vapaa viilto. Molemmat puolet säilyvät,
ja yksi Peru palauttaa leikkauksen. **Muodot → Pallo** sijoittaa keskipisteen ja
halkaisijan; **Bézier-käyrä** käyttää alku- ja loppupistettä sekä kahta ohjauspistettä.
Osan valikon **Pehmennä reunat…** avaa kaikkien reunojen pyöristyksen esikatselun.

Valintaruutu valitsee myös apu- ja mittaviivat selvästi oranssina. Shift lisää,
Delete poistaa koko valinnan ja historia palauttaa myös viivavalinnat.
Samalle suoralle päällekkäin piirretyt mittaviivat yhdistyvät automaattisesti;
uudelleen piirretty sama osuus ei lisää turhaa kumoamistapahtumaa.
[Yöpassin toteutukset ja rajat](docs/overnight-2026-10-05-modeling.md).

Versio **0.19.2** yhtenäistää mittatyökalun: painike ottaa viimeksi käytetyn
mittaustilan, nuoli avaa valikon. Vapaa mittaviiva jatkuu pisteestä pisteeseen;
Enter tai Esc päättää ketjun. Shift pitää suunnan ja poimii pituuden toisesta
pisteestä. R käynnistää hiirikierron 22,5° välein, Shift+R vapaan kierron.
Tuplaklikkaa päätepistettä siirtääksesi sitä. Viivat pysyvät erillisinä:
muut viivat eivät liiku, ja yhteisessä päässä valitaan muokattava viiva.
Oikean napin valikko poistaa koko valitun mittaviivan. Peru palauttaa muutokset.

Versio **0.19.1** selkeyttää mitta- ja kynäviivojen pisteitä sekä reunatyökalun
oranssia korostusta. Päätepisteet ja risteykset tarttuvat myös kauempaa;
ruudukko ohjaa vapaata asettelua, mutta geometriaan tarttuminen säilyttää
esimerkiksi 13, 48 ja 98 mm:n tarkat mitat. Ruudukon askelta voi muuttaa asetuksista.

Versio **0.19.0** lisäsi maalatut kipsipinnat, tasoitetun seinän, raa'an ja
liipatun betonin, lisää kiviä, kolme laattapintaa ja öljytyn pähkinän: yhteensä
53 materiaalia. Materiaalihaku ja renderin jatkuvat **Valitse / Tekstuuri / Maalaa**
-työkalut nopeuttavat pintojen käsittelyä. Samat materiaalikuvat jaetaan osien
kesken myös tarkentuvassa renderöinnissä, mikä pienentää ison mallin muistinkulutusta.

Värikuvasta voi luoda normal- ja karheusrakenteen, kohokuvion syvyys säädetään
millimetreinä ja LED-/spottiasetukset löytyvät myös mallin Materiaali-kohdasta.

Mallista työkuvaksi: **Mittakuva → Luo mitta-arkki**
asettaa 1–6 näkymää, myös tallennetut poikkileikkaukset, samalle A4-arkille yhteisessä
mittakaavassa. Tallenna arkin kohde ja näkymät projektiin; vie PDF tai SVG.
Kokonaismitat seuraavat osajoukon tai ryhmän nykyisiä ulkorajoja myös osien
järjestyksen vaihtuessa. Puuttuvat viitteet ja liian suuri kuva estävät viennin.
Levyrunko syntyy kokoonpanoksi, **Muokkaa osia** avaa sen, ja linkitetyn osan
muokkauksen vaikutus näkyy heti yhdessä **Tee uniikki** -toiminnon kanssa.
[Mitattu suorituskyky ja rajat](docs/performance.md).

Pintaan piirretyn erillisen viivan tai muodon **Jaa pinta** rajaa muokattavan
alueen ilman osan avaamista. Sen jälkeen **E** tekee taskun tai läpireiän,
myös osittain reunan ylittävästä ympyrästä. **Leikkaa aukko** on käytettävissä
myös jo hyväksytylle suljetulle muodolle. Historiassa **Palaa leikkaukseen**
palauttaa mallin leikkausta edeltävään tilaan ja avaa muodon sekä kohteet,
kun kyseinen kumoamistila on yhä tallessa. **Palauta valinta** vaihtaa vain valinnan.

- Mallilista avautuu vasemmalta. Kiinnitä se nastasta tai piilota nuolesta. Työkalupalkin kahvaa voi vetää reunaan tai napsauttaa sijainnin valitsemiseksi.
- Napsauta valitun osan tai ryhmän otsikkonimeä nimetäksesi sen. Ryhmäpolku näkyy heti alla.
- **Luo kokoonpano** yhdistää valinnan käsiteltäväksi kokonaisuudeksi. Tuplaklikkaa avataksesi yksittäiset osat; Esc tai Sulje kokoonpano päättää. **Ryhmä** järjestää mallia kansion tavoin; ryhmän voi myös valita listasta siirtoa, piilotusta tai Holdia varten. Valitse-tilassa osan nimirivi valitsee nimenomaisen osan ja avaa sen kokoonpanon näkyvästi.
- **Kopioi**: malliosien kopiot jakavat geometrian ja oletuksena materiaalin ilman erillistä komponentiksi muuttamista. **Tee uniikiksi** irrottaa osan linkin. Ryhmän vastaava toiminto säilyttää sisäiset linkit ja irrottaa ulkopuoliset kopiot. Sijainti, kierto, nimi, näkyvyys ja Hold ovat esiintymäkohtaisia. Olemassa olevat osat voi linkittää valittuun lähtöosaan.
- **P – Maalipensseli**: valitse materiaali ja napsauta osia. Paletti kertoo, koskeeko maalaus koko valintaa ja linkitettyjä kopioita.
- Oikean napin napsautus tai **Toiminnot** avaa valinnan yhteisen valikon. Oikean napin veto kiertää kameraa. Delete/Backspace tai Valitse-tilassa X poistaa koko valinnan yhdellä peruttavalla toiminnolla.
- Siirron X/Y/Z-akseli näkyy tartuntapisteen kautta myös kappaleen läpi, ja mittalappu näyttää siirtymän.

OpenCascade laskee tarkan geometrian Web Workerissa. Three.js näyttää siitä
johdetun verkon; projektin mitat eivät riipu renderöintikolmioista.

![Nivon mitta-arkki ja poikkileikkaus](docs/images/nivo-v017-sheet.png)

## Testaa selaimessa

[**Avaa Nivon beta**](https://alluharju-bot.github.io/nivo/). Käyttäjätiliä tai asennusta ei tarvita.
Aloita esimerkkikaapista tai valitse **Muodot → Levyrunko**. Kokeile osan valintaa,
siirtoa (M), pinnan muokkausta (E), mittakuvaa ja **Osat**-näkymää.

Tallennus on selain- ja laitekohtainen. Lataa `.nivo`-tiedosto yläpalkin
Tallenna-painikkeesta, kun haluat siirtää mallin toiselle käyttäjälle tai laitteelle.
Paikallisen osoitteen ja betaosoitteen tallennukset ovat erillisiä.
Sovellus ei lähetä malleja palvelimelle.

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

## Yhteinen työskentelytapa

- Valintaruutu toimii Valitse-tilassa ja tyhjästä alkavana vetona myös
  siirtotyökalussa. **Vasemmalta oikealle: sininen, kokonaan sisällä**.
  **Oikealta vasemmalle: oranssi katkoreuna, alueeseen osuvat**. Shift lisää
  aiempaan valintaan. Osumat perustuvat mallin muotoon ja näkyvään leikkaukseen.
- Siirrossa numeron kirjoittaminen aloittaa vetosuunnan akselin kentästä.
  Esimerkiksi alaspäin aloitettu Z-siirto ja `150` antaa `−150 mm`.
  Kirjoitettu `+150` tai `−150` valitsee etumerkin suoraan; kentän napsautus
  ja Tab toimivat edelleen koordinaattikohtaisesti.
- Siirron tai kopioinnin jälkeen **Toista** jatkaa samalla välillä ja suunnalla.
  **Lisätoistoja 3** tekee kolme uutta toistoa viimeisen tuloksen jälkeen.
  Kopiointi säilyttää ryhmät ja komponenttien linkityksen. Siirron toisto
  siirtää samoja osia. Yksi Peru kumoaa koko toistosarjan. Uusi mallin muutos,
  Peru tai projektin vaihto päättää vanhan toiston; sitä ei tallenneta projektiin.
- Apuviiva toimii muodon aloituspisteenä myös tyhjässä tilassa ja säilyttää
  oikean piirtotason. Lattiasta ylös nostetusta apuviivasta voi jatkaa uutta
  rinnakkaista apuviivaa. Komponenttia osoitettaessa käytetään sen näkyvää pintaa;
  reunassa ja kulmassa kameran suunta auttaa valitsemaan viereisistä pinnoista.
- Paneelin yläosa kertoo työkalun, kohteen ja seuraavan vaiheen. **Uusi osa**
  ja **Muokkaa osaa** erottuvat toisistaan. Akseli ja kopiointitila näkyvät samassa yhteydessä.
- Napsauta muodon aloituspistettä ja vastapistettä tai vedä. Numeron kirjoittaminen
  aloittaa mittasyötön, Tab vaihtaa kenttää ja Enter hyväksyy. Leveys ja syvyys
  ovat vain yhdessä lomakkeessa; nimen ja muut lisäasetukset voi avata alta.
  Mittaikkunan voi edelleen vetää irti paneelista ja palauttaa oikeaan reunaan.
- **Esc** peruu keskeneräisen toiminnon säilyttäen työkalun ja valinnan.
  Seuraava Esc päättää työkalun. Osan muokkaustilassa vielä yksi Esc tai
  **Lopeta muokkaus** sulkee osan. **Lopeta työkalu** päättää työkalun suoraan.
  Hyväksytty toiminto jättää työkalun valmiiksi seuraavaan aloitukseen.
- **Hae** löytyy yläpalkista. ↑/↓ selaa ja Enter käynnistää toiminnon.
  Hakutulos kertoo syyn, jos toiminto vaatii esimerkiksi osan valinnan.
  Haun Esc sulkee vain haun ja säilyttää kesken olevan esikatselun.
- **Toiminnot → Valitse toinen** tai sama toimintohaku antaa valita päällekkäisistä
  osista. Hiirellä osoitus esikorostaa ja napsautus valitsee. Kosketuksella
  napauta nimeä esikorostusta varten ja vahvista **Valitse korostettu**.
  Suljetut kokoonpanot ovat yksi vaihtoehto. Piilotettuja osia tai avoimen
  muokkauskohteen ulkopuolisia osia ei tarjota.
- Valitun osan mitat ovat ennen lisäasetuksia. Komponenttien linkitys löytyy
  avattavasta **Komponentti ja linkitys** -osiosta.

## Ruudukko ja pinnalle piirtäminen

10 mm:n ruudukolla vapaa suorakulmion sivu, ympyrän halkaisija ja push/pullin toteutuva paksuus askeltavat 10 mm. Siirto askeltaa siirtymää lähtöpisteestä, joten se ei muuta muiden akselien sijaintia. Ruudukon askel on vaihdettavissa asetuksissa. Kirjoitettu tarkka mitta ja korostettu geometriatartunta ohittavat ruudukon: esimerkiksi 18 mm:n levyn pinnalle piirretty muoto pysyy levyn pinnalla.

Piirtämisen alku valitsee näkyvän pinnan. Yhteisessä nurkassa suositaan kameraa kohti olevaa pintaa; etupuolella oleva geometria estää takakulmaan tarttumisen. Suorakulmion ja ympyrän X/Y/Z valitsee piirtotason normaalin: X = YZ, Y = XZ ja Z = XY. Tason voi vaihtaa myös ensimmäisen pisteen jälkeen. Kynän X/Y/Z lukitsee viivan suunnan.

Samalla pinnalla oleva tasomuoto näkyy tukikappaleen päällä ja klikkaus poimii
muodon. Päällekkäisistä tasomuodoista uusin on päällimmäinen. Sama etusija
toimii E-push/pullissa ja siirron yhteisissä kulmapisteissä. Oikea edessä oleva
kappale peittää muodot edelleen. Muotoa ei siirretä millimetriäkään näkyvyyden
vuoksi. Rakennusmuoto valitaan edelleen ääriviivastaan; sen sisusta jättää
alla olevan pinnan käytettäväksi.

## Valinta siirtotyökalussa ja toimintohistoria

- **M:** ilman valintaa koko osoitettu osa tai kokoonpano korostuu ja on heti
  vedettävissä. Kun valinta on jo tehty, siirto alkaa vain siihen kuuluvasta osasta.
  Viereiseen kappaleeseen osuminen säilyttää valmistellun valinnan.
- **Shift-klikkaus** lisää tai poistaa osia myös valmiustilassa olevissa
  muokkaustyökaluissa. **Tyhjästä vedettävä laatikko** valitsee sen sisällä olevat
  osat; Shift lisää niitä nykyiseen valintaan. Tämä toimii siirrossa, kierrossa,
  pensselissä, kumituksessa, Offsetissä, reunatyökalussa ja apuviivatyökalussa.
  Cut/Joinissa laatikko täyttää aktiivista kohde-/työstövalintaa.
- Piirtäminen, push/pull, keskeneräinen työkaluele ja kiertokahvat säilyttävät
  omat toimintonsa. Valinta ei keskeytä luonnosta eikä Shiftin tavoitepoimintaa.
- Alapalkissa näkyy **Viimeisin toiminto**. Avaa **Toimintohistoria** nähdäksesi
  toiminnot ja niiden valinnat, esimerkiksi _Siirretty 48 kappaletta · X +100 mm_.
  **Palauta valinta** palauttaa osat valintaan muuttamatta niiden geometriaa.
  **Edellinen valinta** tarjoaa saman toiminnon yhdellä painalluksella.
- Myös työkalulle valmisteltu valinta säilytetään. Shift-klikkauksia ei kirjata
  erikseen; valmistelu yhdistyy hyväksyttyyn toimintoon. Lokissa on enintään
  **100 merkintää / 2 MiB:n tekstibudjetti**, ja se säilyy saman välilehden
  päivityksessä. Se ei sisällä CAD-kopioita. Poistetut ja piilotetut osat ohitetaan
  valinnan palautuksessa. Varsinainen Peru-historia on tästä erillinen.

## Poikkileikkaus ja pohjakuva

- Näkymän **Leikkaus**-painike lisää nimetyn tason. Valitse X/Y/Z tai **Pinnasta**,
  vedä tason nuolesta tai kirjoita sijainti millimetreinä. **Vaihda katselusuunta**
  vaihtaa näkyvää puolta. Kappaleet, tilavuudet ja leikkauslista pysyvät ennallaan.
- **Avaa leikkaus mittakuvaan** näyttää CAD-leikkausreunat ja viivoittaa vain
  umpinaisen aineen. Valitse näkyvä malli, valinta tai ryhmä. **Mitoita kahdesta
  pisteestä** poimii leikkausreunan pisteet; kolmas napsautus sijoittaa mittaviivan.
  Vie mittakaavallinen PDF tai SVG ja tulosta 100 % koossa. Muuttunut mittaviite
  merkitään ja se pitää korjata ennen vientiä.
- **Pohjakuva** tuo PNG-/JPEG-/WebP-kuvan XY-, XZ- tai YZ-tasolle. Poimi kaksi
  pistettä ja syötä tunnettu etäisyys. Kalibrointi säilyttää ensimmäisen pisteen
  paikallaan ja lukitsee kuvan. Lukituksen voi avata sijainnin tai tason vaihtamiseen.
  Näkyvyysliuku säätää läpinäkyvyyttä. Kuva tallentuu projektin sisään.
- **Eristä valinta** on näkymän painikkeessa ja valinnan toimintovalikossa.
  **Palauta näkymä** palauttaa täsmälleen aiemmat osien ja ryhmien piilotukset.
  Eristys on tilapäinen eikä muuta projektin näkyvyysasetuksia.

Yksi leikkaustaso on aktiivinen kerrallaan. Tarkan täytön laskenta tapahtuu
CAD-workerissa; tason liike näkyy heti ja täyttö valmistuu pysähdyksen jälkeen.
Leikkauspinta on näkymän esitys, ei push/pullilla muokattava uusi CAD-pinta.
Pohjakuvasta ei automaattisesti tunnisteta seinäviivoja tai tartuntapisteitä.

## Ensimmäinen työnkulku

1. Piirrä suorakulmio: napsauta alkukulmaa, siirrä osoitinta ja napsauta vastakulmaa.
   Voit myös vetää painike pohjassa tai kirjoittaa tarkat mitat.
2. Toinen napsautus, Enter tai vedon päättäminen hyväksyy luonnoksen. Paina **E**, osoita pintaa
   ja vedä sille paksuus. Samalla työkalulla voi muokata kappaleen muitakin tasopintoja.
3. Klikkaa koko kappale valituksi. M siirtää; paina Ctrl kerran vedon aikana
   tehdäksesi kopion (uusi painallus poistaa kopioinnin). Osoita pintaa ja paina E tai O pinnan muokkaamiseen.
4. Siirrossa korostus näyttää tartuntapisteen ennen painallusta. Poimi kulma,
   reuna tai keskipiste ja vie se toisen osan tarkkaan pisteeseen. Siirto valitsee vedon alussa yhden akselin; X/Y/Z
   vaihtaa sen. Vapaa siirto (XYZ) sallii usean akselin liikkeen.
   Vapaa siirtymä käyttää asetusten ruudukkoaskelta (oletus 10 mm).
   Lukitulla akselilla osoitettu piste antaa tämän akselin tavoitemitan.
   Liikkuva valinta ja siihen kiinnitetyt apuviivat eivät toimi omina kohteinaan.
5. Vaihda perspektiivin ja rinnakkaisprojektion välillä. Käytä etu-, sivu-, ylä-
   ja 3D-näkymiä sekä sovita valinta näkymään.
6. Valitse osa ja paina **Lisää kokonaismitat**. Mitat näkyvät heti 3D:ssä ja
   **Mittakuvassa** sekä seuraavat osan muutoksia. Valitse osan väri väripaletista.
7. Vie A4-vaaka-arkki SVG:nä valitussa fyysisessä mittakaavassa. Näkyvät ja
   piilossa olevat viivat lasketaan CAD-geometriasta.
8. Peru ja palauta muutoksia myös sivun päivityksen jälkeen. Lataa `.nivo`-tiedosto ja avaa se uudelleen.

Mittasyöttö hyväksyy `600`, `18 mm`, `1,8 cm`, `2,4 m` ja siirroissa negatiiviset
arvot. Oletusyksikkö on millimetri ja Z-akseli osoittaa ylöspäin.
Automaattitallennus palauttaa työn samassa selaimessa. **Lataa myös oma
projektitiedosto:** selaimen tallennustila ei ole varmuuskopio.

Tyhjästä työtilasta voi avata **600 × 800 × 560 mm esimerkkikaapin**. Sen kuusi
levyä ovat itsenäisiä osia. Esimerkissä ei vielä ole ovea tai linkitettyjä
komponentteja. Uusi **Viimeistelty kaappi · mitat ja materiaalit** avaa kaksi
pyöristettyä ovea, ovivälyksen dimension, tammen, messinkivetimet ja upotetun
kuvatekstuurin. [Avattava .nivo-esimerkki](public/examples/viimeistelty-kaappi.nivo).

## Työtila ja kopiointi

Yksi 60 px yläpalkki sisältää Nivon, **Malli / Mittakuva / Renderöi / Osat** -vaihdon, projektin
nimen ja tallennustilan, tiedostopainikkeet, historian, asetukset ja avun.
**Siirry koko näyttöön** piilottaa selaimen palkit. Sama painike tai Esc palauttaa
tavallisen ikkunan. Kapealla näytöllä tiedostot ja muut lisätoiminnot avataan
**Lisää toimintoja** -painikkeesta.

Yksi klikkaus valitsee koko objektin. Pintakorostus osoittaa, mihin E tai O
kohdistuu. **M** siirtää osaa siitä verteksistä tai kohdasta, josta tartuit.
Paina **Ctrl** (tai Alt) kerran vedon aikana: kopiointi kytkeytyy päälle ja
säilyy näppäimen vapautuksen jälkeen. Toinen painallus kytkee sen pois.
**Siirrä kopio** toimii myös numerosarjalla tai kosketuksella. Esc peruu keskeneräisen kopion;
Peru poistaa hyväksytyn kopion yhdellä askeleella. Kopio säilyttää tarkan
geometrian, värin ja ryhmän, mutta saa oman tunnisteen.

![Tarkka kulmasta kulmaan siirto ja näkyvä tartuntapiste](docs/images/nivo-move-snap.png)

## Ryhmät ja yhteinen siirto

![Kappalelista ja ryhmän toiminnot](docs/images/nivo-object-panel.png)

Kappalelista pysyy oikean paneelin yläosassa; valinnan tiedot tai aktiivinen
työkalu näkyvät sen alla. Väri, nimi/ryhmä, sijainti sekä mitoitus- ja
mallinnustoiminnot avataan tarvittaessa omista osioistaan.

**Vedä kappaleen nimi ryhmän päälle** siirtääksesi sen ryhmään. Pudota **Päätaso**-riville
siirtääksesi sen pois ryhmästä. Valitusta kappaleesta aloitettu veto vie koko
monivalinnan; valitsemattomasta aloitettu veto vie vain kyseisen kappaleen.
Ryhmän nimestä vedetään koko alaryhmä sisältöineen. Kohde korostuu ja vetolappu
näyttää kohderyhmän. Esc tai pudotus listan ulkopuolelle peruu. Listan reuna
vierittää pitkää listaa vedon aikana. Kosketuksella vedä rivin pistekahvasta;
nimen kohdalta voit vierittää listaa. Järjestely säilyttää osien 3D-sijainnit.

Kappalelistan **Ryhmä** kokoaa valitut osat. Napsautus valitsee, **kaksoisnapsautus
tai F2** avaa kappaleen tai ryhmän nimen kirjoitettavaksi. Ryhmän valinta ottaa
mukaan myös alaryhmien osat. Raahauksen vaihtoehtona **Nimi ja ryhmä → Ryhmä**
tai **Ryhmän asetukset → Yläryhmä** vaihtaa ryhmitystä valikolla. Ryhmää ei voi
siirtää itsensä tai oman alaryhmänsä sisään. **Luo alaryhmä** kokoaa valitut
osat uuden alaryhmän alle.

Ryhmän silmä ja lukko koskevat koko hierarkiaa. Ryhmän näyttäminen tai
vapauttaminen säilyttää osien omat piilotukset ja lukot. **Poista ryhmä** säilyttää
osat ja nostaa sen suorat osat sekä alaryhmät ylemmälle tasolle. Myös tyhjän
ryhmän voi poistaa painikkeella tai Delete-näppäimellä. Valitun, osia sisältävän
ryhmän Delete poistaa valitut osat; molemmat toiminnot ovat peruttavissa.
**Toiminnot → Siirrä ryhmään** siirtää osan, monivalinnan tai ryhmän
pudotusvalikosta valittuun ryhmään tai päätasolle muuttamatta sijaintia.

Valitse ryhmä ja napsauta osia ilman lisänäppäintä poistaaksesi tai lisätäksesi
niitä valintaan. Sininen korostus kertoo valitun joukon. **Sovita valinta** tuo
kaikki valitut osat näkymään. **Siirrä valinta** tai **M** siirtää koko joukkoa;
**Ctrl-painallus vedon aikana** vaihtaa kopioinnin päälle tai pois. **Kopioi valinta** aloittaa saman työkalun
kopiointitilassa. Kirjoita X/Y/Z-siirtymät ja hyväksy Enterillä tai vedä halutusta
tartuntapisteestä. Esc peruu keskeneräisen sijoituksen. Myös yksittäisen osan
Kopioi-painike aloittaa sijoituksen näin.

Ryhmän kopio säilyttää alaryhmät, osien geometrian, värit, kokonaismitat sekä
kopioituihin osiin ankkuroidut apuviivat. Kopiot ovat itsenäisiä osia. Yksi Peru
palauttaa koko siirron tai kopioinnin. Tallennus ja tiedoston uudelleenavaus
säilyttävät hierarkian.

## Viisteet ja pyöristykset

![Reunan suora hiirisäätö](docs/images/nivo-edge-drag.png)

**Reunat (F)** avaa reunakäsittelyn. Valitse **Pyöristys** tai **Viiste** ja
**vedä mallin reunasta** säätääksesi kokoa. Aloitussuunta kasvattaa mittaa;
takaisin vetäminen pienentää sitä. Mitta näkyy reunan vieressä ja oikeassa
paneelissa. CAD-esikatselu päivittyy vedon aikana. **Vapautus hyväksyy**,
**Esc peruu**. Sama veto toimii yhdellä sormella; toinen sormi keskeyttää
vedon ja palauttaa sitä edeltäneen reunavalinnan sekä mitan.

Tavallinen napsautus lisää reunan valintaan tai poistaa sen siitä. Voit valita
useita reunoja ja vetää jo valitusta reunasta: koko valinta saa saman mitan.
**Kaikki reunat** valitsee nykyisen osan reunat kerralla. Kirjoita halutessasi
tarkka mitta kesken vedon; se lukitsee koon hiiren myöhemmistä liikkeistä
riippumatta. Enter tai **Hyväksy reunakäsittely** toimii myös ilman vetoa.
Uusi veto vapauttaa aiemman numerolukituksen.

Pyöristyksen mitta on säde. Viiste käyttää samaa etäisyyttä reunan molemmilla
pinnoilla. Suorat ja kaarevat CAD-reunat ovat valittavissa. Yhdellä toiminnolla
käsitellään yhden osan reunat; seuraava osa voidaan valita samalla työkalulla.
Liian suuri mitta tai geometrian kannalta mahdoton reunayhdistelmä näyttää
virheen ja säilyttää alkuperäisen osan. Hold suojaa myös tältä muokkaukselta.

Kun palaat käsiteltyyn osaan F:llä, sama reunavalinta ja mitta avautuvat.
Lisää kohtaavat sivureunat: kaikki lasketaan yhdessä tallennetusta lähteestä.
Reunan napsautus poistaa sen käsittelystä; **Poista käsittely** palauttaa
terävän lähteen. Kierto, siirto, kopio ja uudelleenavaus säilyttävät muokattavuuden.
**Viimeistele ja aloita uusi** liittää tuloksen geometriaan. Myös myöhempi
E/O/Cut/Join tekee näin, jotta sen muutokset eivät katoa sädettä vaihdettaessa.
Vanhasta BRepistä puuttuvia käsittelyparametreja ei päätellä.

## Kahden pisteen dimensio

Paina **T**, avaa aktiivisen mittatyökalun valikko ja valitse **Dimensio**.
Poimi kaksi pistettä, vie mittaviiva sivulle ja napsauta tai paina Enteriä.
Myös toisesta pisteestä aloitettu veto ja vapautus hyväksyy sijoituksen.
Pisteet voivat olla eri osissa. X/Y/Z vaihtaa akselimittaan; sama näppäin
uudelleen palauttaa todellisen pistevälin. Valmis mitan teksti on vedettävissä
Valitse-tilassa. Mitta ei muuta kappaleen kokoa.

Viite seuraa osan siirtoa ja säilyvää geometriaa. Poistunut viite näkyy
rikkoutuneena, eikä sitä siirretä arvauksella uuteen reunaan. Mittakuva ja
SVG näyttävät mitan vain näkymässä, jossa sen geometria ja sijoittelu
ovat tasossa. Näin vinon 3D-mitan lyhentynyttä projektiota ei merkitä
virheellisesti todelliseksi tasomitaksi. Osan X/Y/Z-kokonaismitat säilyvät.

## Rakennusviivana piirtäminen

Suorakulmion, ympyrän, ellipsin, monikulmion ja Kynän pienessä toimintovalikossa
on **Mittaus/rakennusviiva**. Valitse se ennen piirtämistä tai kesken luonnoksen.
Muoto syntyy nollapaksuiseksi apumuodoksi: katkoviivainen ääriviiva tarjoaa
piste- ja keskipistetartunnat eikä jaa, leikkaa tai pursota alla olevaa osaa.
Tämä toimii myös osan muokkaustilassa ja pystypinnalla. Kynän muoto suljetaan
palaamalla alkupisteeseen tai Sulje muoto -painikkeella.

**Kappale** palauttaa tavallisen piirtämisen. Muokkaustilassa se noudattaa
Piirtotapa-valintaa kuten ennenkin. Rakennusviivan ääriviivaa napsauttamalla
voi valita apumuodon; sen sisäpuolelta valitaan alla oleva osa. Apumuoto on myös
kappalelistassa, joten sen voi nimetä, siirtää tai poistaa erikseen. Se tallentuu
projektiin ja kuuluu Peru/Palauta-historiaan, mutta jää pois mittakuvasta ja
renderöinnistä. Käyttö-valinnan aiemmat kolmiulotteiset apumuodot säilyvät tuettuina.

Reunasta aloitettu mittaus tunnistaa myös loppupään reunan, nurkan ja reunan
keskipisteen. Korostus näkyy poimitussa kohdassa, ja tarkka tartunta ohittaa
ruudukon pyöristyksen. Rinnakkaisen apuviivan mitta on edelleen kohtisuora
etäisyys lähtöreunasta; vapaa mittaviiva mittaa päätepisteiden välin.

![Erillinen rakennusviiva säilyttää levyn pinnan ehjänä](docs/images/nivo-construction.png)

## Renderöinti ja kuvavienti

Materiaalit löytyvät jo **Malli → valitse osa → Materiaali**. Valitse preset, tuo värikuva tai tee osasta valaiseva pinta. **Pinnan rakenne · PBR** tarjoaa normal-, bump-/korkeus-, karheus- ja metallisuuskartat. Ne käyttävät samaa sijoittelua kuin värikuva. Normal-kartan suunnaksi voi valita OpenGL (+Y) tai DirectX (−Y). Bump muunnetaan normal-kartaksi alkuperäisessä kuvasuhteessa; **Kohokuvion syvyys** annetaan millimetreinä ja säilyy myös tekstuuria skaalattaessa. Datakuvat tallennetaan häviöttöminä PNG-kuvina enintään 1024 pikselin kokoon. Valmiit kuviot ovat paikallisesti tuotettuja, eivät valokuvattuja materiaaliskannauksia. Niiden mukana syntyvät normal- ja karheuskartat.

**Luo rakenne värikuvasta** muodostaa kuvan vaaleuseroista normal- ja karheuskartan.
Se on arvio pintarakenteesta; valokuvasta ei voi päätellä oikeaa korkeutta tai karheutta.
Tuotu PBR-kanava korvaa vastaavan generoidun kanavan. Kuvia ei monisteta projektitiedostoon.
Melamiinin puukuvion reliefi on hillitympi kuin massiivipuussa. Normal/bump muuttaa
valaistusta, ei CAD-geometriaa tai leikkausmittoja.

Sekä mallin **Materiaali** että renderin **Osa valonlähteenä** tarjoavat samat LED-,
taustavalo- ja spottiesiasetukset, värin, voimakkuuden ja spotin suunnan/keilan.
Suunta seuraa osan kiertoa. Nopea esikatselu arvioi kahdeksan voimakkaimman
LED-osan kahden laajan pinnan valaisun ilman niiden varjoja. Tarkentuva renderöinti
laskee kaikkien todellisten pintojen valon, peittymisen ja heijastukset; esikatselun
apuvalot poistetaan sekä tarkentuvasta kuvasta että taustalaskennasta.

Renderin **Materiaali**-välilehti sisältää erikseen avattavan Studion valaistus -kohdan. **Kuva** sisältää esikatselun ja viennin. Tarkentuva esikatselu päivittää koko kuvaa jokaisella näytteellä; erillinen PNG-työ voi jatkua mallinnuksen aikana.

**Renderöi** avaa esitysnäkymän. Valitse yksi osa, mallin valinta tai kaikki
näkyvät osat. Materiaaliryhmistä löytyvät seitsemän puuta, neljä metallia, kolme
lasia, neljä muovia, kahdeksan kiveä, kolme posliinia, kolme kalustepintaa,
kolme seinäpintaa, kaksi betonia, kolme laattaa ja kolme LED-valoa sekä
viisi melamiinia ja viisi kalustelevymateriaalia. Haku etsii kaikista ryhmistä.
Kuviot toimitetaan paikallisesti; eri puu- ja kivilajeilla on omat kuviot.
Väri, karheus, metallisuus, läpäisevyys ja pinnoite ovat säädettävissä.
Oman materiaalin voi tallentaa projektin materiaalikirjastoon.

**Lisää kuva** tuo PNG-, JPEG- tai WebP-tekstuurin (enintään 20 Mt).
Kuva pienennetään tarvittaessa 2048 pikseliin ja tallennetaan projektin mukaan.
**Muokkaa tekstuuria** avaa yhden osan sijoittelun: vedä pintaa siirtääksesi,
↗-kahvaa skaalataksesi ja ↻-kahvaa kiertääksesi. Leveys/korkeus ja siirtymät
syötetään millimetreinä, kierto asteina. Kuvasuhde on oletuksena lukittu.
Hiiriveto tallentaa yhden Peru-askeleen; Enter hyväksyy numeroarvot. Työkalu
pysyy päällä ja voit klikata toista osaa jatkaaksesi sen tekstuurin käsittelyä.
Esc peruu keskeneräiset numeroarvot ja lopettaa työkalun. Jo tallennetut vedot
säilyvät. **Valitse** tai **Maalaa** vaihtaa työkalua. Maalaa-tilassa valitse
siveltimen materiaali ja klikkaa osia; materiaalin valinta ei itsessään maalaa.
Kuvio seuraa kappaleen siirtoa, kiertoa ja kopiota. Kuvan sisältö jaetaan,
mutta osien sijoittelut ovat itsenäisiä.

Oikea painike kiertää kohdistimen alla olevan pinnan ympäri ja rulla zoomaa
kohdistimeen myös tekstuuria muokattaessa. Valitse Studio, Lämmin tai Tumma
valaistus sekä valotus ja varjot. **Tallenna PNG** vie nykyisen kameran kuvan
800, 1600 tai 2400 pikselin levyisenä. Hold säilyy mallissa, mutta sen korostus,
rakennusmuodot, apuviivat ja valintakahvat eivät tule esityskuvaan.

![Paikalliset materiaalinäytteet](docs/images/nivo-material-catalog-v019.png)

Nopea esikatselu ja valinnainen tarkentuva path tracing käyttävät WebGL2:ta. Omat valaistusympäristöt ja erillinen
UV-saarekkeiden editori ovat jatkotyötä. Kuviointi käyttää kappaleen omaan
koordinaatistoon sidottua tasoprojektiota pinnan normaalin mukaan. Kaarevien
pintojen projektiosaumojen parantaminen on backlogissa.

## Avoin kynäviiva ja nopea aukko

**Kynä → kaksi tai useampia pisteitä → Enter / Valmis viiva** tekee avoimen
viivan. Tavallisen kappaleen tai avatun osan pinnalla reunasta reunaan kulkeva
viiva jakaa pinnan heti viimeisen pisteen vahvistuksessa. Alueita voi muokata E:llä.
Ensimmäisen viivan toinen piste auttaa valitsemaan reunalla oikean piirtopinnan,
jotta kynä ei jää lattian ohuen sivun tasoon perspektiivissä.
Pinnalle kesken päättyvää viivaa voi jatkaa; Enter tallentaa sen erillisenä piirrosviivana.
Suljettua komponenttia viiva ei muokkaa automaattisesti: avaa osa tuplaklikkaamalla
tai valitse valmis piirrosviiva ja oikeasta paneelista **Jaa pinta**.
Viivan voi valita, siirtää, tallentaa ja poistaa; U kumittaa myös piirrosviivan.
Suljettu muoto syntyy edelleen palaamalla alkupisteeseen tai **Sulje muoto** -painikkeella.

**Leikkaa aukko** löytyy valmiin nollapaksuisen muodon yhteydestä sekä valitun
muodon Toiminnot-valikosta. Suorakulmio, ympyrä, ellipsi, monikulmio tai suljettu
kynämuoto leikkaa kohtisuoraan molempiin suuntiin näkyvien, vapaiden osien läpi.
Oikean reunan paneeli listaa ja korostaa todelliset kohteet; yksittäisen osan voi
jättää pois. Piilotetut ja Hold-osat säilyvät. Leikattavat komponentit tehdään
uniikeiksi, jotta eri kohdassa olevaan linkitettyyn kopioon ei synny aukkoa.
Piirretty muoto poistuu oletuksena; **Säilytä piirretty muoto** jättää sen malliin.
Yksi Peru palauttaa koko leikkauksen. Cut/Join säilyy yleistä kappaletyöstöä varten.

![Aukon kohteet korostuvat, oikean reunan paneeli sallii osan jättämisen pois](docs/images/nivo-opening-v016.png)

## Uusi osa, muokkaustila ja kumitus

**Normaalitilassa piirtäminen luo uuden osan.** Kaapin pinta antaa piirtotason
ja tartunnat, mutta ei muuta piirrosta kaapin pintamuokkaukseksi. Tämä koskee
myös pientä, kokonaan pinnan sisään mahtuvaa suorakulmiota tai ympyrää.

**Valitse-työkalulla (V) tuplaklikkaa osaa 3D-näkymässä** tai valitse osa ja paina **Muokkaa osaa**.
Mallinnusalueen yläreunan **Muokkaustila**-palkki, osan nimi ja hillitty reunus kertovat kohteen.
Toisen osan napsautus näyttää ohjeen myös kohdistimen lähellä. Muut osat himmenevät,
mutta niiden pisteet, reunat ja pinnat tarjoavat edelleen tartunnat ja viitteet.
Piirtotapa on **Pinnan alue**: aloita avattavan osan pinnalta ja piirrä rajaus.
Positiivinen paksuus lisää materiaalia, negatiivinen tekee syvennyksen ja nolla
tekee E:llä muokattavan alueen. **Uusi osa** on valittavissa myös muokkaustilassa;
avattu osa pysyy muokkauksen kohteena. Sääntö on sama tavallisille ja nimetyille osille.

![Avattu osa rajataan ja muut osat jäävät näkyviin tartuntaviitteiksi](docs/images/nivo-edit-context.png)

**Lopeta muokkaus** sulkee muokkaustilan. Myös Valitse-työkalun tuplaklikkaus
tyhjään tilaan sulkee sen. Yksittäinen ohiklikkaus, veto tai kameran liikuttaminen
ei sulje muokkaustilaa. **Esc** peruu ensin keskeneräisen toiminnon;
ilman keskeneräistä toimintoa se sulkee muokkaustilan. Sivun uudelleenavaus
alkaa normaalitilassa. **E ja O** toimivat suoraan myös normaalitilassa eivätkä
avaa pysyvää piirtomuokkausta. Cut/Join tehdään muokkaustilan ulkopuolella.

**Poista rajaus (U)**: osoita pintojen välistä jakoviivaa, tarkista korostetut
alueet ja klikkaa. Koko kyseisten kahden tasopinnan yhteinen rajaus poistuu.
Muut jaot, kappaleen ulkomitat, tilavuus, nimi ja väri säilyvät. Toiminto sopii
myös ympyrärajoihin ja vinoihin tasopintoihin ja toimii ilman aiempaa historiaa.
Rakenteellisia kulmia, syvennyksiä ja aukkoja ei kumiteta; niiden täyttö on jatkotyötä.
Hold estää muokkauksen. Peru palauttaa poistetun rajauksen.

![Poista rajaus korostaa yhdistyvät pinnat ja säilyttää muut pintajaot](docs/images/nivo-erase-boundary.png)

Selaimeen tallentuu nykyisen mallin lisäksi enintään **20 Peru/Palauta-askelta
yhteensä, 8 MiB:n budjetissa**. Suuret mallit lyhentävät säilyvää historiaa.
Vaurioitunut tai vanhaan malliin kuuluva historia ohitetaan; nykyinen malli avautuu.
Jos historia ei mahdu tallennukseen, nykyinen malli tallennetaan ja tilarivi kertoo
rajoituksesta. `.nivo`-tiedosto sisältää nykyisen mallin, ei selaimen historiaa.

## Mitat ja osavärit

Valitse yksi tai useita osia ja paina **Lisää kokonaismitat**. Toiminto lisää
puuttuvat X-, Y- ja Z-ulkomitat; samaa mittaa ei lisätä kahdesti. Mitat-listasta
voi poistaa yksittäisen mitan. 3D-näkymän asetuksissa voi näyttää kaikki lisätyt
mitat, vain valinnan mitat tai piilottaa mittamerkinnät. Suoraan katselusuunnan
suuntaista mittaa ei piirretä, koska sen pituus kuvassa on nolla. Piilotetun
osan mitat piiloutuvat mallinnusnäkymässä.

**Mittakuva** näyttää näkymään kuuluvat kaksi mittasuuntaa. Etukuvassa näkyvät
X/Z, sivukuvassa Y/Z ja yläkuvassa X/Y. Päällekkäiset mittaluvut sijoitetaan eri
riveille. Sovitus varaa myös mittaviivoille tilan, ja SVG käyttää valittua
fyysistä mittakaavaa. Kokonaismitat kuvaavat maailman akselien suuntaista
rajalaatikkoa; kahden pisteen dimensio mittaa myös vinon reunan todellisen
pituuden. Kulmamitat ovat jatkokehitystä.

![Kahden osan väliin sijoitettu dimensio](docs/images/nivo-point-dimension.png)

![Sama mitoitus mittakuvassa ja SVG-viennissä](docs/images/nivo-dimensions-drawing.png)

Valinnan **Väri** vaihtaa yhden tai kaikkien valittujen osien värin yhdellä
painalluksella. Oma väri hyväksytään värivalitsimen vieressä olevasta merkistä.
Muutos tallentuu projektiin ja peruuntuu yhtenä askeleena. Hold-lukittu osa säilyttää
oman värinsä ja materiaalinsa. Lukitus näkyy listan lukosta, hillitystä reunasta
ja valinnan Hold-merkinnästä; materiaalin muuttaminen edellyttää lukituksen vapauttamista.

## Piirtämisen perustyökalut

- **Pintaan piirtäminen:** ensimmäinen napsautus valitsee piirtotason;
  myös pysty- ja vinopinnat sekä Hold-kappaleet sopivat viitteiksi. Kulmassa
  käytetään kameraa kohti olevaa viereistä pintaa. Normaalitilan **Uusi osa**
  säilyttää esimerkiksi kahden kaapin yli piirretyn LED-nauhan kokonaisena.
  **Pinnan alue** on käytettävissä vasta avatun osan muokkaustilassa ja vaatii
  pintaan uuden rajauksen. Hold-kappaletta ei jaeta.
  Alueen paksuus **0** jakaa pinnan; E muokkaa valittua aluetta. **Leikkaa läpi**
  tekee läpireiän. Uudelle osalle E antaa oman paksuuden.
- **Ovi onttoon kaappiin:** valitse Suorakulmio, napsauta etukehyksen vasenta
  yläkulmaa, siirrä osoitin oikeaan alakulmaan ja napsauta. Normaalitilan
  piirto luo oven omaksi osaksi, ja kaappi säilyy ennallaan. Paina E ja anna
  esimerkiksi 18 mm paksuudeksi. Piirtotapa → Uusi osa sopii myös pienemmälle
  erilliselle ovelle tai levylle saman pinnan tasossa.
- **Ympyrä (C):** napsauta keskipistettä ja reunaa, vedä säde tai kirjoita halkaisija. Muoto-valikosta
  saa myös ellipsin kahdella halkaisijalla ja säännöllisen 3–64-sivuisen monikulmion.
  Kynällä voi tehdä muun tasomaisen suljetun ääriviivan. Ympyrät ja ellipsit ovat
  tarkkoja CAD-käyriä.
- **Muodon ominaisuudet:** anna nimi, mitat ja paksuus samassa valikossa.
  Pintaan liitetyn mallinnettavan muodon positiivinen paksuus lisää materiaalia,
  negatiivinen tekee syvennyksen. Muut muodot syntyvät itsenäisinä objekteina.
  **Rakentamisen apumuoto** näkyy sinisinä ääriviivoina ja tarjoaa tartunnat;
  se ei tule mittakuvaan. **Piirros** näkyy ääriviivoina myös mittakuvassa.
  **Nimetty osa** on itsenäinen osa; kopiot eivät ole linkitettyjä komponentteja.

- **Offset (O):** osoita vapaata tasopintaa ja paina O tai valitse työkalu ja
  vedä pinnasta. Hiiren liike säätää sisennystä, sininen ääriviiva näyttää tuloksen.
  Kirjoita halutessasi tarkka mitta: se säilyy hiiren liikkuessa. Klikkaus,
  vedon vapautus tai Enter hyväksyy. Esc peruu esikatselun. Kappale säilyy
  yhtenä objektina, jonka pintaan syntyy uusi muokattava alue. E:n **Toteutuva kokonaismitta**
  18 jättää kaappiin 18 mm takaseinän; **Leikkaa läpi**, vastapinnan ohi vetäminen tai
  toteutuva kokonaismitta 0 tekee aukon. Toimii myös ympyröillä ja vinoilla tasopinnoilla.
  Liian suuri tai erillisiksi alueiksi hajoava sisennys hylätään muuttamatta mallia.
- **Push / pull (E):** vapaan pinnan korostus seuraa kohdistinta jo valintatilassa. Paina ja vedä pintaa
  normaalinsa suunnassa tai valitse pinta, paina E ja kirjoita siirtymä. Positiivinen
  arvo vetää ulospäin, negatiivinen työntää sisään. Toimii laatikon kaikilla kuudella
  pinnalla, kynämuodoilla ja yhdistettyjen osien tasopinnoilla.
- **Push/pull tavoitemittaan:** osoita lähtöpintaa ja paina E (tai klikkaa sitä E-työkalulla), pidä **Shift pohjassa**
  ja osoita kulmaa, reunan tai kappaleen keskipistettä, reunaa, apuviivaa tai tasopintaa.
  Kulmat ovat etusijalla, sitten keskipisteet, reunat ja pinnat. Korostettu piste antaa
  tavoitetason lähtöpinnan normaalin suunnassa; sivuttainen etäisyys ei vaikuta mittaan.
  Klikkaus tai vedon vapautus hyväksyy. Myös Hold-osa käy viitteeksi.
  Lähtöpinta, sen reunapisteet, oman osan keskipiste ja liikkuva esikatselu eivät kelpaa
  tavoitteiksi. Tyhjä tila säilyttää edellisen mitan. Shiftin vapautus jatkaa siitä
  ilman hyppyä. **Poimi tavoitemitta** tarjoaa saman haun kosketuksella → kohde → Enter.
  Yhdensuuntaiset tasopinnat tulevat samalle tasolle; vinosta pinnasta poimitaan
  osoitetun pisteen taso. Lähtöpinta ei kallistu. Kirjoitettu mitta ohittaa tartunnan,
  Esc peruu. Kaarevan pinnan vapaata pintapoimintaa ei vielä käytetä.
- **Toteutuva kokonaismitta:** push/pull näyttää siirtymän ja toteutuvan kokonaismitan.
  652 mm osassa siirtymä `−150` jättää 502 mm. Paina Tab: sama luku muuttuu
  lopulliseksi mitaksi 150 mm, ja siirtymäksi lasketaan −502 mm. Shift+Tab
  vaihtaa takaisin. Kenttää napsauttamalla voit syöttää toteutuvan kokonaismitan suoraan.
  Suurempi mitta pidentää osaa; vastapinta säilyy paikallaan myös vastakkaisilta
  sivuilta muokattaessa. Etumerkitön siirtymä seuraa vedon suuntaa (ilman vetoa
  ulospäin), `+` ja `−` määräävät suunnan erikseen. Toteutuva kokonaismitta on
  vähintään nolla; nolla avaa rajatun alueen läpi. Koko osan poistava työntö hylätään.
  Vihreä mittaviiva kulkee ensimmäisestä vastapinnasta uuteen pintaan.
  Syvennyksessä voi näin jättää esimerkiksi 5 mm materiaalia. Vaihtelevan
  paksuuden osassa mitta koskee osoitettua kohtaa ja valitun pinnan normaalin suuntaa.
  Tyhjä tila tai erillinen solidi vastapinnan takana ei kasvata tätä mittaa.
- **Kynä:** aseta verteksit näkymän tasolle tai tartu mallin pisteisiin. X/Y/Z
  lukitsee akselin. Shift lukitsee aloitetun viivan suunnan: toisen pisteen
  napsautus projisoi sen lukitulle viivalle ja määrää pituuden. Esimerkiksi
  suorakulmion kolmannen sivun pituuden voi poimia ensimmäisestä pisteestä.
  Shiftin voi painaa jo ennen alkupistettä tai ensimmäistä liikettä: ensimmäinen
  piirtosuunta lukittuu. Lukitus päättyy Shiftin vapautukseen tai viivan seuraavaan
  vahvistettuun pisteeseen. X/Y/Z ohittaa tilapäisen suuntalukon ja pysyy valittuna.
  Vapauta Shift ja sulje muoto tarttumalla aloitusverteksiin. Myös pysty- ja
  vinotasot käyvät, kun kaikki suljettavan muodon pisteet ovat samalla tasolla.
  Numeroilla annetut X/Y/Z-siirtymät ovat suhteessa edelliseen pisteeseen;
  lukitussa suunnassa syötetään yksi pituus. Enter lisää tarkan pisteen tai sulkee muodon.
- **Mittatyökalu:** painike aktivoi viimeksi käytetyn tilan. Vieressä oleva nuoli
  avaa valinnan: Apuviiva, Vapaa mittaviiva tai Dimensio. Apuviiva alkaa kappaleen
  verteksistä, reunasta, toisesta apuviivasta tai apuviivojen 3D-risteyksestä.
  Risteykset tarttuvat myös piirtotyökaluissa. Reunasta tai apuviivasta vetäminen tekee reunan suuntaisen apuviivan
  halutulle etäisyydelle. Koko reuna korostuu ja tartuntapiste seuraa kohdistinta.
  Vedä kannen tai sivupinnan puolelle: siirto seuraa kyseistä pintaa.
  Siihen voi tarttua myös jatkeen kohdalta. Vapaa mittaviiva näyttää
  kahden pisteen etäisyyden. Reunan suuntaisen apuviivan mittateksti ja
  mittakenttä näyttävät lähtökohdan ja viivan välisen etäisyyden, eivät lähtöreunan
  pituutta. Mittaväli näkyy yhdysviivana. Vedä tai napsauta alku- ja loppupisteet.
- **Apuviivan suunta:** reunasta vedettäessä X/Y/Z lukitsee **siirtosuunnan**;
  viiva säilyttää reunan suunnan. Sama näppäin vapauttaa lukon. Verteksistä
  alkavan viivan X/Y/Z lukitsee viivan suunnan; oletuksena 45° ennakointi.
  R käynnistää hiirellä kierron 22,5° välein, Shift+R vapaan kierron. Kulman, pituuden tai reunaetäisyyden
  voi kirjoittaa. Valmiin viivan napsautus näkymässä tai Viivat-listassa vain
  valitsee sen. Pieni toimintovalikko tarjoaa Muokkaa-, Kierrä-, X-ray- ja
  Poista-toiminnot. Seuraava napsautus ei siirrä viivaa ilman Muokkaa-toimintoa.
  **Poista rajaus (U)** kumittaa myös korostetun apu- tai mittaviivan; Peru palauttaa sen.
- **Apuviivan näkyvyys:** vahvempi, hillityn sininen katkoviiva ja selkeä mittateksti peittyvät normaalisti kappaleen taakse.
  Viivat-listan x-ray näyttää valitun viivan kappaleiden läpi. Näkymän asetuksista
  saa x-rayn kaikille apuviivoille. Molemmat asetukset tallentuvat projektiin.
- **Mittaikkuna:** oletuksena oikeassa sivupaneelissa, mallin ulkopuolella.
  Vedä otsikosta haluamaasi paikkaan; paikka säilyy työkalujen välillä.
  Palautuspainike telakoi ikkunan takaisin oikeaan reunaan.
  Numero aloittaa ensimmäisestä kentästä, Tab vaihtaa
  kenttää, Enter hyväksyy. Hiiren vapautus hyväksyy vedon. Kirjoitetut mitat eivät
  muutu hiiren liikkeestä. Kenttää voi valita myös napsauttamalla.
- **Jatkuvat työkalut:** hyväksytty toiminto päättää vain nykyisen vedon.
  Aloita seuraava piirto, siirto, apuviiva tai pintamuokkaus samalla työkalulla.
  Siirrä-työkalu tarttuu valmisteltuun valintaan; ilman valintaa osan voi poimia suoraan vedolla.
  Esc peruu keskeneräisen luonnoksen, tyhjentää valinnan ja palauttaa valintatyökaluun.
- **Erilliset osat:** jokaisella objektilla on oma mesh. Monivalinta tai
  Shift/Ctrl/Cmd-napsautus valitsee useita osia. Yhdistä tekee niistä yhden
  CAD-kappaleen ja meshin; päällekkäiset tilavuudet yhdistyvät. Peru palauttaa
  erilliset osat. Yhdistäminen vaatii paksuuden.

![Offset-kaappi ja omaksi osaksi piirretty 18 mm ovi](docs/images/nivo-cabinet-door.png)

![Kelluva mittaikkuna ja kirjoittamalla lukitut mitat](docs/images/nivo-input.png)

![652 mm osan toteutuva kokonaismitta 550 mm ja automaattisesti laskettu −102 mm siirtymä](docs/images/nivo-final-size.png)

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
  Piirtämisessä **Poimi viite** ja pisteen napautus korvaavat Shiftillä poimimisen
  kosketusnäytöllä. Siirrossa kohde poimitaan suoraan vedon aikana.
- **Valitse (V) + Shift-klikkaus** lisää objektin valintaan tai poistaa sen siitä
  myös suoraan 3D-näkymässä. **M** siirtää kaikki valitut yhdessä ilman ryhmää.
  Shift huomioidaan jo hiiren painalluksesta, vaikka sen vapauttaisi ennen hiirtä.
  Valitse-tilassa Shift ei poimi viitepistettä. Muokkaustila rajaa edelleen
  valinnan avattuun osaan; Lopeta muokkaus palauttaa muiden osien valinnan.
- Kahden sormen ele panoroi ja zoomaa. **Navigoi**-tilassa yksi sormi kiertää.
- Hiiren oikea painike kiertää, keskipainike panoroi ja rulla zoomaa kohdistimeen.
  Navigoi-tilassa myös vasen painike kiertää.
- Kameran kierto poimii keskipisteen kohdistimen alta vedon alussa ja säilyttää
  sen vedon ajan. Pieni rengas näyttää pisteen. Sama toimii Navigoi-tilan
  yhden sormen vedolla. Piilotetut osat ja apuviivat eivät kaappaa pistettä.
- Tyhjästä tilasta aloitettu kierto käyttää muokattavan osan tai valinnan
  keskipistettä; ilman valintaa nykyistä näkymäkeskusta. Valittu osa tai ryhmä
  säilyy zoomin syvyysviitteenä. Muokkaustilassa viite säilyy osassa myös
  valinnan tyhjentyessä.
  Valitseminen ei hyppäytä näkymää; **Sovita näkymään** keskittää valinnan erikseen.
  Kohdistin määrää zoomin suunnan sekä perspektiivissä että rinnakkaisprojektiossa.
  Kosketuszoomauksessa käytetään sormien keskipistettä.
- V = valitse, S = suorakulmio, R = kierrä (apuviivaa muokattaessa viivan kierto),
  O = Offset, E = push/pull, G = kiinnitä/vapauta, M = siirrä, K = kynä,
  C = ympyrä/muut muodot, B = Muotoile (Cut/Join), T = mittatyökalu, H = piilota valinta.
  Shift+H = näytä viimeksi piilotetut, Alt+H = näytä kaikki piilotetut.
  X/Y/Z lukitsevat siirron, kynän tai apuviivan akselin. Enter hyväksyy.
  Sama X/Y/Z vapauttaa akselilukon. Esc päättää työkalun myös lukon ollessa päällä.
  Ctrl/Cmd+Z peruu, Ctrl/Cmd+Shift+Z palauttaa.
- Keskeiset toiminnot löytyvät painikkeista ilman näppäimistöä.

## Työtilan ja kappaleiden hallinta

- **Kierrä (R):** valitse yksi tai useampi kappale. Keskipiste ja origo ovat
  pikavalintoja; **Poimi kiertopiste** hyväksyy pisteen ja **Poimi kiertoakseli reunasta**
  suoran reunan. Vedä värirengasta tai kirjoita tarkka kulma. X/Y/Z valitsee akselin,
  Veto tarttuu 5° välein, vahvemmin pääsuuntiin. Shift vapauttaa tartunnan. Enter tai hiiren vapautus hyväksyy.
- **Origoon:** kohdista valinnan yhteinen alakulma tai keskipiste origoon yhdellä
  painikkeella. Kappaleiden keskinäiset sijainnit säilyvät. Näkymän ristikkopainike
  keskittää kameran origoon liikuttamatta mallia.
- **Kiinnitä (G) / Hold:** estää osan muokkaamisen, poistamisen ja materiaalimuutokset,
  myös linkitetyn kopion kautta. Oma materiaali säilyy näkyvissä. Lukitus pitää
  vapauttaa ennen muokkausta; tuplaklikkaus ei ohita Holdia. Piilotus ja lukituksen
  vapautus ovat käytettävissä. Ryhmän Hold suojaa myös sen alaryhmiä ja osia.
- **Kappalelista:** valitse napsauttamalla, nimeä kaksoisnapsauttamalla tai
  Nimi-kentästä, piilota silmästä ja kiinnitä lukosta. **Ryhmä** kokoaa valitut osat.
  Ryhmät toimivat myös sisäkkäin; niitä voi nimetä ja raahata kuten kappaleita.
  Ryhmän purkaminen asetuksista säilyttää kappaleet.
- **Asetukset:** Hillitty/Korostettu vaihtaa akselien voimakkuuden; nimitekstit
  saa erikseen näkyviin. Mukautuva ruudukko jatkuu kauas. Näyttöruudukon tiheys
  muuttuu zoomauksen mukana, ja ruudukkotartunnan askeleen voi säätää 0,1–10 000 mm:iin.

## Tarkistukset

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
NIVO_PREVIEW=1 npm run test:e2e
# GitHub Pagesin /nivo/-polun tuotantotarkistus:
NIVO_BASE_PATH=/nivo/ npm run build
NIVO_BASE_PATH=/nivo/ NIVO_PREVIEW=1 npm run test:e2e
npm run format:check
```

Geometriatestit käyttävät oikeaa WASM-ydintä. Selaintestit kattavat työpöytäkoon
ja Chromiumin kosketusemuloinnin. Fyysistä iPadia/Safaria ei ole vielä testattu.
[Testiraportti](docs/validation.md) kuvaa tarkistukset ja rajat.

## V0.10:n työnkulut

![Levyrungon esikatselu ja mitat](docs/images/nivo-cabinet-builder.png)

- **Muodot** avaa suorakulmion, ympyrän, ellipsin ja monikulmion. Valitse työkalu,
  napsauta alkupiste ja napsauta loppupiste tai vedä muoto. Työkalun valinta ei
  piirrä oletuskokoista muotoa. Numerosyöttö ja pikanäppäimet säilyvät.
- **Valitse (V)**: vedä laatikko mistä tahansa näkymän kohdasta. Kokonaan laatikon
  sisään jäävät osat valitaan. Shift lisää laatikon osat aiempaan valintaan;
  Shift-klikkaus lisää tai poistaa yksittäisen osan. M siirtää valinnan.
- **Mittakuva**: valitse kohde, näkymä ja Lisää kokonaismitat tai Lisää mitta.
  Kahden pisteen mitta poimitaan suoraan piirroksesta ja sijoitetaan kolmannella
  napsautuksella. Mitan suunnaksi voi valita vaaka-, pysty- tai pistevälimitan.
  Itse lisättyä mittaviivaa voi siirtää vetämällä; Esc peruu ja Peru palauttaa. Vie PDF tai SVG. Arkin asetuksissa automaattinen/manuaalinen
  mittakaava ja piiloviivat. Tulosta 100 % koossa.
- **Renderöi**: Materiaali ja Kuva jakavat asetukset. Materiaali → Osa valonlähteenä
  muuttaa osan LED-pinnaksi tai suunnatuksi spotiksi. Samat säädöt ovat mallissa.
  LED valaisee ympäristöä myös nopeassa esikatselussa; tarkentuva kuva huomioi varjot.
  Kuva-välilehden Tarkentuva laskee lisää näytteitä paikallaan pysyvään kuvaan;
  laskennan voi tauottaa. Kuvakulman/materiaalin muutos aloittaa kertymän alusta.
  Esikatselun Kevyt/Täysi ja näytetavoite säätelevät kuormaa. Tavoitteen saavuttaminen
  pysäyttää laskennan; näkymän muuttaminen käynnistää sen uudelleen.
  **Kuvan laskenta → Tarkka → Laske tarkka kuva** ottaa tilannekuvan nykyisestä
  mallista, materiaaleista ja kamerasta. Valitse 800/1 600/2 400 px ja 8–1 024 näytettä.
  Voit palata malliin kuvan valmistuessa. Tilakortista näet etenemisen, keskeytät
  tai lataat valmiin PNG:n. Työ ei säily sivun päivityksen tai sulkemisen yli.
  Nopea esikatselu tallentuu heti. Materiaali → Studion valaistus: suunta, valo- ja
  ympäristövoimakkuus sekä lattian näkyvyys.
- **Osat**: automaattinen osaluettelo ja numeroitu räjäytyskuva. Valitse kokoonpano,
  säädä räjäytystä, vie CSV/PNG. Yksi mallinnettu kiinteä kappale on yksi osa.
  Räjäytys siirtää osien keskipisteitä suoraan kokoonpanon keskipisteestä ulospäin.
  Keskellä oleva osa pysyy paikallaan, kun ympäröivät osat erkanevat. Malli ei muutu.
- **Osat → Leikkauslista**: valitse kokoonpano, levykoko tai omat mitat, sahausura
  ja reunavara. Päivitä asettelu kokeilee kuutta suorien sahausten sijoittelua:
  ensisijaisesti vähemmän levyjä, sitten suurempia yhtenäisiä jäännöspaloja.
  Eri materiaalit, värit ja paksuudet saavat omat levynsä. Numerot vastaavat
  saman kokoonpanon räjäytyskuvaa. Klikkaa osaa kuvassa tai listassa säätääksesi
  syysuuntaa, aihiomittoja, levymateriaalin nimeä tai mukanaoloa.
  Syyt kulkevat levyn pituussuuntaan; osan pituus tai leveys voidaan lukita siihen.
  Puu- ja harjatut presetit sekä omat kuvat käyttävät oletuksena pituussuuntaa;
  suunta on tarkistettava eikä sitä päätellä tekstuurin sijoittelusta.
  Suorakulmaiset osat tunnistetaan tarkoista CAD-pisteistä myös kierrettyinä.
  Kaarevat, reiälliset ja ontot osat tarvitsevat käsin vahvistetun suorakulmaisen
  aihion. Muuttunut geometria mitätöi käsin annetun aihion vahvistuksen.
  Liian suuret ja puuttuvamittaiset osat näkyvät tarkistettavina myös viennissä.
  **Tulosta leikkauslista / Tallenna PDF** sisältävät levykuvat ja numeroidun
  osalistan; CSV sisältää myös levynumerot. Asetukset tallentuvat projektiin ja
  ovat peruttavissa. Reunalistoja ja koneistusvaroja ei päätellä automaattisesti.
  Asettelu on ehdotus, ei takuu matemaattisesti pienimmästä hukasta. CNC on backlogissa.
- **Muodot → Levyrunko**: anna leveys, syvyys, korkeus ja levypaksuus. Valitse
  kannen/pohjan liitos sivuihin, taustan sijainti ja paksuus sekä hyllyjen määrä.
  Voit lisätä yksi- tai parioven rakoineen. Esikatselu näyttää tuloksen ennen hyväksyntää.
  Hyväksyminen luo nimetyn ryhmän ja erilliset muokattavat levykomponentit yhdellä
  Peru-askeleella. Valittu osa antaa aloitusmitat ja sijainnin; erillinen
  Korvaa lähtöosa -valinta korvaa sen levyillä. Hold suojaa korvaamiselta.
  Ovet tulevat rungon eteen ja lisäävät kokonaissyvyyttä levypaksuuden verran.
  Liitoksia, helaporauksia, sahausvaroja ja materiaalisuuntaa ei päätellä.

![Numeroitu leikkauslista ja levyille sijoittelu](docs/images/nivo-cutting-list.png)

## Rajaus ja jatko

Tasopintojen mallinnus, ryhmät, kokoonpanot, linkitetyt komponentit, pohjakuvan
kalibrointi ja näkymäleikkaukset ovat käytössä. Kaarevalle pinnalle piirtäminen,
kaarevan sivupinnan push/pull, yleinen parametrinen piirrehistoria ja
luonnosten rajoiteratkaisin ovat jatkokehitystä.

Apuviivojen tavallinen tartunta käyttää piirtotasoa; haettu viitepiste voidaan
projisoida lukitulle suunnalle. Reunan tartunta tukee suoria CAD-reunoja.
Geometriamuutoksessa säilyvät CAD-verteksit säilyttävät viitteensä; poistuneet
kohteet näytetään rikkoutuneina. Topologiakohteiden yleinen nimeäminen,
mesh-tuonti, layerit, tallennetut kamerat sekä STEP-, STL- ja GLB-vienti
ovat jatkotyötä.

Mittakuvien seuraava kokonaisuus on useiden näkymien ja leikkausten
asettelu samalle arkille. CNC-työstöradat, konekohtaiset ohjeet ja vapaamuotoinen
nesting eivät sisälly nykyiseen suorakulmaisten aihioiden leikkauslistaan.
**Käytettävyys ja perustyökalujen luotettavuus ohjaavat kehitysjärjestystä.**

- [Alkuperäinen määrittely](docs/requirements.fi.md)
- [Arkkitehtuuri ja päätökset](docs/architecture.md)
- [Projektiformaatti v8](docs/project-format.md)
- [Toteutusvaiheet](docs/roadmap.md)

## Lisenssi

Nivon oma koodi: [MIT](LICENSE). Replicad ja Three.js: MIT.
OpenCascade.js/WASM: LGPL-2.1; OCCT sisältää oman lisenssipoikkeuksensa.
[Kirjastojen lisenssit ja lähdelinkit](public/licenses/NOTICE.txt) ovat mukana
myös tuotantopaketissa.
