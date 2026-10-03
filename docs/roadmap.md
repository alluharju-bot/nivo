# Toteutusvaiheet

[Kokonaisvaatimus](requirements.fi.md).

Prioriteettia tarkennettu käyttäjän kanssa: helppokäyttöisyys, mittasyöttö ja
perustyökalut toteutetaan ennen layereita, ryhmiä ja komponentteja. Alkuperäinen
vaihenumerointi säilyy vertailua varten.

Versiossa 0.2 toteutettu: itsenäiset objektimeshit ja valinnainen yhdistäminen,
mittatyökalun apuviiva/vapaa mittaviiva, apuviivoihin tarttuva piirto ja siirto,
haettava Shift-viite (kosketuksella Poimi viite), 45° ennakointi, kelluva
numero-/Tab-syöttö, Enter/vapautus-hyväksyntä sekä sulkeutuva Kynä ja pursotus.

Versiossa 0.3 toteutettu: E-työkalun hover-pintavalinta ja suora veto kaikille
nykyisten mallien tasopinnoille, myös vinoille ja yhdistetyille osille.
Reunasta vedettävä rinnakkainen apuviiva, R/45° ja Shift+R/vapaa kierto,
X/Y/Z-lukot ja Esc-vapautus, siniset viivat ja globaali/viivakohtainen x-ray.
Kynän Shift-suuntalukko ja pituuden poiminta toisesta pisteestä, aloituspisteeseen
sulkeminen sekä pystysuuntaiset tasomuodot. Suurten pintojen syvyystarkkuutta
ja korostusten piirtotapaa korjattu. Projektiformaatti V3 säilyttää tarkan BRepin
pintamuutoksissa ja tuo V1/V2-projektit migraatiolla.

Versiossa 0.4 toteutettu: suorakulmio, ympyrä, ellipsi ja monikulmio sekä
kappaleen tasopintaan piirtäminen myös vinoilla pinnoilla. Jaetun alueen
push/pull, taskut, läpiaukot ja syvyyden poiminta pinnasta. Cut/Join käyttää
useita kohteita ja työstökappaleita; roolit voi vaihtaa ja työstökappaleet säilyttää.
Yhteisessä paneelissa nimi, mitat, paksuus ja käyttötarkoitus: kappale,
rakentamisen apumuoto, piirros tai nimetty itsenäinen osa. V4 tallentaa tarkat
käyräprofiilit ja BRep-tulokset sekä säilyneet verteksiviitteet.

Versiossa 0.4.1 toteutettu: push/pullin siirtymä ja lopullinen mitta,
kirjoitetun luvun merkityksen vaihto Tabilla sekä nykyisen ja jäljelle jäävän
materiaalin mitan näyttö. Vastapinta mitataan tarkasta geometriasta valitun
pinnan normaalin suunnassa. Etumerkitön mitta seuraa vetosuuntaa, etumerkki
määrää sen suoraan. Sama toiminto toimii vinoilla pinnoilla ja taskun pohjalla.

Versiossa 0.4.2 toteutettu: koko reunan korostus ja tartuntapiste kohdistimen
kohdalla, apuviivan veto reunan viereistä pintaa pitkin sekä erillinen
X/Y/Z-siirtolukko. Hyväksytyn toiminnon jälkeen työkalu pysyy aktiivisena;
Esc päättää työkalun ja tyhjentää valinnan. Mittaikkuna on oikeassa sivupaneelissa
ja sen voi siirtää otsikosta. Aiempi Escillä tehty pelkän akselilukon vapautus
korvautuu saman akselinäppäimen uudella painalluksella.

Versiossa 0.5 toteutettu: vapaan pinnan osoituskorostus, Offset-sisennys ja
sisäalueen E-syvennys/läpileikkaus, myös lopullinen mitta 0. R-kierto poimitun
pisteen tai reunan ympäri, kulmasyöttö ja 15°-porrastus, origoon siirto,
G-kiinnitys sekä nimettävät ja piilotettavat kappaleet ja yksitasoiset ryhmät.
V5 tallentaa ryhmät, lukituksen ja näkyvyyden. Kauas jatkuva ruudukko,
hillityt oletusakselit ja valinnaiset akselitekstit viimeistelevät työtilaa.

Versiossa 0.5.1 toteutettu: yksi kompakti yläpalkki, selaimen koko näytön tila,
Offsetin hiirisäätö ja tarkka CAD-esikatselu, koko objektin valinta yhdellä
klikkauksella sekä M + Ctrl -kopiointi tartuntapisteestä ja numeroilla.

Versiossa 0.6 toteutettu: push/pullin kahden klikkauksen pintakohdistus ja
Toteutuva kokonaismitta -sanasto, osien yhteiset X/Y/Z-ulkomitat 3D:ssä ja
mittakuvassa, mittojen riveihin sijoittelu sekä osavärit monivalinnalla.

Versiossa 0.6.1 toteutettu: vapaa E-veto ja Shiftillä haettava tavoitepinta,
perspektiivin vakaa hiiriohjaus, suorakulmion/ympyrän kahden napsautuksen piirto
sekä piirtotavan Automaattinen / Uusi osa / Pinnan alue. Kaapin aukon päälle
piirretty ovi syntyy automaattisesti itsenäiseksi osaksi.

V0.9.0 toteuttaa kahden vapaasti poimitun pisteen mitan, vinon reunan pituuden
ja mittalapun siirtämisen. Jatkokehitys: halkaisija/säde, kulma ja usean näkymän arkit.

Viisteiden, pyöristysten ja ryhmähierarkian ensimmäinen versio on toteutettu
v0.8.0:ssa, ja reunakäsittelyn hiiri-/kosketussäätö v0.8.3:ssa. Muokattavat reunaparametrit ja kahden pisteen mitoitus valmistuivat v0.9.0:ssa. Seuraavaksi jää referenssikuvan kalibrointi. Fyysinen tabletti
ja Safari varmennetaan erikseen. Linkitetyt komponentit seuraavat myöhemmin.

## Toteutettu v0.7.0: osan muokkaustila ja geometrian korjaus

Käyttäjän LED-nauha- ja kaappiesimerkit osoittavat, että pinnan käyttäminen
piirtotasona ja sen muokkaaminen tarvitsevat näkyvän toimintarajan.
Muokkaustila, rajauksen poisto ja tallentuva palautushistoria on toteutettu.

- Normaalitilassa piirtäminen luo uuden osan, myös olemassa olevan osan pinnalle.
- Tuplaklikkaus tai Muokkaa osaa avaa yhden osan muokkaustilaan. Näkyvä
  muokkausraja, osan nimi ja Valmis-painike kertovat kohteen. Muut osat
  himmenevät ja tarjoavat tartuntoja; niiden geometria ei muutu.
- Muokkaustilassa piirrot jakavat vain avattua osaa. Uusi osa on edelleen
  eksplisiittisesti valittavissa esimerkiksi erilliselle LED-nauhalle.
- E/O-pikatoiminnot säilyvät suorina: osoitus ja E/O kohdistavat kyseisen
  toiminnon näkyvästi yhteen osaan. Tämä ei jätä seuraavaa piirtotyökalua
  muokkaamaan osaa; pysyvä piirtomuokkaus avataan tuplaklikkauksella.
- Valmis sulkee muokkaustilan. Esc peruu ensin keskeneräisen eleen; ilman
  keskeneräistä elettä Esc sulkee muokkaustilan.
- Nivon kaikki kappaleet ovat itsenäisiä objekteja, joten muokkaustila koskee
  kaikkia osia. Komponenttityyppi ja myöhemmät linkitetyt
  instanssit ovat erillisiä käsitteitä.
- Ensimmäinen kumitustoiminto: **Poista rajaus**. Valitaan saman tasopinnan
  sisäinen jakoviiva, näytetään yhdistyvä alue ja yhdistetään viereiset
  samantasoiset pinnat. Tilavuus, mitat, nimi ja väri säilyvät. Toiminta perustuu
  tallennettuun CAD-geometriaan ja toimii myös uudelleenavaamisen jälkeen.
- Rakenteellisten reunojen poistaminen, taskujen/aukkojen täyttö ja piirretyn
  luonnoksen poistaminen ovat eri toimintoja. Pelkkä viivan piilottaminen ei
  saa esittää geometrian korjaamista.
- Undo/redo säilyy selaimen päivityksen yli: enintään 20 lähintä askelta
  yhteensä, 8 MiB:n budjetti. Nykyinen malli ja historia tallentuvat samaan
  IndexedDB-transaktioon. Virheellinen tai vanhentunut historia ohitetaan;
  tallennustilan loppuessa yritetään nykyistä mallia ilman historiaa.
  Projektitiedoston formaatti säilyy V5:nä ja sisältää vain nykyisen mallin.

## Toteutettu v0.8.0: viisteet ja pyöristykset

- F: näkyvän suoran tai kaarevan CAD-reunan poiminta ja monivalinta yhdellä osalla.
- Pyöristys säteellä, tasamittainen viiste, kaikki reunat -valinta ja tarkka
  CAD-esikatselu. Numerosyöttö; Enter hyväksyy ja Esc peruu.
- Virheellinen mitta tai mahdoton geometria säilyttää alkuperäisen osan.
  Osan ja ryhmän Hold estää muokkauksen. Nimi, väri, ryhmä ja säilyvät viitteet
  pysyvät mukana; historia ja tarkka BRep tallentuvat.
- Hiirellä vetäminen valmistui v0.8.3:ssa. Parametrien jatkomuokkaus valmistui v0.9.0:ssa. Jatkokehitys: erimittaiset viisteet ja tangentiaalisten reunaketjujen valinta.
  Olennaisia seuraavia detaljeja ovat poraukset, upotukset ja toistokuviot.

## Toteutettu v0.8.0: renderöinnin ensimmäinen versio

- Erillinen esitysnäkymä, viisi materiaalia (matta, maalattu, puu, metalli, lasi),
  osavärit ja koko valinnan materiaalinvaihto.
- Kolme studioympäristön sävyä, valotus, varjot ja PNG-vienti nykyisestä kamerasta
  1 600 tai 2 400 pikselin leveydellä. Materiaalit ja valoasetukset tallentuvat.
- Omat tekstuurit ja syysuunnan/skaalan säätö valmistuivat v0.9.0:ssa. Jatkokehitys: tallennetut kamerat,
  omat valaistusympäristöt ja kohinanpoisto. Emissio, spotit ja progressiivinen path tracing valmistuivat v0.10:ssä.

| Vaihe | Tila                 | Sisältö                                                                                                                         |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Perusta varmennettu  | CAD-worker, pursotus/leikkaus/pyöristys, BRep-serialisointi, pintaviite, ortografinen HLR. Fyysinen tabletti vielä testaamatta. |
| 1     | Työnkulku toteutettu | Suorakulmio → push/pull → valinta/siirto ja tartunnat → etukuva ja mitta → projektitiedosto/SVG, tallennus, historia, kosketus. |
| 2     | Osin toteutettu      | Sisäkkäiset ryhmät, nimet, näkyvyys, Hold ja ryhmäkopiointi tehty. Layerit ja linkitetyt komponentit myöhemmin.                 |
| 3     | Osin toteutettu      | Pintaan piirtäminen, leikkaukset, booleanit, viisteet, pyöristykset, offset, muut piirtotyökalut ja mesh-muokkaus.              |
| 4     | Osin toteutettu      | 30 presettiä, tekstuurit, pintasijoittelu ja emissio tehty. UV-saarekkeet myöhemmin.                                            |
| 5     | Osin toteutettu      | Studiovalaistus, esitysnäkymä ja PNG-vienti tehty. Tallennetut scenet ja kamerat myöhemmin.                                     |
| 6     | Osin toteutettu      | A4, CAD-poiminta, PDF/SVG toteutettu. Useat näkymät ja leikkaukset myöhemmin.                                                   |
| 7     | Suunniteltu          | Fyysisen tabletin työnkulut, suorituskyky, valinnan hienosäätö ja resurssibudjetit.                                             |

Jokainen vaihe pysyy ajettavana. Uusi toteutus ei saa rikkoa aiempien projektien
tuontia, historiaa tai mitoitusta. Hyväksymisesimerkit A–C täydennetään työkalujen
valmistuessa. V0.9.0 lisää viimeistellyn kaapin ovineen, mittoineen ja tekstuureineen. Layerit, linkitetyt komponentit ja tallennetut kamerat jäävät A–C-esimerkkien jatkotyöksi.

## Backlog: mittakaavaan kalibroitava referenssikuva

Pohjakuva tuodaan XY-tasolle ylänäkymään. Julkisivu-/naamakuva tuodaan
pystytasolle etunäkymään; sama työnkulku soveltuu sivukuvaan.

1. Käyttäjä avaa kuvan ja valitsee tason.
2. Hän osoittaa kuvasta tunnetun mitan kaksi päätepistettä ja kirjoittaa
   todellisen mitan millimetreinä tai muussa tuetussa yksikössä.
3. Nivo skaalaa kuvan yhtenäisesti niin, että tunnettu väli on mallissa
   täsmälleen annettu mitta (1:1). Myös korkeus skaalautuu samalla kertoimella.
4. Kuvan sijainti ja kierto voidaan kohdistaa origoon tai mallin pisteisiin.
   Kuvan päälle voi heti piirtää ja rakentaa oikean kokoisia osia.
5. Referenssikuva voidaan lukita, piilottaa ja näyttää läpikuultavana.
   Kuva ja kalibrointi säilyvät tallennuksessa, avauksessa ja undo/redo-toiminnoissa.

Hyväksyntäesimerkki: pohjakuvan kahden pisteen väliksi annetaan 4 200 mm.
Samoihin päätepisteisiin piirretyn malliviivan tulee olla 4 200 mm pitkä.
Sama tarkistus tehdään julkisivukuvan pystymitalle. Epäkelpo tai nollapituinen
kalibrointi ei muuta nykyistä kuvaa tai mallia.

## Yöpassi 2.10.2026

Toteutettu kokonaisuus: sisäkkäiset ryhmät, periytyvä näkyvyys ja Hold,
ryhmän ja monivalinnan yhteinen siirto/kopiointi, viisteet ja pyöristykset sekä
renderöinnin ensimmäinen versio. Ryhmän sisällön rajaus tehdään valintaa
muuttamalla ennen siirtoa; näkymään sovitus on erillinen toiminto. Linkitetyt
komponentti-instanssit pysyvät myöhempänä ominaisuutena.

Muokkaustilan ja apuviivojen viimeistelyssä lisättiin näkyvä tilapalkki,
tyhjän tilan turvallinen tuplaklikkauspoistuminen, apuviivan lähtöetäisyys,
3D-risteystartunnat sekä viivan valinta, toimintovalikko ja kumitus. Koko
mallin oikean painikkeen kontekstivalikko on jatkokehitystä; kameran oikealla
painikkeella tehtävä kierto säilyy nykyisellään.

## Toteutettu v0.8.1: loppupään mittatartunta ja rakennusviivamuodot

Reunasta aloitetun apuviivan loppupää tunnistaa reunan, nurkan ja keskipisteen;
korostus jää osoitettuun kohteeseen. Tarkka geometrinen tartunta ohittaa
ruudukon pyöristyksen. Vapaa mittaviiva voi tallentaa loppupään reuna-ankkurin.

Muototyökalujen toimintovalikon Mittaus/rakennusviiva tuottaa tasomaisen
katkoviivaääriviivan erilliseksi apumuodoksi. Pohjana oleva kappale pysyy
muuttumattomana myös muokkaustilassa. Suorakulmio, ympyrä, ellipsi, säännöllinen
monikulmio ja suljettu kynämuoto käyttävät samaa toimintoa. Kappale-valinta
palauttaa normaalin piirtotavan. Apumuodot tallentuvat ja ovat peruttavissa,
mutta ne eivät tule mittakuvaan tai renderöintiin.

## Toteutettu v0.8.2: kappalelistan raahaus ja sivupaneeli

- Osat ja monivalinnat voi vetää ryhmään ja Päätasolle. Ryhmän veto siirtää
  koko alaryhmän; syklit on estetty. 3D-sijainti säilyy, Peru toimii yhdellä askeleella.
- Korostettu kohde, vetolappu, reunavieritys ja kosketuksen pistekahvat.
- Ryhmän nimi valitsee ryhmän; kaksoisnapsautus/F2 nimeää sekä osat että ryhmät.
  Näkyvyys ja Hold pysyvät riveillä, purkaminen siirtyi ryhmän asetuksiin.
- Lista pysyy paneelin yläosassa, valinnan tiedot ja työkalut sen alla.
  Väri, sijainti, nimeäminen/ryhmä ja mallinnuksen lisätoiminnot avataan tarvittaessa.

## Toteutettu v0.8.3: viisteiden ja pyöristysten suora säätö

Valittu seuraavaksi kokonaisuudeksi, koska se viimeistelee korkean prioriteetin
perustyökalua ja noudattaa E/O-työkalujen tuttua veto- ja numerosyöttöä.

- F → veto reunasta säätää sädettä tai viisteen kokoa. Vapautus hyväksyy,
  Enter toimii myös numerosyötön jälkeen ja Esc peruu.
- Napsautus säilyy monivalintana. Jo valitusta reunasta veto säätää koko
  reunavalintaa; kirjoitettu mitta lukitsee koon vedon loppuun asti.
- Vakaa aloitussuunta ja kameran mittakaava, palautetta reunan vieressä,
  CAD-esikatselussa ja samassa sivupaneelissa. Ei uutta työkalua tai valikkoa.
- Viimeisin koko lasketaan hyväksyttäessä tarkasti. Virheellinen mitta säilyttää
  alkuperäisen geometrian; Hold ja osan muokkauskonteksti pysyvät voimassa.
- Kosketuksen toinen sormi keskeyttää vedon. Historia ja tiedostomuoto säilyvät.
- Jälkikäteen muokattavat reunaparametrit, erimittaiset viisteet ja
  tangenttiketjujen valinta jäävät jatkokehitykseen.

## Toteutettu v0.8.4: kohdistinzoomaus ja valinnan kamerakeskus

- Rulla zoomaa kohdistimeen perspektiivissä ja rinnakkaisprojektiossa;
  kahden sormen zoomaus käyttää sormien keskipistettä.
- Valinnan yhteinen keskipiste ohjaa kameran kiertoa ja zoomin työskentelysyvyyttä.
  Muokattava osa on ensisijainen myös silloin, kun valinta tyhjenee.
- Valinta ei siirrä kameraa eikä käännä katselusuuntaa. Erillinen Sovita näkymään
  säilyy tapana keskittää ja sovittaa valinta. Panorointi toimii edelleen.

## Toteutettu v0.8.5: orbit kohdistimen alla olevan pinnan ympäri

- Kiertoliikkeen alussa poimitaan kohdistimen alla oleva näkyvä pinta ja piste
  lukitaan vedon ajaksi. Pieni rengas näyttää kiertokeskuksen.
- Pinta on ensisijainen myös muokkaustilassa, Hold-osalla ja geometrian
  esikatselussa. Piilotetut osat, apuviivat ja kiertokahvat ohitetaan.
- Tyhjästä tilasta aloitettu kierto käyttää muokattavan osan tai valinnan
  keskipistettä; ilman valintaa nykyistä näkymäkeskusta.
- Navigoi-tilan yhden sormen kierto käyttää samaa poimintaa. Toinen sormi
  vaihtaa tavalliseen panorointiin/zoomaukseen. Kohdistinzoomaus säilyy.
- Valitse-tilan Shift-monivalinta huomioi myös painalluksen alun, joten Shiftin
  vapautus ennen hiirtä ei korvaa valintaa. M siirtää vapaasti valitut osat
  yhdessä ilman ryhmää. Shiftin viitepoiminta kuuluu muihin työkaluihin.

## Toteutettu v0.9.0: jatkuvat kulmaliitokset

Kaapin etureunan pyöristys voi estää viereisen lyhyen reunan käsittelyn
seuraavassa operaatiossa. CAD-ydin osaa käsitellä useita reunoja yhdessä.
Ennen v0.9.0:aa Nivo säilytti hyväksynnän jälkeen vain tulosgeometrian;
nyt uusien käsittelyjen lähde ja parametrit säilyvät jatkomuokkausta varten.
Erillinen kulmatyypin valinta jää alla kuvattuun jatkokehitykseen.

- Säilytä lähde ja reunakäsittelyn parametrit, jotta kohtaavia reunoja voidaan
  lisätä samaan pyöristyskokonaisuuteen ja laskea kulmaliitos uudelleen.
- Tavoite: kolmen reunan Rolling Ball -liitos toimii myös jatkettaessa aiempaa
  käsittelyä. Neljän reunan tapaukset ja eri säteet varmennetaan geometrian mukaan.
- Setback on vaihtoehtoinen pehmeä siirtymä; sen toteutuskelpoisuus nykyisellä
  ytimellä tutkitaan erikseen. Tangenttiketjun valinta on erillinen toiminto.
- Viisteiden kohtaaminen käsitellään omana tapauksena. Mahdoton säde tai
  leikkaava siirtymä ei saa rikkoa alkuperäistä osaa tai muuttaa mittaa hiljaisesti.
- Hyväksyntä: etureuna ensin, sitten siihen liittyvät lyhyet sivureunat;
  tarkka esikatselu, muuttaminen, Peru/Palauta sekä tallennus ja uudelleenavaus.

## Toteutettu v0.9.0: viimeistelty, mitoitettu ja materiaalitettu malli

**Tila: toteutettu 3.10.2026.**

- F säilyttää lähdegeometrian, reunat ja koon. Kolmen kohtaavan reunan jatkaminen
  testattu 18 mm levyllä, pitkällä sivulla ja ontolla kaapilla. Neljän reunan
  pyramidikärki toimii testissä; Setback ja kaikkien topologioiden kattaminen
  eivät kuulu todettuun tukeen.
- T → Dimensio: kaksi poimittua pistettä, sivusijoitus, vedettävä teksti,
  akselimitta, pysyvät viitteet, mittakuva ja SVG.
- 27 paikallista presettiä, omat kuvat, projektin materiaalikirjasto sekä
  tekstuurin siirto-, koko- ja kiertokahvat. PNG ja renderin kohdistinnavigointi.
- Siirron yhtenäinen ruutukoordinaateissa tehtävä poiminta, liikkuvien osien
  omien pisteiden poissulku ja tarkka geometriatartunta ennen ruudukkoa.
  Ruudukkoaskel on nyt säädettävissä asetuksista.
- V6-projekti ja V2-historia: kuvat ovat kerran aineistotaulussa, vanhat
  projektit ja historia migroidaan. Uusi viimeistelty kaappiesimerkki on
  avattavissa aloitusnäkymästä ja tiedostona `public/examples/viimeistelty-kaappi.nivo`.

Alla säilyy toteutuksen hyväksytty suunnitelma ja sen ratkaisut. Varsinaiseen tavoitteeseen
kuuluvat kaikki kolme kokonaisuutta: muokattavat reunakäsittelyt, vapaasti
poimittu kahden pisteen mitoitus ja laajennettu materiaalien/tekstuurien työnkulku.
Niitä toteutetaan yhtenä kokonaisuutena, jonka lopputulos on mitoitettu kaappi,
muokattava pintakuviointi ja vietävä esityskuva. Aiempi pelkkiin reunoihin
rajattu yöpassi on tämän suunnitelman ensimmäinen osuus.

### Kahden pisteen dimensio

- Mittatyökalun selkeä **Dimensio**-tila: poimi ensimmäinen ja toinen piste,
  siirrä osoitin sivulle ja vahvista mittaviivan paikka klikkauksella.
  Myös toisesta pisteestä alkava veto ja vapautus toimii. Esikatselu näyttää
  mitta-apuviivat, mittaviivan ja arvon heti. Työkalu pysyy käytössä.
- Tartunnat verteksiin, reunan pisteeseen/keskipisteeseen, ympyrän keskukseen
  ja apuviivojen risteyksiin. Pisteet voivat olla eri kappaleissa, jotta
  esimerkiksi oven välys tai kahden kaapin väli voidaan mitoittaa.
- Oletus on pisteiden välinen todellinen etäisyys. X/Y/Z valitsee erikseen
  akselin suuntaisen mitan; valittu mittatapa näkyy esikatselussa.
- Valmiin mittaviivan sijoitusta voi muuttaa vetämällä. Mittateksti pysyy
  luettavana zoomatessa. Mitta näkyy 3D:ssä, sopivassa mittakuvan näkymässä
  ja SVG-viennissä. Vinon 3D-mitan projektiota ei esitetä huomaamatta
  todellisena tasomittana: näkymään sopimaton mitta jätetään siitä näkymästä pois.
- Päätepisteet sidotaan osaan ja säilyvään geometriaviitteeseen silloin,
  kun sellainen on saatavissa. Siirto päivittää mitan. Jos muutos poistaa
  viitteen, mitta merkitään korjattavaksi eikä arvata lähintä uutta reunaa.
- Tämä on geometriaa kuvaava mittamerkintä. Mittaviivan siirtäminen muuttaa
  sijoittelua, ei kappaleen kokoa. Nykyiset X/Y/Z-kokonaismitat säilyvät.

### Tekstuurin lisääminen ja suora muokkaus

1. Valitse osa tai useita osia ja materiaali; oman tekstuurin saa **Lisää kuva**
   -toiminnolla PNG-, JPEG- tai WebP-tiedostosta.
2. Valitse **Muokkaa tekstuuria**. Pintaa pitkin vetäminen siirtää kuviota,
   kokokahva skaalaa sitä ja kiertokahva muuttaa suuntaa. Suhdelukko on oletuksena
   päällä. Sivupaneelista voi syöttää myös leveyden/korkeuden millimetreinä,
   siirtymän ja kulman sekä palauttaa oletussijoittelun.
3. Muutos näkyy jatkuvasti renderissä. Hyväksyntä tallentaa yhden muutosaskeleen;
   Esc palauttaa edeltäneen sijoittelun. Tekstuurin siirto ei liikuta kappaletta.
4. Puun syysuunta, kuvion koko ja kohdistus säilyvät osaa siirrettäessä,
   kierrettäessä, kopioitaessa ja projektia uudelleen avattaessa.

Materiaalit pysyvät yhdessä sivupaneelissa: materiaalikategoria, visuaaliset
esikatselut ja valitun materiaalin tavalliset säädöt. Tekstuurin kahvat näkyvät
vain sen muokkaustilassa. Oikea painike jatkaa kameran kiertoa ja rulla zoomausta;
vasen veto muokkaa tekstuuria. Renderin kamera saa saman kohdistinzoomauksen ja
pinnasta poimitun orbitin kuin mallinnusnäkymä.

### Materiaalikirjaston tavoite: 27 nimettyä presettiä

| Ryhmä             | Presetit                                                       |
| ----------------- | -------------------------------------------------------------- |
| Massiivipuut (6)  | Luonnontammi, vaalea tammi, savutammi, pähkinä, koivu, mänty   |
| Metallit (4)      | Harjattu alumiini, harjattu ruostumaton teräs, kromi, messinki |
| Lasit (3)         | Kirkas, savulasi, huurre                                       |
| Muovit (4)        | Matta ABS, kiiltävä ABS, kirkas akryyli, huurteinen akryyli    |
| Kivet (4)         | Graniitti, marmori, liuskekivi, travertiini                    |
| Posliini (3)      | Kiiltävä valkoinen, matta valkoinen, tumma lasitettu           |
| Kalustepinnat (3) | Valkoinen melamiini, harmaa laminaatti, maalattu kalustepinta  |

Presetit määrittävät myös pintakuvion, karheuden, metallisuuden ja tarvittaessa
läpäisevyyden/pinnoitteen. Puulajit ja kivet tarvitsevat erottuvat kuviot;
pelkkä saman materiaalin nimeäminen ja värjääminen ei täytä tavoitetta.
Sävyä ja tavallisia pintaominaisuuksia voi muuttaa, ja valmis oma materiaali
voidaan tallentaa projektin materiaalikirjastoon. Nykyiset viisi materiaalia
avataan yhteensopivasti. Mukana toimitettavat presetit toimivat paikallisesti.

### Toteutusjärjestys

1. **Yhteinen tallennuspohja ja CAD-varmennus.** Määrittele reunakäsittelyjen
   lähteet, dimensioiden ankkurit, materiaalit ja tekstuuriaineistojen viitteet.
   Varmenna kohtaavien reunojen laskentatapa alla olevan reunasuunnitelman mukaan.
2. **Reunatyönkulku valmiiksi.** Lähteestä uudelleen laskeminen, reunojen
   lisääminen/poistaminen, mitan muuttaminen ja F-paneelin jatkomuokkaus.
3. **Dimensio alusta vientiin.** Poiminta, sijoitus, myöhempi siirto,
   geometrian mukana päivittyminen, mittakuva ja SVG.
4. **Materiaalit ja reaaliaikainen tekstuurityökalu.** Presetkirjasto,
   kuvan tuonti, objektin mukana pysyvä kuviointi, suorat kahvat ja tarkat mitat.
5. **Yhteinen viimeistely.** Tallennus, Peru/Palauta, kopiot, vanhat tiedostot,
   renderin kameran yhdenmukaisuus ja PNG-vienti. Yksi avattava kaappiesimerkki
   käy kaikki uudet työvaiheet läpi.

### Tekninen pohja ja hyväksyntä

- Nykyinen dimensio tuntee vain osan min/max-ulkomitan. Laajenna se myös
  kahden ankkurin, mittatavan ja sijoitustason sisältäväksi merkinnäksi.
  Käytä yhtä mittalaskentaa 3D:ssä ja SVG:ssä; paperitekstin koko säilyy
  tulostuksessa ja 3D-tekstin koko ruudulla luettavana.
- Nykyinen puukuviointi käyttää maailman koordinaatteja ja kiinteää skaalaa.
  Uusi sijoittelu sidotaan objektin omaan koordinaatistoon. Tasomaiset ja
  laatikkomaiset kalusteosat saavat hallittavan projektion, ja pyöristysten
  saumakohdat tarkistetaan oikeassa materiaaliesimerkissä.
- Muuta tekstuurin muunnosta ja materiaalin asetuksia esikatselussa ilman
  CAD-laskentaa tai kaikkien meshien uudelleenluontia jokaisella hiiritapahtumalla.
  Kuvan sisältö voidaan jakaa, mutta yhden osan tekstuurimuunnos ei saa muuttaa
  muiden osien sijoittelua.
- Kuvia ei monisteta jokaisen osan tai Peru-askeleen sisään. Aineistot saavat
  omat tunnisteet, niille käytetään kohtuullista esikatselutarkkuutta ja ne
  sisällytetään projektin vientiin. Nykyinen 10 Mt JSON-tuontiraja ja 8 MiB
  historiabudjetti huomioidaan uuden tallennusmuodon suunnittelussa.
- Valmistumiskoe: viimeistele oven kohtaavat reunat, mitoita kaksi pistettä
  ja oven välys, valitse tammimateriaali, kohdista syyt ja kuvion koko vetämällä,
  tuo oma kuva toiselle osalle, kopioi osat ja tallenna. Uudelleenavaus säilyttää
  muokattavat käsittelyt, mitat ja kuvioinnin; SVG ja PNG vastaavat näkymää.
- CAD- ja selaintestit kattavat uuden kokonaisuuden sekä aiemmat E/O/M-,
  ryhmä-, Hold-, valinta- ja kameratyönkulut. Presetit tarkistetaan visuaalisesti
  sekä erillisillä näytekappaleilla että kaapissa.

Valmistumista arvioidaan näiden toimivien työnkulkujen perusteella.
Dimension ja materiaaliputken toteutus kuuluu yöpassin tavoitteeseen myös,
jos jokin erikoisempi kulmaliitos vaatii erillistä jatkotutkimusta.

## Yöpassin reunakäsittelyosuus: kaapin reunat valmiiksi ja myöhemmin muokattaviksi

**Tila: toteutettu v0.9.0:ssa; seuraava kuvaa hyväksyttyä työnkulkua.** Tavoite on, että käyttäjä voi viimeistellä
kaapin tai oven kohtaavat reunat, jatkaa käsittelyä myöhemmin ja muuttaa sen
mittaa samassa F-työkalussa. Tämä yhdistää korkeimman prioriteetin
kulmaongelman ja jo suunnitellut muokattavat reunaparametrit yhdeksi työnkuluksi.

### Käyttäjälle valmistuva työnkulku

1. Pyöristä etureuna esimerkiksi 3 mm säteellä ja hyväksy.
2. Palaa F-työkaluun ja lisää samaan käsittelyyn kohtaavat lyhyet sivureunat.
   Kulman pinnat lasketaan yhdessä alkuperäisestä geometriasta.
3. Muuta säde 2 mm:iin vetämällä tai numerolla. Poista tarvittaessa yksi reuna
   käsittelystä tai poista koko käsittely ja palauta terävä reuna.
4. Tallenna, avaa uudelleen ja jatka samaa muokkausta. Peru/Palauta toimii
   yhdellä askeleella per hyväksytty muutos.

### Toteutusjärjestys ja valmistumisehdot

| Vaihe                         | Toteutus                                                                                                                                                                                              | Valmistumisehto                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Todennettava geometria     | Toista ongelma 600 × 600 × 18 mm levyllä, pitkällä kaappisivulla ja ontolla rungolla. Vertaa peräkkäisiä ja yhdessä laskettavia 2–3 kohtaavan reunan pyöristyksiä sekä viisteitä.                     | Tarkat CAD-testit osoittavat toimivan laskentatavan ja hylkäävät mahdottomat säteet ehjää osaa muuttamatta. Neljän reunan tapaus tutkitaan erikseen.            |
| 2. Muokattava käsittely       | Tallenna lähdegeometria, käsittelyn tunniste, reunaviitteet, tyyppi ja mitta. Laske muutos lähteestä ja säilytä nykyinen tarkka tulos.                                                                | Säteen muutos, reunan lisääminen/poistaminen ja käsittelyn poisto tuottavat ehjän kappaleen; alkuperäiset valinnat löytyvät luotettavasti.                      |
| 3. Yksi käyttöliittymä        | Näytä käsittely nykyisessä F-paneelissa. Avaa olemassa oleva käsittely myös sen pyöristetystä pinnasta. Tarjoa selkeä Jatka käsittelyä / Uusi käsittely -valinta vain, kun molemmat ovat mahdollisia. | Käyttäjä pystyy suorittamaan yllä olevan työnkulun ilman erillistä historiapaneelia. Hiiri, numero, Enter, Esc ja esikatselu toimivat samalla tavalla kuin nyt. |
| 4. Tallennus ja muut työkalut | Päivitä projektiskeema, worker-viestit, kopiointi, siirto/kierto ja historian tallennus. Määrittele, miten myöhempi E/O/Cut/Join vaikuttaa käsittelyyn.                                               | Uudelleenavaus ja kopion muokkaus säilyttävät oikean lähteen. Muu muokkaus ei hiljaisesti katoa, kun pyöristyksen mittaa muutetaan.                             |
| 5. Kokonainen kaappikoe       | Käy läpi oven ja rungon viimeistely, orbit-lähitarkastelu, mitoitus, ryhmäkopio, Hold, tallennus ja palautus.                                                                                         | Automaattiset CAD- ja selaintestit, tarkistetut kuvat sekä avattava esimerkkiprojekti osoittavat valmiin työnkulun.                                             |

### Keskeiset toteutuspäätökset

- Reunan tunniste sidotaan tallennettuun lähteeseen. Nykyisen tulosmeshin
  vaihtuva reunaindeksi ei kelpaa pysyväksi viitteeksi. Epäselvää vastaavuutta
  ei arvata: käyttäjä saa valita reunan uudelleen.
- Ensimmäinen versio tukee yhtä mittaa per käsittely ja useita siihen kuuluvia
  reunoja. Eri säteet samassa kulmassa ja tangenttiketjun laajennus tulevat
  vasta perustyönkulun valmistuttua.
- Kappaleen siirto, kierto ja kopio huomioivat myös käsittelyn lähteen.
  Geometriaa muuttava myöhempi E/O/Cut/Join tarvitsee määritellyn toimintatavan:
  joko riippuvuudet lasketaan oikein uudelleen tai käsittely viimeistellään
  näkyvästi ennen jatkomuokkausta. Vanhaa lähdettä ei käytetä muun muokkauksen yli.
- Vanhat `.nivo`-projektit avautuvat sellaisinaan. Jo valmiiksi pyöristetyn
  BRepin puuttuvia lähdeparametreja ei päätellä varmoina; uusien käsittelyjen
  muokattavuus ja vanhan geometrian mahdollinen korjaus erotetaan selvästi.
- Setback ja neljän reunan kaikki yhdistelmät ovat geometriaytimen erillisiä
  varmennuksia. Niille ei lisätä käyttöliittymävalintaa ennen toimivaa toteutusta.

**Reunakäsittelyosuus on valmis**, kun kohtaavien reunojen jatkaminen, mitan muuttaminen,
käsittelyn poistaminen ja uudelleenavaus toimivat samalla esimerkkiosalla
ilman geometriavirheitä tai aikaisempien muutosten katoamista. Jos ensimmäinen
CAD-varmennus paljastaa ytimen rajoitteen, ongelma rajataan testillä ja
toimiva soveltuvuusalue kirjataan ennen käyttöliittymän lupausten laajentamista.

## V0.10: nopeus, selkeys ja ensimmäinen jaettava beta

- Työkalupalkin työpöytäversio on tiivis; kosketukselle suuremmat osumat.
  Muodot ovat yhdessä valitsimessa, Push/pull heti Valitse-työkalun jälkeen.
  Muototyökalun aktivointi odottaa käyttäjän alkupistettä ilman oletusesikatselua.
- Valitse-tilan laatikkovalinta ottaa kokonaan ruudulla rajauksen sisään jäävät
  osat, myös toisten osien takana. Shift lisää joukkoon. Klikkaus ja Shift-klikkaus
  säilyvät. Muokkaustilan rajausta ja piilotuksia noudatetaan.
- Mittakuvalla on oma työtila: kohde (valinta, osa, ryhmä, näkyvä malli), näkymä,
  kahden pisteen mitat suoraan CAD-pisteistä/reunoista, kokonaismitat ja vienti.
  Arkin automaattinen sovitus, A4-vektori-PDF ja SVG. Mallinnustyökalut eivät
  näy mittakuvan työtilassa. Mittamerkintä ei muuta mallin geometriaa.
- Esityskuvan asetukset: Materiaali / Valo / Kuva. Kolme LED-materiaalia nostaa
  presetit 30:een. Osakohtainen emissio, spotin suunta, keilakulma, väri ja voimakkuus.
- Valinnainen progressiivinen path tracing, näytemäärä, tauko/jatkaminen ja nykyisen
  kuvan PNG. Kameran tai materiaalin muutos aloittaa kertymän uudelleen.
  Esikatselu laskee renderöintinäkymässä. Erillinen kuvatyö jatkuu mallinnustilassa;
  selaimen sulkemisen yli säilyvää työjonoa ei ole,
  Blender Cyclesin koko ominaisuusvalikoimaa eikä kohinanpoistoa. Rasteriesikatselu
  säilyy oletuksena. Fyysisen iPadin GPU-/muistirajat varmennetaan erikseen.
- Osat-työtila muodostaa luettelon erillisistä kiinteistä malliosista ja ryhmistä.
  Numeroitu, säädettävä räjäytyskuva, CSV ja PNG. Piilotetut kokoonpanon osat ovat
  mukana luettelossa. Räjäytyksen siirtymät eivät muuta projektia tai mittoja.
- GitHub Pages -työnkulku testaa ja paketoi `/nivo/`-polkuun. Selainkohtainen
  paikallistallennus ja `.nivo`-tiedostot säilyvät; ei pilvisynkronointia.

### Toteutettu: levyrunko ja leikkauslistan ensimmäinen versio

Automaattinen luettelo on luotettava vain, jos valmistettavat osat ovat erillisiä.
Yksi ontoksi työstetty BRep on yksi osa. Sen pintoja ei lasketa erillisiksi levyiksi.
**Muodot → Levyrunko** on valinnainen toiminto:

1. Käyttäjä valitsee kaapin ulkomitat ja levypaksuuden.
2. Hän valitsee kannen/pohjan suhteen sivuihin (välissä tai päällä/alla).
3. Tausta valitaan: ei taustaa, päällä, upotettu; lisäksi paksuus ja upotus.
4. Esikatselu näyttää nimettyinä sivut, kannen, pohjan ja taustan. Hyväksyntä
   luo erilliset levyt ryhmään yhtenä peruttavana toimintona.
5. Valinnaiset tasavälein jaetut hyllyt sekä yksi- tai pariovi rakoineen sisältyvät
   esikatseluun. Rakenteellinen liitos on puskuliitos; porauksia ja heloja ei lisätä.

Valitusta osasta voi ottaa mitat ja sijainnin. Lähtöosa säilyy oletuksena;
Korvaa lähtöosa -valinta korvaa sen hyväksynnässä. Korvaus ja alkuperäiset
mittaviitteet palautuvat yhdellä Perulla. Työkalu ei päättele liitoksia BRepin pinnoista.
V0.12:n leikkauslista tunnistaa suorakulmaiset erillisosat niiden paikallisista
CAD-mitoista, myös kiertyneet osat. Muut muodot tarvitsevat vahvistetun aihion.
Reunalistat, automaattiset koneistusvähennykset ja linkitettyjen identtisten
komponenttien valmistusmäärät ovat jatkotyötä. Räjäytyskuvan vanha osaluettelon
CSV säilyttää maailman X/Y/Z-ulkomitat; Leikkauslistan oma CSV sisältää aihiomitat.

Muut seuraavat käytettävyyskohteet: ensimmäisen testaajan havainnot, yhtenäinen
hyväksymis-/peruutuslogiikka kaikissa työkaluissa, useat mittakuvan näkymät ja
leikkaukset, kalibroitava referenssikuva sekä linkitetyt komponentit.

### Laajan passin renderöintilisäykset

Kevyt/täysi esikatselu, pysäyttävä näytetavoite ja kameran vaihdon automaattinen
uudelleenaloitus. Erillinen PNG-laskenta ottaa materiaalien, geometrian ja kameran
tilannekuvan omalle renderöijälle. Käyttäjä voi palata malliin, muokata sitä ja
ladata valmiin kuvan tilakortista. Työ voidaan keskeyttää. Välilehden on pysyttävä
auki; taustalle piilotettu selain voi keskeyttää laskennan tilapäisesti.
Studion valoille suunta ja voimakkuus, ympäristövalon voimakkuus ja lattian näkyvyys.

## V0.11: tarkkuus ennen lisäominaisuuksia

Toteutettu: yhteinen hover-/painalluspoiminta, näkyvät priorisoidut CAD-pisteet, kameraa kohti olevan todellisen viereisen pinnan valinta, suorakulmion ja ympyrän vaihdettava piirtotaso, oletuksena yhden akselin siirto, Ctrl-kopioinnin vaihtokytkin sekä vapaan mittamuutoksen ruudukko. Tarkka kirjoitettu mitta ja tarkoituksellinen geometriatartunta säilyvät.

Push/pullin Shift-haku ja kosketuksen Poimi tavoitemitta käyttävät kulma-, keskipiste-, reuna- ja apuviivatartuntoja ennen pintapoimintaa. Piste antaa tason liikkeen suunnassa; liikkuvan pinnan omat pisteet eivät kelpaa tavoitteiksi. Osoitus → E → Shift toimii ilman ylimääräistä lähtöpinnan klikkausta. Muototyökalun viitepisteen lukitus näkyy jo ennen alkupisteen valintaa.

Materiaali ja valaistus löytyvät jo mallin osan tiedoista. Renderin erillinen Valo-välilehti yhdistyy Materiaaliin. Melamiinit ja kalustelevyt nostavat presetit 40:een. PBR-kanavat ja paikallisesti tuotetut kohokuviot, kuvien latauksen odotus ja tracerin palautusta kestävät tekstuurimuunnokset. Tarkentuva esikatselu päivittyy koko kuvan alueelta kerralla.

Seuraavat renderöintiaskeleet: lisensoidut valokuvapohjaiset materiaalipaketit, pinnan UV-sauman hallinta kaarevilla pinnoilla, kohinanpoisto ja fyysisen iPadin GPU-varmennus. Muun käyttöönoton tarkkuushavainnot pysyvät lisäominaisuuksia tärkeämpinä.

## V0.12: säteittäinen räjäytys ja leikkauslista

- Räjäytyksen siirtymä on osan keskipisteen ja kokoonpanon keskipisteen erotus
  kerrottuna räjäytysmäärällä. Kaikki suuntakomponentit säilyvät: takaosan
  sidelistat liikkuvat taakse sekä ylös/alas. Keskitetty osa pysyy paikallaan,
  järjestys ei vaikuta tulokseen, ja Koottu palauttaa täsmälleen lähtöesityksen.
- Osat-näkymän kaksi välilehteä käyttävät yhteistä kokoonpanovalintaa ja numerointia.
  Leikkauslista sisältää erilliset kiinteät osat myös alaryhmistä ja piilotettuina.
- Vakiot/oma levykoko, sahausura ja reunavara. Kuuden deterministisen suorien
  sahausten asettelun vertailu vähentää levyjen tarvetta ja säilyttää jäännöspaloja.
  Materiaali/pintaväri/kuva sekä levypaksuus erottavat levyt. Osakohtainen
  levymateriaalin nimi mahdollistaa tarkoituksellisen yhdistämisen.
- Syysuunta: vapaa 90° kääntö tai osan pituuden/leveyden lukitus levyn pituuteen.
  Suorakulmaisten osien todelliset mitat, käsin annettavat aihiot muille muodoille,
  osakohtainen poisjättö ja liian suuren osan näkyvä ilmoitus.
- A4-vaakasuuntainen vektori-PDF, suora tulostus, numeroidut levykuvat ja osalista,
  sekä CSV levynumeroineen. Keskeneräisyys näkyy myös viennissä. Asetukset ja
  aihiot tallentuvat .nivo-projektiin sekä Peru-historiaan; malli ei muutu.

### Backlog: CNC-ohjeistus

Toteutetaan myöhemmin käyttäjän pyynnöstä. Ei mukana V0.12:ssa.
Työstöradat, työkalujen/terien määritys, kiinnitys- ja läpileikkausvarat,
poraus- ja taskutoiminnot, konekohtaiset postprosessorit ja G-code-vienti.
Nykyinen leikkauslista on suorakulmaisten aihioiden sahaussuunnitelma,
ei koneen ohjausohjelma. Myöhempi nesting: vapaamuotoiset ääriviivat,
olemassa olevat jäännöslevyt sekä eri varastolevykoot samassa materiaalissa.
