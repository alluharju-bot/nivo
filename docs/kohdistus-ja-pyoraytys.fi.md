# Kohdistus ja pyöräytys · v0.53.0

## Kohdista

1. Valitse siirrettävä osa tai useita osia.
2. Avaa **Kohdista…** oikeasta paneelista tai oikean painikkeen valikosta.
   Toiminto löytyy myös komentohausta sanoilla _kohdista_ ja _keskitä_.
3. Osoita vertailuosaa näkymässä tai valitse se pudotusvalikosta.
4. Valitse X, Y ja/tai Z. Valitse kullekin akselille siirrettävän valinnan
   ja vertailuosan kohta: alku-/alareuna, keskipiste tai loppu-/yläreuna.
5. Tarkista esikatselu ja hyväksy. Esc peruu esikatselun.

Oletus keskittää X- ja Y-suunnassa muuttamatta korkeutta. Esimerkiksi kannen
asettelu laatikon päälle: X/Y keskikohtiin, Z kannen alareunasta laatikon
yläreunaan. Keskitys tarkoittaa ulkomittojen keskikohtaa, ei massakeskipistettä.

**Vertailuosan omat akselit** käyttää osan tallennettua orientaatiota.
Kierrettyjen kappaleiden mitat lasketaan siinä koordinaatistossa todellisesta
geometriasta. Kokonaisen valinnan ulkomitat kohdistetaan yhtenä kokonaisuutena;
valinnan sisäiset etäisyydet, kierrot ja geometriat säilyvät. Pois kytketyn
akselin koordinaatti ei muutu valitussa akselistossa. Esikatselun numerot
näyttävät toteutuvan siirtymän maailman X/Y/Z-suunnissa.

Vertailuosa pysyy paikallaan ja voi olla lukittu. Siirrettävien osien tai
niiden ryhmien Hold täytyy vapauttaa. Koko kohdistus on yksi Undo-toiminto.
Toiminto muuttaa mallinnusasentoa; animaation avaimia muokataan aikajanalla.

## Pyöräytä

1. Piirrä kappaleen sivuprofiili kynällä, Bézier-käyrällä tai muototyökalulla.
   Sulje profiili umpiosaa varten tai jätä käyrä avoimeksi pintaa varten.
2. Valitse **Muodot → Pyöräytä** ja lähtöprofiili.
3. Valitse akseli X/Y/Z ja sen läpi kulkeva piste. **Poimi akselin piste**
   käyttää mallin tartuntapisteitä. **Poimi suora reuna** asettaa sekä pisteen
   että suunnan. Akselin pisteen ja suunnan voi myös kirjoittaa numeroina.
4. Anna kulma: 360° tekee täyden kierroksen, pienempi kulma osittaisen ja
   negatiivinen kulma vastakkaissuuntaisen pyöräytyksen. Magenta viiva näyttää
   akselin. Hyväksy valmis esikatselu.

Esimerkiksi pystysuora suljettu sivuprofiili Z-akselin vieressä tekee
astian, holkin tai sorvatun osan. Avoin Bézier-sivuprofiili tekee kaarevan
kuoren ilman seinämäpaksuutta. Ympyrä erillisen akselin vieressä tekee toruksen.
Suljettu profiili voi sisältää sekä suoria että kaarevia reunoja, kun ne
muodostavat yhden yhtenäisen profiilin.

Lähtöprofiili jää malliin. Sen voi piilottaa hyväksymisen yhteydessä. Pyöräytys
käyttää CAD-pintoja ja kaaria; renderöintiä varten muodostettava kolmioverkko
ei korvaa alkuperäistä CAD-geometriaa.

### Muokkaaminen myöhemmin

Valitse syntynyt osa ja **Muokkaa pyöräytystä**. Kulmaa ja akselia voi muuttaa
myös projektin uudelleen avaamisen jälkeen. Lähtöprofiili tallentuu tuloksen
sisään, joten erillisen alkuperäisen profiilin poistaminen ei estä tätä.

Muodon muuttamiseen muokkaa alkuperäistä profiilia tavallisilla työkaluilla
ja valitse päivitetty profiili Pyöräytä-paneelin listasta. Vaihtoehtoisesti
**Palauta profiili muokattavaksi** luo tallennetusta profiilista erillisen
kopion ja valitsee sen muokattavaksi. Bézier-profiilin ohjauspisteet säilyvät.
Lähtöprofiili ja pyörähdyskappale eivät ole automaattisesti päivittyvä pari:
muutokset hyväksytään Pyöräytä-paneelista.

Osan tunniste ja ryhmä säilyvät päivityksessä. Linkitettyjen komponenttien
muutokset kulkevat Nivon nykyisen linkitysjärjestelmän kautta. Kopiointi,
siirto, kierto ja tasainen skaala säilyttävät pyöräytyksen lähtötiedot.

### Nykyiset rajat

- Lähtö on yksi tasopinta tai yhtenäinen viiva. Irralliset osat pitää ensin
  yhdistää profiiliksi. Valmis umpiosa ei ole profiili.
- Kulman itseisarvo on 0,01–360°. Kelvoton tai itsensä leikkaava umpimalli
  hylätään muuttamatta projektia.
- Avoimen profiilin tulos on pinta, jolla ei ole automaattista paksuutta.
- Pyöräytysasetukset eivät ole täysi parametrinen operaatiohistoria.
  Myöhempi leikkaus, pursotus, pyöristys tai epätasainen skaala voi muuttaa
  osan tavalliseksi muokattavaksi geometriaksi ja poistaa pyöräytysasetukset.
  Näin vanhan profiilin uudelleenlaskenta ei vahingossa hävitä myöhempiä
  työstöjä. Alkuperäinen lähtöprofiili säilyy erillisenä, jos sitä ei poisteta.
