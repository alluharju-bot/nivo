# Kotelotestin korjaukset — 0.28.0

## Puolipyöreät päät nykyisellä pyöristyksellä

Piirrä esimerkiksi 4 × 24 mm suorakulmio ja anna sille paksuus.
Valitse osa, paina **F → Puolipyöreäksi** ja hyväksy esikatselu.
Säteeksi tulee tasan 2 mm. Pyöristysten väliin ei jää pientä suoraa
pätkää eikä käyttäjän sädettä muuteta salaa. Erillistä pitkäreikämuotoa ei ole.

**Muodon nurkat** valitsee pursotussuunnan kulmareunat kerralla. Tavallinen
reunojen poiminta ja säteen syöttäminen toimivat edelleen. Yhden pään voi
pyöristää valitsemalla vain sen kaksi kulmareunaa. Muokattavan reunakäsittelyn
alkuperäiset reunat säilyvät muokattavina myös tallennuksen ja kierron jälkeen.

Pikavalinnat ovat saatavilla tunnistettaville suorakulmio- ja monikulmiopursotuksille.
Nollapaksuisen piirroksen nurkkien muokkaus ei vielä kuulu tähän versioon.
Tarkka puolipyöristys toimii suorille, samansuuntaisille läpimeneville
kulmareunoille tasapoikkileikkauksisessa osassa. Muut pyöristykset käyttävät
edelleen yleistä CAD-pyöristystä; tämä ei ratkaise kaikkia monimutkaisten
kolmi- tai nelireunakulmien rajoitteita. Alkuperäinen osa säilyy, jos laskenta
epäonnistuu. Osassa jo olevia läpireikiä ei täytetä uudelleen.

## Aukkosarja suoraan piirretystä muodosta

1. Piirrä aukon tasomuoto pinnalle ja hyväksy se. Valitse **Leikkaa aukko…**.
2. Anna **Aukkoja yhteensä**, **Aukkojen väli** ja **Suunta**. Väli tarkoittaa
   samaa kohtaa aukosta seuraavan aukon vastaavaan kohtaan, esimerkiksi
   ympyröiden keskipisteiden väliä. Miinusmerkki vaihtaa etenemissuunnan.
3. Valitse leikattavat osat. Leikkaus kulkee oletuksena kaikkien valittujen
   osien läpi. **Annettu syvyys pinnasta sisään** rajaa sen esimerkiksi
   kotelon 3 mm seinämään ja säästää vastakkaisen seinän.
4. Tarkista esikatselu ja hyväksy. Koko sarja on yksi kumottava toiminto.

Suunnat **Pinnan vaakasuunta / pystysuunta** käyttävät pinnan omaa tasoa,
eivät kameran ruutusuuntia. X/Y/Z käyvät, kun valittu akseli on pinnan
suuntainen. Sarjaan voi tehdä 1–100 aukkoa. Eri aukot voivat osua eri osiin,
ja leikattavat osat säilyvät erillisinä. Vain todellisuudessa osuvat kohteet
näkyvät kohdelistassa. Muodon säilyttäminen ja linkitettyjen osien tekeminen
uniikeiksi ovat edelleen valittavissa. Hold suojaa osia.

## Juuri tehdyn Push/Pull-leikkauksen toistaminen

Jaa pintaan aukon muoto ja työnnä se sisään **E**:llä. Valitun osan
**Toista aukko…** avaa saman sarjan ilman erillistä leikkurikappaletta.
**Lisäaukkoja** tarkoittaa uusia aukkoja jo tehdyn lisäksi. Leikkaussyvyys
tulee edellisestä vedosta; myös matalan syvennyksen voi toistaa.

Sarjan hyväksymisen jälkeen toisto jatkaa viimeisestä aukosta samalla
suunnalla ja välillä. Pikatoisto koskee viimeistä leikkausta: muu geometriaa
muuttava toiminto päättää sen. Historiaan tallennetun sarjan asetuksiin voi
palata **Palaa leikkaukseen** -komennolla myös sivun uudelleenlatauksen jälkeen.
Komento palauttaa ensin sarjaa edeltävän mallin; **Palauta valinta** palauttaa
vain valitut osat. Esikatselun peruminen ei muuta geometriaa.

## Pienten reunojen poiminta

Kulmat saavat edelleen etusijaa, mutta tarkasti osoitettu keskipiste tai reuna
voi voittaa kauempana olevan kulman. Näin esimerkiksi 4 mm reunan keskipiste
on poimittavissa. Mitta- ja apuviivojen risteykset säilyvät vahvoina kohteina.
Reunat-työkalussa osoittimen sijainti ratkaisee myös lähekkäisten reunojen
välillä; syvyys ratkaisee käytännössä päällekkäiset vaihtoehdot.

**Cut / Join** löytyy suoraan valitun osan toimintopainikkeista ja valinnan
kontekstivalikosta. Monimutkaiset leikkurikappaleet ja yhdistämiset säilyvät
sen tehtävänä. Yleinen reunojen siirto viereisiä pintoja mukauttaen on
kirjattu [jatkosuunnitelmaan](roadmap.md#suunnitteluehdotus--reunojen-siirto-ja-liittyvien-pintojen-mukautuminen);
se ei vielä sisälly tähän julkaisuun.
