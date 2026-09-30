# .nivo-projektiformaatti v2

UTF-8 JSON, tunniste `format: "nivo"` ja `version: 2`. Kaikki mitat ovat
millimetrejä. Z-akseli on ylöspäin. Renderöintiverkkoa ei tarvita avaamiseen.

```json
{
  "format": "nivo",
  "version": 2,
  "id": "project-uuid",
  "name": "Hyllylevy",
  "units": "mm",
  "updatedAt": "2026-09-30T12:00:00.000Z",
  "bodies": [
    {
      "id": "body-uuid",
      "name": "Levy 1",
      "kind": "cad",
      "feature": { "type": "rectangle-extrusion", "width": 600, "depth": 400, "height": 18 },
      "origin": [0, 0, 0],
      "color": "#c3a57e"
    }
  ],
  "guides": [],
  "dimensions": [
    {
      "id": "dimension-uuid",
      "bodyId": "body-uuid",
      "axis": "x",
      "from": "min",
      "to": "max"
    }
  ]
}
```

`origin` on kappaleen pienimmän X/Y/Z-koordinaatin kulma. Leveys kulkee X-,
syvyys Y- ja paksuus Z-suunnassa. Nollapaksuus tarkoittaa tasoluonnosta.
Leveys ja syvyys ovat 0,1–100 000 mm, paksuus 0–100 000 mm. Sijainti on
−100 000…100 000 mm per akseli. UI:n pursotuksen vähimmäispaksuus on 0,1 mm.

V1-tiedosto ja selaimen V1-tallennus muunnetaan avattaessa V2:ksi lisäämällä
tyhjä `guides`-taulukko. Kappaleiden ja mittojen tunnisteet säilyvät.

`polygon-extrusion` sisältää lisäksi paikalliset XY-verteksit `points`.
Rajalaatikon minimi on [0,0], maksimi [width,depth]. Sulkemispistettä ei
toisteta. Muodossa on 3–300 verteksiä, ja itsensä leikkaavat muodot hylätään.

`union` sisältää `operands`-taulukon: jokaisessa on suorakulmio- tai
monikulmioresepti sekä `origin` suhteessa yhdistetyn osan origoon. Sisäkkäiset
yhdistelmät litistetään. CAD laskee unionin uudelleen avattaessa. Osilla pitää
olla paksuus; yhden objektin sisällä sallitaan erilliset solidit.

`guides` sisältää enintään 1000 viivaa. Viivalla on `id`, `mode` (`guide` tai
`free`), `plane` (`XY`, `XZ` tai `YZ`), `angle` asteina, `length` millimetreinä
ja `anchor`. Ankkuri on vapaa `{point:[x,y,z]}` tai
`{bodyId,key,local:[x,y,z]}`. `corner:n` viittaa laatikon semanttiseen kulmaan,
`polygon:n:bottom/top` monikulmion verteksiin ja `vertex:x,y,z` yhdistetyn osan
paikalliseen CAD-verteksiin. Vapaa mittaviiva voi sisältää myös `endAnchor`-viitteen.

Apuviiva jatkuu tartuntaa varten molempiin suuntiin. Viite seuraa osan siirtoa;
suorakulmion ja monikulmion viite seuraa myös paksuuden muutosta. Yhdistäminen
luo uuden objektin, joten aiemmat lähdeviitteet näytetään rikkoutuneina.
Undo palauttaa ne. Haettu Shift-viite on väliaikainen eikä tallennu projektiin.

Mittaviite on semanttinen. Puuttuvaan kappaleeseen viittaava mitta sallitaan
tuonnissa, jotta virhe voidaan näyttää käyttäjälle ja korjata. UUID:t ovat
yksikäsitteisiä kunkin oliotyypin sisällä.

Tuonti tarkistaa koon (10 Mt), version, tyypit, äärelliset luvut, rajat ja
tunnisteet. Enintään 1000 kappaletta ja 3000 mittaa. CAD rakennetaan ja
validoidaan ennen nykyisen projektin vaihtamista. Virheellinen tuonti ei
tyhjennä olemassa olevaa työtä.

IndexedDB käyttää samaa JSON-muotoa: tietokanta `nivo`, object store `projects`,
aktiivinen avain `active`. Jokainen onnistunut muutos tallennetaan
transaktiona. Undo/redo on istuntokohtainen, enintään 100 askelta.

Layerit, hierarkia, komponentit, materiaalit, tekstuurit, scenet, piirustusarkit
ja vapaan mallinnuksen BRep/operaatiohistoria lisätään myöhemmissä versioissa
migraatioineen. Tekstuurit pakataan projektin mukaan, ei blob-URL:eina.
