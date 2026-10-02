# .nivo-projektiformaatti v6

UTF-8 JSON, tunniste `format: "nivo"` ja `version: 6`. Kaikki mitat ovat
millimetrejä. Z-akseli on ylöspäin. Renderöintiverkkoa ei tarvita avaamiseen.

```json
{
  "format": "nivo",
  "version": 6,
  "id": "project-uuid",
  "name": "Hyllylevy",
  "units": "mm",
  "updatedAt": "2026-10-01T12:00:00.000Z",
  "settings": {
    "guideXray": false,
    "axisStyle": "subtle",
    "axisLabels": false,
    "dimensionDisplay": "all"
  },
  "groups": [],
  "bodies": [
    {
      "id": "body-uuid",
      "name": "Levy 1",
      "kind": "cad",
      "purpose": "model",
      "locked": false,
      "hidden": false,
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
syvyys Y- ja korkeus Z-suunnassa. Suorakulmiossa ja XY-monikulmiossa
nollakorkeus tarkoittaa tasoluonnosta; leveys ja syvyys ovat 0,1–100 000 mm,
korkeus 0–100 000 mm. Muissa tyypeissä rajalaatikon kukin mitta voi olla nolla.
Sijainti on −100 000…100 000 mm per akseli. Push/pull-siirtymän itseisarvo
on 0,1–100 000 mm, eikä koko kappaleen poistavaa työntöä hyväksytä.

V1-tiedostoon lisätään tyhjä `guides`-taulukko. V2 muunnetaan V3:ksi lisäämällä
`settings: {guideXray:false}`. Migraatiot koskevat myös selaintallennusta,
säilyttävät olemassa olevat tunnisteet eivätkä kirjoita alkuperäistä tiedostoa.
V3 muunnetaan V4:ksi. Puuttuva `purpose` saa arvon `model`.
V4 muunnetaan V5:ksi lisäämällä tyhjä `groups`. Puuttuvat `locked` ja `hidden`
saavat arvon false. Akselityylin oletus on `subtle` ja `axisLabels` on false.
V0.6 lisää valinnaisen `settings.dimensionDisplay`: `all` (oletus), `selected`
tai `hidden`. Se rajaa vain 3D-mittojen näkyvyyttä; mittakuva käyttää yhteisiä
mittaviitteitä. Puuttuva arvo täydentyy avatessa, joten formaattiversio pysyy V5:ssä.
Kappaleen `color` on kuusinumeroinen heksaväri; värinvaihto ei muuta geometriaa.
`axisStyle: "strong"` korostaa akseleita; `axisLabels:true` näyttää nimet.

`groups` sisältää enintään 1000 ryhmää: `id`, `name` ja `hidden` (oletus false).
Kappaleen valinnainen `groupId` viittaa olemassa olevaan ryhmään. Valinnainen `parentId` muodostaa alaryhmän ja `locked` kiinnittää ryhmän. Kiertävä hierarkia hylätään. Näkyvyys vaatii sekä kappaleen että ryhmän olevan näkyvä.
`locked` estää siirron, kierron, Offsetin ja push/pullin. Metatiedot eivät muuta geometriaa.

Kappaleen `purpose` on `model`, `construction`, `drawing` tai `component`.
Construction tarjoaa tartunnat mutta jää pois HLR-mittakuvasta; drawing
projisoidaan pelkkinä reunoina. Component tarkoittaa tässä versiossa nimettyä
itsenäistä osaa. Se ei sisällä komponenttimäärittelyä tai linkitettyjä instansseja.

`profile-extrusion` sisältää `profile`-, `frame`- ja `distance`-kentät sekä
maailman akselien suuntaisen rajalaatikon mitat. `profile.kind` on `rectangle`
(width/depth), `circle` (radius), `ellipse` (radiusX/radiusY) tai `polygon`
(2D-points). Säännöllinen monikulmio tallennetaan polygon-pisteinä.
`frame` sisältää paikallisen origon, `u`-akselin ja `normal`-normaalin.
Ne ovat kohtisuorat yksikkövektorit; v-akseli on normal × u.
`distance` on etumerkillinen pursotuspituus normaalin suunnassa; nolla
muodostaa pinnan. Rajalaatikko tarkistetaan analyyttisesti myös ympyrälle ja
ellipsille. Kaikki käyrät rakentuvat tarkkoina OCCT-käyrinä.

`polygon-extrusion` sisältää lisäksi paikalliset XY-verteksit `points`.
Rajalaatikon minimi on [0,0], maksimi [width,depth]. Sulkemispistettä ei
toisteta. Muodossa on 3–300 verteksiä, ja itsensä leikkaavat muodot hylätään.

`planar-polygon` sisältää paikalliset 3D-verteksit `points` (3–300).
Rajalaatikko alkaa [0,0,0]:sta. Pisteiden on oltava samalla tasolla ja
rajalaatikon mittojen on vastattava pisteitä; itsensä leikkaava muoto hylätään.
Tämä on pinta, vaikka sen Z-korkeus olisi positiivinen.

`brep` sisältää Replicadin serialisoiman paikallisen OCCT-geometrian `data`
(enintään 8 Mt), tilavuuskappaleen lipun `solid` sekä `topologyId`-tunnisteen.
CAD tarkistaa geometrian, rajalaatikon ja solid-tyypin ennen hyväksyntää.
Pinnan jako, Offset, kierto, Cut, Join ja yleinen pintamuokkaus tallentavat tuloksen tähän
muotoon ja uusivat `topologyId`:n. Cut säilyttää kohteiden UUID:t, Join ensimmäisen
kohteen UUID:n. Kokonaan leikatut kohteet poistuvat. Työstökappaleet voidaan
säilyttää. Tiedosto sisältää tulosgeometrian. Reunakäsittely voi lisäksi säilyttää jäljempänä kuvatun lähteen; yleistä operaatiohistoriaa ei vielä ole.
Kappaleen UUID säilyy. Laatikon kuusi pintaa ja XY-pursotuksen pohja/kansi
säilyvät reseptimuotoisina tavallisissa mittamuutoksissa.

`union` sisältää `operands`-taulukon: jokaisessa on suorakulmio-,
monikulmio-, profiili- tai BRep-kappale sekä `origin` suhteessa yhdistetyn osan origoon. Sisäkkäiset
yhdistelmät litistetään. CAD laskee unionin uudelleen avattaessa. Osilla pitää
olla paksuus; yhden objektin sisällä sallitaan erilliset solidit.

`guides` sisältää enintään 1000 viivaa. Viivalla on `id`, `mode` (`guide` tai
`free`), `plane` (`XY`, `XZ` tai `YZ`), `angle` asteina, `length` millimetreinä
ja `anchor`. Valinnainen `direction:[x,y,z]` määrittää viivan suunnan
(normalisoidaan käytössä); muuten käytetään tasoa ja kulmaa. `offset:[x,y,z]`
siirtää viivan alkua ankkurista, esimerkiksi reunasta vedetty etäisyys.
`xray:true` näyttää tämän viivan kappaleiden läpi. Projektin
`settings.guideXray:true` näyttää kaikki apuviivat läpi.

Ankkuri on vapaa `{point:[x,y,z]}`, verteksi `{bodyId,key,local:[x,y,z]}` tai
reuna `{edge:{from:VertexAnchor,to:VertexAnchor,t:0..1}}`.
Reuna-ankkuri interpoloi kahden ratkaistun verteksin välistä.
`corner:n` viittaa laatikon semanttiseen kulmaan,
`polygon:n:bottom/top` monikulmion verteksiin ja `vertex:x,y,z` yhdistetyn osan
paikalliseen CAD-verteksiin. Profiilin avain on `profile:x,y,z`.
Tasomuodon avain on `point:n`; BRep-kappaleen
`brep:topologyId:x,y,z`. Vapaa mittaviiva voi sisältää myös `endAnchor`-viitteen.

Apuviiva jatkuu tartuntaa varten molempiin suuntiin. Viite seuraa osan siirtoa;
suorakulmion ja monikulmion viite seuraa myös paksuuden muutosta. BRep-muokkauksessa
kappaleen valinnainen `vertexRefs` yhdistää säilyneen vanhan ankkuriavaimen
tuloksen paikalliseen CAD-verteksiin. Kierrossa säilyneet ankkurit muunnetaan samalla rotaatiolla. Poistetut verteksit eivät saa vastinetta.
Join siirtää kulutettujen lähteiden säilyneet viitteet ensimmäiseen kohteeseen
avaimella `sourceId:oldKey`. Vanha Yhdistä-pikatoiminto tekee uuden UUID:n,
eikä säilytä lähdeviitteitä. Ilman vastinetta BRep-ankkuri vaatii saman `topologyId`:n.
Valinnainen `linearEdges` sisältää BRep-tuloksen suorat reunat paikallisina
päätepistepareina: reuna-ankkurin interpoloidun pisteen tulee edelleen osua
todelliseen reunaan. Näin reunan keskeltä poistettu kohta ei säily tartuntana.
Rikkoutuneet viitteet näkyvät käyttäjälle; undo palauttaa ne.
Haettu Shift-viite ja kynän suuntalukko ovat väliaikaisia eivätkä tallennu projektiin.

Mittaviite on semanttinen ja yhteinen 3D-näkymälle sekä mittakuvalle.
`bodyId`, `axis` ja `from:min` / `to:max` mittaavat osan maailman X/Y/Z-akselien
suuntaisen rajalaatikon ulkomittaa. Arvo lasketaan kappaleesta, eikä sitä
kopioida mitan sisään; muokkaus, siirto ja kierto säilyttävät viitteen.
Vinon osan reunapituus ei ole sama asia kuin tämä ulkomitta. Puuttuvaan kappaleeseen viittaava mitta sallitaan
tuonnissa, jotta virhe voidaan näyttää käyttäjälle ja korjata. UUID:t ovat
yksikäsitteisiä kunkin oliotyypin sisällä.

Tuonti tarkistaa koon (64 Mt), version, tyypit, äärelliset luvut, rajat ja
tunnisteet. Enintään 1000 kappaletta ja 3000 mittaa. CAD rakennetaan ja
validoidaan ennen nykyisen projektin vaihtamista. Virheellinen tuonti ei
tyhjennä olemassa olevaa työtä.

V5 muunnetaan V6:ksi tietoja muuttamatta. Uudet kentät ovat valinnaisia,
paitsi uusi `kind: points` -dimension muoto. Vanhat ulkomitat ja viisi
`material`-arvoa avautuvat edelleen. `settings.gridStep` on valinnainen
0,1–10 000 mm:n ruudukkoaskel; puuttuva arvo tarkoittaa 10 mm.

## Reunakäsittely

`body.edgeTreatment` sisältää `id`, muuttumattoman `source`-featuren,
`offset`-siirtymän suhteessa body.originiin, `rotation`-kvaternionin [x,y,z,w],
`indices`-lähdereunat, `operation` (fillet/chamfer) ja `size` millimetreinä.
Indeksit viittaavat tallennettuun lähteeseen, eivät vaihtuvaan tulos-BRepiin.
Kierto muuttaa vain lähteen sijoitusta, joten indeksit säilyvät. Muut tarkat
geometriamuutokset poistavat tämän metatiedon ja jatkavat tulosgeometriasta.

## Kahden pisteen mitta

`{id,kind:"points",start:Anchor,end:Anchor,fallback:[Vec3,Vec3],axis,offset,normal}`.
`axis` on distance/x/y/z. `offset` sijoittaa mittaviivan; suuntainen osa
poistetaan laskennassa. `normal` määrittää sijoituksen tason. `fallback`
säilyttää viimeksi ratkaistut päätepisteet rikkoutuneen viitteen näyttämiseksi,
ei korvaa puuttuvaa mitta-arvoa. `reference:<topologiatunniste>:<paikallinen piste>`
on tasopisteen tai kaarevan reunan keskuksen viite. Kierto säilyttää sen
`vertexRefs`-kartassa. Geometriamuutoksessa kadonnut viite merkitään puuttuvaksi.

## Materiaalit ja kuvat

`body.appearance` sisältää `preset`, valinnaisen `assetId`:n ja
roughness/metalness/transmission/clearcoat-ylikirjoitukset 0–1 sekä
`texture:{width,height,offsetX,offsetY,rotation,lockAspect}`.
Kuvion mitat ja siirtymät ovat millimetrejä, kierto asteina.
`body.textureFrame:{offset,rotation}` sitoo kuvioinnin osan omaan
koordinaatistoon; kvaternioni on [x,y,z,w]. Puuttuva kehys on origoon
sidottu identiteettikierto. `color` sävyttää pintaa.

`assets` on tunnisteella indeksoitu kartta: `{name,dataUrl,width,height}`.
Data-URL hyväksyy vain PNG/JPEG/WebP-base64-kuvan. Yhden kuvan kenttä on
korkeintaan 6 Mt ja kuvien yhteiskoko 32 Mt; suurin esikatselusivu on
2048 pikseliä. Tuonti pienentää suuret kuvat WebP-muotoon ja tunnistaa
saman sisällön SHA-256:lla. Puuttuvaan kuvaan viittaava materiaali hylätään.
`materials` sisältää enintään 200 projektin omaa `{id,name,color,appearance}`-
materiaalia. Materiaalit ovat kopioitavia reseptejä, eivät linkitettyjä instansseja.

IndexedDB käyttää samaa JSON-muotoa: tietokanta `nivo`, object store `projects`,
aktiivinen avain `active`. Avain `history` säilyttää lähimmät yhteensä 20
Peru/Palauta-askelta 8 MiB:n budjetissa (muistissa enintään 100). Historian
formaatti 2 kerää kuvat yhteen tauluun; tilat viittaavat niiden tunnisteisiin.
Formaatti 1 ja V5-historian projektit migroidaan. Virheellinen historia ei
estä aktiivisen mallin avaamista. Tallennustilan loppuessa yritetään
vielä tallentaa aktiivinen malli ilman historiaa.

Layerit, linkitetyt komponentit, tallennetut kamerat, useat piirustusarkit
ja yleinen operaatiohistoria jäävät myöhempiin formaattiversioihin.
