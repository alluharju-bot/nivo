# .nivo-projektiformaatti v1

UTF-8 JSON, tunniste `format: "nivo"` ja `version: 1`. Kaikki mitat ovat
millimetrejä. Z-akseli on ylöspäin. Renderöintiverkkoa ei tarvita avaamiseen.

```json
{
  "format": "nivo",
  "version": 1,
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
