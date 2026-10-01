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

Mitoituksen jatkokehitys: vapaasti poimitut kaksi pistettä, vinon reunan oma
pituus, halkaisija/säde ja kulma, mittalapun siirtäminen sekä usean näkymän arkit.

Seuraava korkean prioriteetin työkalukokonaisuus on **viisteet ja pyöristykset**.
Mitoituksen, osavärien ja pintakohdistuksen jälkeen viitteiden poimintaa
ja muita perustyökaluja viimeistellään oikeilla malleilla. Fyysinen tabletti
ja Safari varmennetaan erikseen. Hierarkia ja linkitetyt komponentit seuraavat myöhemmin.

## Backlog: viisteet ja pyöristykset — erittäin korkea prioriteetti

- Reunan osoituskorostus ja yhden tai usean reunan valinta; toiminto myös
  valitun objektin tai osan kaikille soveltuville reunoille.
- Pyöristyssäde tai viisteen koko hiirellä ja numeroilla, välitön esikatselu,
  Enter/vapautus hyväksyy ja Esc peruu.
- Tarkka CAD-geometria, selkeä ilmoitus liian suuresta säteestä/viisteestä,
  alkuperäisen osan säilyminen virheessä. Hold estää muokkauksen.
- Osan nimi, väri, ryhmä ja säilyvät mittaviitteet pysyvät mukana.
  Undo/redo, tallennus, uudelleenavaus ja jatkomuokkaus varmennetaan.
- Hyväksyntä: 600 × 400 × 18 mm levyn reunoihin 2 mm pyöristys tai viiste;
  myös taskujen ja aukkojen reunat, monivalinta ja mahdoton 1000 mm säde.

## Backlog: renderöintiputki ja materiaalit

- Erillinen esitystila, jossa harkitut väri- ja materiaalipaletit, puu,
  melamiini, metalli ja lasi sekä karheus, tekstuurit ja niiden mittakaava.
- Ympäristövalaistus, varjot, tausta, kamerat ja tallennettavat esitysnäkymät.
- Laadukas kuvavienti ja esikatselun laatutasot eri laitteille.
- Mallinnuksen osavärit toimivat lähtötietona. Renderöintiasetukset eivät
  muuta tarkkaa geometriaa, mittoja tai mallinnustyökalujen toimintaa.
- Materiaalit, valot ja näkymät tallennetaan projektiin; renderöintiä ei
  käynnistetä automaattisesti esimerkiksi osan lukitsemisesta.

| Vaihe | Tila                 | Sisältö                                                                                                                         |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Perusta varmennettu  | CAD-worker, pursotus/leikkaus/pyöristys, BRep-serialisointi, pintaviite, ortografinen HLR. Fyysinen tabletti vielä testaamatta. |
| 1     | Työnkulku toteutettu | Suorakulmio → push/pull → valinta/siirto ja tartunnat → etukuva ja mitta → projektitiedosto/SVG, tallennus, historia, kosketus. |
| 2     | Osin toteutettu      | Ryhmät, nimet, näkyvyys ja lukitus tehty. Layerit, hierarkia ja linkitetyt komponentit myöhemmin.                               |
| 3     | Osin toteutettu      | Pintaan piirtäminen, leikkaukset, booleanit, viisteet, pyöristykset, offset, muut piirtotyökalut ja mesh-muokkaus.              |
| 4     | Suunniteltu          | Materiaalit, tekstuurit, pintasijoittelu, lasi ja ympäristöä valaiseva emissio.                                                 |
| 5     | Suunniteltu          | Scenet, esitystyylit, valaistus ja kuvavienti.                                                                                  |
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
