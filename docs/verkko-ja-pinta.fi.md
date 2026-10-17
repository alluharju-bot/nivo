# Verkko ja pinta

Valitse yksi osa ja avaa **Verkko ja pinta** näkymän yläreunasta tai oikeasta
ominaisuuspaneelista. Työ tehdään erillisessä työversiossa. Alkuperäinen tarkka
CAD-osa säilyy, kun työversio hyväksytään projektiin uutena verkkokappaleena.

## Silmukan lisääminen ja muokkaus

1. Avaa **Muotoile**, valitse leikkaussilmukan X/Y/Z-taso ja paikka prosentteina.
2. **Lisää silmukka** jättää uudet reunat oranssiksi valinnaksi. Useita silmukoita
   voi lisätä tasavälein ja valita niitä oikean paneelin listasta.
3. Käytä kahvoja tai anna tarkat arvot: **M** siirtää, **R** kiertää ja **S**
   skaalaa. Skaalauksessa 100 % säilyttää kyseisen akselin ennallaan.
4. Muutos lasketaan valinnan keskipisteen ympäriltä. Se hyväksytään hiiren
   vapautuksesta tai **Hyväksy silmukan muutos** -painikkeesta. Esc peruu
   keskeneräisen kahvavedon. Myös Ctrl/Cmd+Z peruu ensin keskeneräisen vedon;
   seuraava peruminen palauttaa hyväksytyn muutoksen.

Silmukka lisää reunoja kolmioverkkoon. Tämä on tasoleikkaus; se ei vielä seuraa
mielivaltaista quad-reunareittiä. Harvassa verkossa muotoilu seuraa näkyvää
kolmiointia. Tihennys lisää pisteitä muuttamatta alkuperäistä muotoa.

## Muotoilusivellin ja suojaus

**Nosta**, **Paina** ja **Tasoita** käyttävät millimetreinä annettua sädettä
ja voimakkuutta. Shift toimii muotoilun aikana tasoituksena. Vaikutus alkaa
osoitetusta pinnasta, pysyy lähialueen yhdistyvillä kolmioilla ja huomioi
kameran näkyvyyden. Sivellin ei hyppää erilliseen läheiseen seinämään.

**Suojaa** maalaa violetin maskin. Saman siveltimen Shift poistaa suojausta.
**Suojaa valinta** kiinnittää valitun silmukan pisteet; **Poista suojaus**
tyhjentää maskin. Suojaus koskee muotoilua, silmukan muunnoksia ja maalausta.
Se on verkkopisteisiin sidottu: hyvin tarkkaan maskiin tarvitaan riittävän tiheä
verkko. Maski kulkee leikkausten ja tihennyksen mukana; uudet rajapisteet
suojataan varovaisesti, jos niiden lähtöreuna oli suojattu.

Pistevähennys vaatii maskin poistamisen. Verkon muodostaminen uudelleen
alkuperäisestä tai perusmuodon vaihtaminen korvaa koko työversion, maskin ja
kartat. Näiden toimintojen muutokset voi perua.

## Eheystarkistus ja peruminen

Geometriamuutoksen hyväksyntä tarkistaa verkon taustalla. Vialliset tai
päällekkäiset pinnat, itseleikkaukset ja epäyhtenäiset reunat pysäyttävät
muutoksen. Avoin mallinnuspinta on sallittu, mutta suljettua kappaletta ei
vahingossa avata. Laskennan voi perua; hylätty esikatselu palautuu edelliseen
hyväksyttyyn työversioon.

Tarkistukset eivät korjaa mielivaltaista rikkinäistä tuontimallia eivätkä korvaa
volumetrista remesh-toimintoa. Vaikea törmäystarkistus voi saavuttaa työmäärä-
tai aikarajan; tällöin muutosta ei hyväksytä tarkistamatta.

## Keskeneräisen työn palautus

Hyväksytyt muutokset varmistetaan selaimen paikalliseen IndexedDB-tallennukseen
lyhyen viiveen jälkeen. Alareunan ilmoitus kertoo, kun varmistus on valmis.
Tarkistamaton esikatselu tai kesken oleva siveltimenveto ei korvaa varmistusta.
Nimi, muoto, pintakartat, maski ja silmukkavalinta palautuvat yhdessä.

Avaa sivun uudelleenlatauksen jälkeen sama projekti ja sama osa sekä
**Verkko ja pinta**. Valitse **Palauta työversio**. Sulkemisen yhteydessä
**Jätä keskeneräiseksi** tallentaa työversion ja sulkee näkymän. **Hylkää
työversio** poistaa sen; projektiin hyväksyminen poistaa tarpeettoman palautuskopion.

Palautus on selain- ja laitekohtainen. Se ei ole keskeneräisen työn pilvisynkronointi.
Selaimen tietojen poistaminen poistaa myös palautuskopiot. Jos lähdeosan
geometria, sijainti tai materiaalit ovat muuttuneet toisessa muokkauksessa,
automaattinen palautus estetään. Sulkeminen säilyttää ristiriitaisen kopion.
Paikallinen perumishistoria alkaa palautuksen jälkeen uudelleen; alkuperäinen
projektin osa säilyy edelleen. Tallennustilan virhe näytetään alareunassa.

## Testimallit

Avaa [Verkko ja pinta — kovennustestit](../tests/fixtures/verkko-ja-pinta-kovennus.nivo)
tavallisena Nivo-projektina. Se sisältää:

- **Ohut rengas:** 0,8 mm seinämä; kokeile sivellintä ja sisä-/ulkopinnan erottumista.
- **Syvennys:** pyöristetty aukon suu ja pohja; UV-saumat, syvät pinnat ja AO.
- **Peilattu kaareva muoto:** normaalit ja peilauksen tangenttisuunnat.
- **Kuusi materiaalia:** eri pintavärit, karheudet ja metallisuudet.

Automaattiset selaintestit luovat näille 256 px UV-kartat, laskevat pintakartat,
tallentavat työversion ja tarkistavat alkuperäisen osan säilymisen. Ohuen seinämän
testissä käytetään 0,2 mm hakumatkaa, jotta vastakkainen seinämä ei kuulu samaan
hakuväliin. Nämä ovat toiminta- ja regressiotestejä, eivät lupaus kaikenkokoisten
mallien virheettömästä bakesta tai mittaus suurten mallien suorituskyvystä.
