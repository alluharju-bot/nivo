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

Mitoituksen jatkokehitys: vapaasti poimitut kaksi pistettä, vinon reunan oma
pituus, halkaisija/säde ja kulma, mittalapun siirtäminen sekä usean näkymän arkit.

Viisteiden, pyöristysten ja ryhmähierarkian ensimmäinen versio on toteutettu
v0.8.0:ssa. Seuraavaksi reunakäsittelyn hiirisäätö ja jälkikäteen muokattavat
parametrit, laajempi mitoitus ja referenssikuvan kalibrointi. Fyysinen tabletti
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
- Jatkokehitys: hiirellä vetäminen, parametristen reunakäsittelyjen muuttaminen
  myöhemmin, erimittaiset viisteet ja tangentiaalisten reunaketjujen valinta.
  Olennaisia seuraavia detaljeja ovat poraukset, upotukset ja toistokuviot.

## Toteutettu v0.8.0: renderöinnin ensimmäinen versio

- Erillinen esitysnäkymä, viisi materiaalia (matta, maalattu, puu, metalli, lasi),
  osavärit ja koko valinnan materiaalinvaihto.
- Kolme studioympäristön sävyä, valotus, varjot ja PNG-vienti nykyisestä kamerasta
  1 600 tai 2 400 pikselin leveydellä. Materiaalit ja valoasetukset tallentuvat.
- Jatkokehitys: omat tekstuurit ja syysuunnan/skaalan säätö, tallennetut kamerat,
  valaisimet ja emissio, laatutasot ja säteenjäljitys.

| Vaihe | Tila                 | Sisältö                                                                                                                         |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Perusta varmennettu  | CAD-worker, pursotus/leikkaus/pyöristys, BRep-serialisointi, pintaviite, ortografinen HLR. Fyysinen tabletti vielä testaamatta. |
| 1     | Työnkulku toteutettu | Suorakulmio → push/pull → valinta/siirto ja tartunnat → etukuva ja mitta → projektitiedosto/SVG, tallennus, historia, kosketus. |
| 2     | Osin toteutettu      | Sisäkkäiset ryhmät, nimet, näkyvyys, Hold ja ryhmäkopiointi tehty. Layerit ja linkitetyt komponentit myöhemmin.                 |
| 3     | Osin toteutettu      | Pintaan piirtäminen, leikkaukset, booleanit, viisteet, pyöristykset, offset, muut piirtotyökalut ja mesh-muokkaus.              |
| 4     | Osin toteutettu      | Viisi materiaalia ja puutekstuuri tehty. Oma teksturointi, pintasijoittelu ja emissio myöhemmin.                                |
| 5     | Osin toteutettu      | Studiovalaistus, esitysnäkymä ja PNG-vienti tehty. Tallennetut scenet ja kamerat myöhemmin.                                     |
| 6     | Suunniteltu          | Laaja mitoitus, arkit, PDF, useat näkymät ja leikkaukset. HLR/SVG-perusta on jo toteutettu.                                     |
| 7     | Suunniteltu          | Fyysisen tabletin työnkulut, suorituskyky, valinnan hienosäätö ja resurssibudjetit.                                             |

Jokainen vaihe pysyy ajettavana. Uusi toteutus ei saa rikkoa aiempien projektien
tuontia, historiaa tai mitoitusta. Hyväksymisesimerkit A–C täydennetään työkalujen
valmistuessa. Nykyinen kaappiesimerkki on kuuden itsenäisen levyn runko eikä
vielä täytä esimerkin A ovi-, layer-, komponentti- tai tekstuurivaatimuksia.

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
