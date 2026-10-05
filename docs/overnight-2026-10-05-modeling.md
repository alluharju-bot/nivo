# Yöpassi 5.–6.10.2026 — viivat ja monimuotoinen mallintaminen

Tavoite: nopeus, selkeys ja yksinkertaisuus. Uudet muodot käyttävät nykyistä
CAD-ydintä, millimetrimittoja, materiaaleja, ryhmiä ja historiaa. Ryhmä on
järjestämisen kansio; kokoonpano on toiminnallinen valinta- ja muokkauskokonaisuus.
Tätä eroa ei muutettu.

## Toteutus 0.20.0

1. **Mittaviivojen siivous piirtäessä.** Samalla 3D-suoralla päällekkäiset
   mittaosuudet yhdistyvät. Takaisin päin piirtäminen ja usean vanhan osuuden
   yhdistäminen toimivat. Sama viiva uudelleen tai vanhan sisälle piirretty osuus
   ei lisää viivaa tai tyhjää kumoamistapahtumaa. Pelkkä yhteinen päätepiste,
   risteäminen tai lähellä kulkeva rinnakkainen viiva ei yhdistä viivoja.
   Jatko alkaa käyttäjän napsauttamasta pisteestä, myös yhdistetyn viivan sisältä.
2. **Valintaruutu poimii viivat.** Vasemmalta oikealle valitaan kokonaan sisällä
   olevat mittaviivat ja apuviivojen viiteosuudet. Oikealta vasemmalle riittää
   osuminen; myös apuviivan pitkä jatke on valittavissa. Shift lisää valintaan.
   Oranssi korostus näkyy viivassa, pisteissä ja mittatekstissä. Osien ja viivojen
   yhteispoisto on yksi kumottava toiminto. Historia säilyttää myös viivavalinnan.
3. **Pallo.** Muodot → Pallo. Napsauta keskipiste, vedä säde tai kirjoita
   halkaisija ja hyväksy. Esikatselu on kolmiulotteinen. Tallennettu kappale on
   oikea sileä CAD-pallo; sitä voi käyttää Cut/Join- ja Knife-toiminnoissa.
4. **Bézier-käyrä.** Muodot → Bézier-käyrä tai Kynä → Bézier. Alku, kaksi
   ohjauspistettä ja loppu tekevät yhden kuutiollisen kaaren. Jatko lisää kolme
   pistettä. Enter tallentaa avoimen käyrän; palaaminen alkupisteeseen sulkee
   tasopinnan. Suljettu pinta voi saada paksuuden, jakaa pinnan tai leikata aukon.
   Käyrä käyttää kynän nykyistä pintavalintaa, tartuntaa, akseleita ja Shift-viitettä.
   Esikatselun ohjausviivat erottuvat itse käyrästä. Tallennus säilyttää analyyttisen
   CAD-käyrän, ei esikatselun murtoviivaa.
5. **Veitsi / Knife · N.** Vedä suora viilto tai napsauta alku ja loppu.
   Taitettu reitti hyväksytään Enterillä; alkupiste sulkee siluetin. Bézier-viilto
   käyttää neljää ohjauspistettä ja muodostaa sileän CAD-leikkauspinnan.
   Vapaa viilto seuraa painike pohjassa piirrettyä reittiä. Leikkaus seuraa
   nykyistä kameraa myös perspektiivissä ja kulkee osien läpi. Molemmat puolet
   säilyvät erillisinä osina. Valinta rajaa kohteet; ilman valintaa kohteina
   ovat näkyvät, muokattavat tilavuuskappaleet. Hold, piilotus ja muokkauskonteksti
   rajataan ennen laskentaa. Palojen ryhmä, väri ja materiaali säilyvät.
   Paloista tulee uniikkeja; muut linkitetyt esiintymät eivät muutu.
6. **Pehmennä reunat.** Osan oikean napin valikosta avataan kaikkien reunojen
   pyöristys, säädetään säde millimetreinä ja hyväksytään esikatselu. Toiminto
   käyttää olemassa olevaa palautettavaa reunakäsittelyä ja kohtaavien kulmien
   yhteislaskentaa. Se muuttaa geometriaa; se ei ole pelkkä varjostusasetus.
7. **Viitteet ja jatkuvuus.** Veitsi siirtää säilyvän kulma- tai reunaviitteen
   oikeaan palaan. Alkuperäisen osan kokonaismitta kattaa edelleen kaikki palat.
   Kamera- tai näkymämuutos peruu keskeneräisen veitsireitin. Esc keskeyttää
   myös käynnissä olevan leikkauslaskennan säilyttäen edellisen mallin. Oikean napin
   toimintovalikko pysyy ruudulla ja vierittyy tarvittaessa.
8. **Tallennuksen tilanne.** Käynnissä olevan geometriamuutoksen aikana yläpalkki
   näyttää laskennan. Vanhan mallin Tallessa-teksti ei enää anna ymmärtää,
   että vasta aloitettu Palauta-toiminto olisi jo laskettu ja tallennettu.

## Auditissa tarkistetut periaatteet

- Geometrian tarkka tartunta ohittaa vapaan asettelun ruudukon. Mittaviivojen
  yhdistämisen toleranssi on fyysinen 0,00001 mm, ei 10 mm ruudukko tai zoom.
- Muodon piirtäminen ei valitse tai muokkaa vahingossa naapuriosaa. Bézier
  käyttää samaa kynän toteutusta; erillinen piirros voidaan liittää Jaa pinta
  -toiminnolla. Suljetun komponentin muokkaussuoja säilyy.
- Veitsi ei hävitä leikattua materiaalia. Tuloksen CAD-validiteetti ja
  tilavuuden säilyminen tarkistetaan ennen projektin muutosta. Epäonnistunut
  tai kappaletta halkaisematon reitti ei lisää kumoamistapahtumaa.
- Suoran veitsen etäinen osa hylätään ensin rajaavan laatikon perusteella.
  296 sivussa olevaa osaa ei rakenneta uudelleen tarkassa CAD-laskennassa.
- Ohjauspisteitä, leikkauspintoja ja väliaikaisia kappaleita ei jätetä pysyviksi
  apuobjekteiksi malliin. Yksi hyväksytty toiminto muodostaa yhden historiakohdan.

## Rajat ja seuraavat järkevät työkalut

- Bézier-ohjauspisteiden uudelleenavaaminen valmiista käyrästä sekä tangenttien
  jatkuvuuden ohjain ovat seuraava käyrien kehitysaskel. Nyt pisteitä voi perua
  Backspacella luonnoksen aikana; valmis käyrä tallentuu CAD-geometriaksi.
- Veitsi käsittelee tässä versiossa tilavuuskappaleita. Suorat ja Bézier-viillot
  ovat tarkkaa CAD-geometriaa. Vapaa viilto on enintään 128 suoran osuuden reitti;
  osoitinnäytteitä yksinkertaistetaan enintään 0,75 näyttöpikselin poikkeamalla.
  Liian yksityiskohtainen reitti hylätään selityksellä, ei katkaista hiljaa.
- Pehmentäminen tarkoittaa säteellä määritettyä reunapyöristystä. Orgaaninen
  subdivision- tai sculpt-muokkaus vaatii oman verkkomallin työnkulun; sitä ei
  lisätty mittatarkan CAD-kappaleen päälle huomaamattomaksi muunnokseksi.
- Seuraavaksi käyrään perustuva **profiilin pyyhkäisy (sweep)** palvelisi listoja,
  putkia ja kaiteita. **Pyörähdys (revolve)** sopisi kahvoihin ja pyöreisiin osiin.
  **Loft** sopisi poikkileikkaukseltaan muuttuviin osiin. Näiden käyttöliittymiin
  tarvitaan sama pieni profiili → reitti/akseli → esikatselu → hyväksyntä -malli.
- Fyysinen iPad/Safari, hyvin mutkikkaat itsensä leikkaavat veitsireitit sekä
  erittäin suuret leikkausjoukot tarvitsevat jatkotestausta. Tablettiprofiili
  selaintesteissä on Chromiumin kosketusemulointi.

Validointitulokset ja julkaisu kirjataan [validointiraporttiin](validation.md).
