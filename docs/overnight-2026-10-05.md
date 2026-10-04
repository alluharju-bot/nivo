# Yöpassi 5.10.2026 — mallista luotettavaksi työkuvaksi

Versio 0.17.0. Valittu kokonaisuus perustuu backlogin seuraavaan
Luo mittakuvat -vaiheeseen sekä auditin toistettuun kokonaismittavirheeseen.
Ensiksi viimeisteltiin käyttäjän raportoimat pintapiirroksen ja leikkauksen
ongelmat. Ryhmän, kokoonpanon ja linkitetyn komponentin merkitykset säilyvät.

## Kokeile aamulla

1. Piirrä osan pinnalle ympyrä, suorakulmio tai kynäviiva. Hyväksy piirros.
   Valitse se ja paina **Jaa pinta**. E muokkaa syntynyttä aluetta; suljetusta
   muodosta voi tehdä myös suoraan **Leikkaa aukko**. Muokkaustilaa ei tarvitse
   avata ensin. Usean tukiosan ja linkityksen vaikutus näytetään ennen jakoa.
2. Avaa **Mittakuva**, valitse ryhmä ja **Lisää kokonaismitat**. Siirrä osia
   ristiin ja katso mittoja uudelleen: ne seuraavat ryhmän ulkorajoja.
3. Valitse **Luo mitta-arkki**. Etu-, sivu- ja yläkuva ovat oletuksena mukana.
   Valitse halutessasi tallennettu poikkileikkaus, nimeä arkki ja paina
   **Tallenna arkki**. **Vie PDF** ja **Vie SVG** käyttävät samaa mittakaavaa.
   Tulosta 100 % koossa. Arkin asetusten muutokset tallennetaan tällä painikkeella;
   tallennetun arkin kuvat ja mitat päivittyvät mallin mukana.
4. Luo **Muodot → Levyrunko**. Se syntyy kokoonpanoksi. Mallissa yksi napsautus
   valitsee kokonaisuuden; **Muokkaa osia** avaa sen. Valitse-tilassa osan nimirivin painaminen
   listassa avaa sen kokoonpanon ja valitsee juuri kyseisen osan.
5. Valitse linkitetty kopio. Näkyvissä on linkitettyjen osien määrä ja
   **Muokkaa vain tätä · tee uniikki**. Tavalliset komponenttikopiot säilyvät
   linkitettyinä, ellei käyttäjä irrota niitä.

![Neljä näkymää samalla mitta-arkilla](images/nivo-v017-sheet.png)

## Mitä muuttui

**Pintaan piirtäminen.** Kaikki tasomuodot — ympyrä, ellipsi, monikulmio ja
kynäpinta — käyttävät samaa piirto- ja valintaetusijaa. Näyttökorjaus ei siirrä
CAD-geometriaa. Vinon perspektiivin logaritminen syvyyspuskuri huomioidaan,
ja pinnan edessä oleva oikea kappale peittää piirroksen edelleen.

**Kynä ja viitteet.** Kahden pisteen viivan voi päättää Enterillä. Osan
muokkauksessa reunasta reunaan piirretty viiva jakaa pinnan suoraan;
erilliselle viivalle on Jaa pinta. Kynän suuntalukitus, Shift-poiminta ja
kosketuksen Poimi viite käyttävät yhteistä piste-, reuna- ja apuviivatartuntaa.

**Leikkaushistoria.** Historiassa Palaa leikkaukseen palauttaa mallin ennen
leikkausta ja avaa piirroksen, kohteet sekä säilytysvalinnan. Peruttu
esikatselu on jatkettavissa. Palauta valinta on edelleen pelkkä valinnan
palautus. Geometria säilyy rajatussa kumoamishistoriassa; lokiin ei lisätä
rajatonta CAD-snapshotien kopiota.

**Kokonaismitat.** Uusi mittatyyppi viittaa osajoukkoon tai ryhmään, ei
luontihetken kahteen äärikulmaan. Ryhmä seuraa myös alaryhmien jäsenyyttä.
Osajoukko säilyttää nimetyt osansa. Osien järjestyksen vaihtuminen, kierto,
ryhmän kopiointi, Peru/Palauta ja uudelleenavaus säilyttävät mitan tarkoituksen.
Puuttuva viite ilmoitetaan ja virheellisen työkuvan vienti estetään.

**Mitta-arkit.** Yhdelle A4-vaaka-arkille saa 1–6 näkymää yhteisellä automaattisella
tai valitulla mittakaavalla. Projektiin voi tallentaa 50 nimettyä arkkia.
Kohde voi olla näkyvä malli, nimetty ryhmä tai talteen otettu osavalinta.
Osavalinta ei muutu seuraavan mallin valinnan mukana. Arkki käyttää samoja
mittoja ja CAD-projektioita kuin yksittäiset kuvat. Liian suuri sisältö,
puuttuva kohde tai rikkoutunut viite estää viennin.

**Muokkauskonteksti.** Ryhmällä on kansiokuvake, kokoonpanolla eri kuvake.
Kokoonpanon avaaminen, hierarkiapolku ja poistuminen näkyvät. Myös yksittäisen
osan muokkauksessa näkyy sen ryhmäpolku. Linkityksen vaikutus näkyy valinnassa
sekä pintojen ja reunojen muokkaustyökaluissa. Kansion valinta listasta toimii
edelleen koko sisällölle, ja ryhmiä voi siirtää, piilottaa ja kiinnittää.

## Yhteensopivuus ja rajaukset

- Projektiformaatti on v8. V1–V7 ja niiden tallennettu kumoamishistoria avautuvat
  migraation kautta. Vanha v7-ohjelmaversio ei lue uusia v8-tiedostoja.
- Vanhaa pistemittaa ei muuteta automaattisesti kokonaismitaksi: sen alkuperäistä
  tarkoitusta ei voi turvallisesti päätellä. Luo haluttu kokonaismitta uudelleen.
- Vanhaan toimintolokiin ei voida jälkikäteen lisätä puuttuneita leikkaustietoja.
  Palaa leikkaukseen tarvitsee edelleen käytettävissä olevan kumoamistilan.
- Arkkiasettelu on automaattinen ja paperi A4 vaaka. Vapaa taitto, A3,
  monisivuiset piirustuspaketit ja automaattinen osakohtainen mittakuvasarja
  jäävät backlogiin. Mittojen käsin sijoittelu tehdään yksittäisessä mittakuvassa.
- Kokoonpano ei ole vielä parametrinen kalusteresepti: levypaksuuksien,
  tolppajaon ja kalusteen kokonaiskoon sääntöohjattu muuttaminen on erillinen vaihe.
- Selaimen kosketusemulointi ei korvaa fyysisen iPadin ja Safarin testausta.

Mallilistan avauskahva pysyy paikallaan myös paneelin liukuessa näkyviin.
Osoittimella avaaminen ei enää siirrä painalluksen kohdetta mallinnusalueelle.
Kosketuksen nosto ei yksin piilota listaa; mallintamisen aloitus tai
piilotuspainike sulkee sen edelleen. Kosketusnäytöllä lista avautuu heti
paikalleen, jotta rivi ei vaihda painalluksen kohdetta kesken kosketuksen.

## Varmennuksen tulos

- **199 yksikkö-/CAD-testiä hyväksytty**, TypeScript ja tuotantobuild hyväksytty.
- Laajassa tuotannon selainajossa 95 hyväksyttyä, kaksi tarkoituksellista
  ohitusta ja kolme virhettä. Kaksi testin välilehtikohdistusta ja yksi
  todellinen kosketusvirhe korjattiin; kaikki kolme läpäisivät jatkoajot.
  Viimeisen listakorjauksen kohdennettu ajo: 11 hyväksyttyä ja yksi ohitus,
  lisäksi alkuperäinen kosketustapaus läpäisi kolme peräkkäistä toistoa.
- **1 184 osan siirto noin 60 kuvaa/s**, myös kolmen kokonaismitan kanssa.
  Kopiointi 2 368 osaan 390–419 ms. Valinta ei rakenna uutta GPU-geometriaa.
- Mitta-arkin ja kosketusnäkymän asettelut tarkistettiin kuvista.

Versio on paikallisessa repossa; tämän passin muutoksia ei julkaistu
GitHub Pagesiin. Paikallinen kehityspalvelin on osoitteessa
<http://127.0.0.1:5173/>. Vanhoista projektitiedostoista kannattaa säilyttää
alkuperäiset: uuden v8-tiedoston avaaminen edellyttää tätä ohjelmaversiota.

Toistettavat testitulokset: [validointi](validation.md).
Suuren mallin mittaukset: [suorituskyky](performance.md).
