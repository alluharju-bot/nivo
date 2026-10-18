# Pivotit ja animaatiot

Nivo 0.51.0: **Animaatio** avaa mekanismien määrityksen samaan mallinäkymään.
Mallinnettu asento on **Suljettu**. Esikatselussa osat liikkuvat, mutta
CAD-geometria, aihiomitat ja linkitettyjen osien geometria säilyvät.

## Oven tai kannen sarana

1. Valitse halutessasi ensin ankkuriosa ja sitten liikkuvat osat.
2. Avaa **Animaatio → Sarana**. Anna pivotille kuvaava nimi, esimerkiksi
   `Kaappi 01 / vasen ovi`.
3. Tarkista **Ankkuri** ja **Liikkuvat osat**. Osat voi poimia näkymästä,
   valita luettelosta tai lisätä nykyisestä monivalinnasta. Liikkuvaa osaa
   uudelleen napsauttamalla poistat sen liikkeestä.
4. Valitse **Poimi pivot / reuna**. Napsauta saranapistettä tai suoraa
   reunaa. Reuna antaa myös kiertosuunnan. **Poimi akseli** määrittää suunnan
   erikseen reunalla tai toisella pisteellä. X/Y/Z ja tarkat pivotin
   koordinaatit ovat käytettävissä. Pisteet poimitaan kolmiulotteisesti,
   ilman piirron tasoon projisointia.
5. Määritä **Auki · kulma**, esimerkiksi 90°. Negatiivinen kulma tai
   **Vaihda suunta** vaihtaa avautumissuunnan. Aseta kesto ja ajoitus.
6. **Tallenna pivot**. Kokeile **Auki**, **Suljettu** tai asentosäädintä.

Pivot näkyy nimettynä akselimerkkinä. Ankkuri korostuu sinisenä ja liikkuvat
osat valinnan vihreällä. Aktiivisen pivotin merkki on violetti.

## Laatikot ja useat liikkeet

**Liuku** toimii samalla tavalla. Aseta liukusuunta ja avautumismatka
millimetreinä. Laatikon pohja, sivut, etulevy ja kahva voivat olla saman
liikkeen liikkuvia osia. Kukin kuudesta laatikosta saa oman pivotin ja
oman Avaa/Sulje-painikkeensa. Muiden laatikoiden asennot säilyvät.

Liikkeen voi kääntää kesken avaamisen. Asentosäädin siirtyy suoraan
haluttuun välitilaan. **Palauta kaikki suljetuiksi**, Esc tai paluu
mallinnustyökaluun palauttaa lähtöasennon. Esikatseluasentoa ei tallenneta
projektin geometriaksi eikä animaation jokainen kuva lisää kumoamishistoriaa.

Liikkuva osa voi olla toisen pivotin ankkuri. Esimerkiksi kaapin ovi voi
kantaa erikseen avattavaa luukkua. Yksi osa voi kuulua vain yhden pivotin
liikkuviin osiin, ja kiertävät ankkuriketjut estetään. Ryhmät ja kokoonpanot
säilyvät entisellään; niiden osat lisätään liikkeeseen tavallisena valintana.

## Tallennus ja muokkaus

- Pivotin nimi ja pysyvä UUID, ankkuri, osat, akseli, kulma/matka, kesto ja
  ajoitus tallentuvat `.nivo`-projektiin ja tavalliseen pilvisynkronointiin.
- Pivotin tallennus ja poistaminen ovat kumottavia. Pivotin poistaminen
  jättää osat paikoilleen.
- Kokonaisen mekanismin kopiointi kopioi myös pivotit uusilla tunnisteilla.
  Yksittäisen oven kopio ei automaattisesti liity alkuperäiseen saranaan.
- Ankkurin poistaminen poistaa sen pivotin; liikkuvan osan poistaminen
  poistaa vain kyseisen viitteen. Viimeisen liikkuvan osan poistaminen
  poistaa tyhjän pivotin. Kumoaminen palauttaa määrityksen.
- Koko mekanismin siirto ja kierto säilyttävät pivotin kiinnityksen.
  Skaalaus mukauttaa pivotin sijainnin ja suunnan sekä yhdessä skaalattavan
  liu'un matkan. Geometrian muotoilu ei tulkitse automaattisesti uudelleen,
  mihin uuteen reunaan sarana pitäisi siirtää: pivot on poimittu paikallinen
  piste, ei muuttuvan CAD-reunan indeksi.
- Osakirjastoon tallennus ja projektin tuonti säilyttävät mukaan valitun
  kokonaisen mekanismin. Tunnisteet uusitaan tuonnissa viitteineen.

## GLB-vienti ja pelimoottorin tiedot

**Vie 3D-malli → GLB → Pivotit ja avaus-/sulkemisanimaatiot** on oletuksena
käytössä, kun mallissa on liikkeitä. Mukana pitää olla ankkuri ja kaikki
kyseisen liikkeen osat. Valintaa ei täydennetä huomaamatta; puuttuvat osat
tuottavat virheen. Valinnan voi laajentaa tai animaatiot voi jättää pois
vienti-ikkunan valinnalla. Sama tuki on LOD-paketin jokaisessa GLB:ssä.

Vienti käyttää tavallisia glTF-solmuja ja animaatiokanavia. Se ei edellytä
Nivoa ajonaikaiseksi kirjastoksi. Liikkuvat osat ja niiden ankkurit säilyvät
erillisinä solmuina myös GPU-instanssiviennissä. Staattiset kopiot voidaan
edelleen niputtaa. Solmujen semanttiset tiedot ovat glTF:n `extras`-kentissä:

| Kohde           | Kenttä                  | Sisältö                                                                                                                                                             |
| --------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Osa             | `extras.nivoId`         | Nivon pysyvä osan UUID; solmun `name` on käyttäjän antama osan nimi                                                                                                 |
| Pivot-solmu     | `name`                  | `pivot_<pivotin UUID>`                                                                                                                                              |
| Pivot-solmu     | `extras.nivoPivot`      | `version`, `id`, `name`, `kind`, `anchorId`, `movingIds`, `axis`, `closed`, `open`, `amountUnit`, `duration`, `easing`, `openClip`, `closeClip`, `coordinateSystem` |
| Liikkuva osa    | `extras.nivoMotion`     | `pivotId`, `role: "moving"`, `id`, `name`                                                                                                                           |
| Ankkuriosa      | `extras.nivoAnchorFor`  | Pivot-tunnisteiden lista                                                                                                                                            |
| Nivo-juurisolmu | `extras.nivoMechanisms` | `version: 1`, `restState: "closed"`, pivot-tunnisteiden lista                                                                                                       |

Liikkuvat osat ovat pivot-solmun lapsia. Jos ankkuri kuuluu toisen pivotin
liikkeeseen, pivot-solmut muodostavat vastaavan hierarkian. Ankkuri ei ole
saman pivotin liikkuva lapsi. Osien geometriat säilyvät erillisinä.

Animaatioiden nimet ovat `<nimi>__<UUID>__open` ja `<nimi>__<UUID>__close`.
Avaus kulkee suljetusta avoimeen, sulkeminen avoimesta suljettuun.
Kohdeohjelma valitsee leikkeen, toistaa sen kerran ja säilyttää loppuasennon.
Sulkeminen alkaa avoimesta asennosta; kesken avautumisen tehtävä suunnanvaihto
kannattaa kohdeohjelmassa toteuttaa saman avausleikkeen aikaa peruuttamalla
tai sen omalla tilakoneella. Nivon esikatselu tekee suunnanvaihdon nykyasennosta.

glTF:n maailmakoordinaatit ovat metrejä ja Y on ylöspäin. Nivon juurisolmu
muuntaa lapsihierarkian millimetreistä ja Z-ylös-koordinaatistosta tähän.
Pivotin `axis` ja liukumatka ovat **Nivo-juuren paikallisia** arvoja;
`amountUnit` on `degrees` tai `millimetres`. Pivot-solmun muunnos ja glTF:n
animaatiokanavat ovat ensisijaisia toistoon. Älä skaalaa niitä uudestaan
tuonnin jälkeen. Mukautettu moottorilogiikka voi käyttää UUID-viitteitä
esimerkiksi avaustoiminnon, käyttöliittymän tai vuorovaikutuksen liittämiseen.

Tavalliset glTF-animaatiot ovat siirrettäviä, mutta eri tuojat käsittelevät
`extras`-tietoja eri tavoin. Kohdeohjelman tulee säilyttää/lukea nämä kentät,
jos se tarvitsee ankkurien ja osien merkitykset. STL ja STEP eivät sisällä
tämän toteutuksen animaatioita. GLB:n tuonti takaisin Nivoon on nykyisin
staattinen geometriatuonti; muokattavan mekanismin siirtoon käytä `.nivo`a.

Tämä on liikkeen esitys. Törmäykset, painovoima, jouset ja lujuuslaskenta
eivät kuulu tähän versioon. Vapaasti nimetyt lisäasennot ja yhteinen aikajana
ovat jatkokehitystä.
