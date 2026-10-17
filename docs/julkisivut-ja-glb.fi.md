# Julkisivut ja kevyt 3D-vienti

## Materiaalit

Valitse osa ja sen **Materiaali**-osiosta **Julkisivut**: julkisivubetoni,
hieno rappaus tai karkea rappaus. Sävy ja kiilto toimivat kuten muissakin
materiaaleissa. Maalipensselillä saman materiaalin voi jakaa useille osille.

**Pinnan rakenne · PBR** sisältää sävyvaihtelun, valumajälkien voimakkuuden,
pintarakenteen koon ja kuvion siemenen. Tekstuurin tavallinen koko tarkoittaa
laajan värikuvion kokoa: oletus on 12 × 12 metriä. Pieni pintarakenne toistuu
erikseen 200 mm:n alueena. Saman siemenen ja asetusten tulos on aina sama.
Kohokuvion syvyys annetaan millimetreinä. Työkalut eivät muuta geometriaa.

Vanhojen betoni-, kipsi- ja tasoitemateriaalien **Laaja pintakuvio** on
valinnainen. Vanhat tallenteet säilyttävät aikaisemman ulkonäön. Näiden
pintojen värikartta ei tarvitse verkosta ladattavaa kuvaa.

Kartat lasketaan yhteiseksi PBR-aineistoksi: värikartta ja karheus 1024²,
normal 512². Tämä pitää esikatselun, tarkentuvan renderin ja viennin samalla
materiaalipolulla. Samat asetukset jakavat kuvalähteet; jokaiselle kopiolle ei
luoda uutta kuvaa. RGBA8-kuvien perusaineisto on noin 9 MiB, mip-ketjuineen
noin 12 MiB per erilainen kuviosarja; renderöinnin atlas ja välipuskurit
kuluttavat lisäksi muistia. PNG-tiedoston koko ei ole GPU-muistin käyttö.

Kuvio on saumaton mutta toistuu edelleen asetetun suuren alueen välein.
Valumajäljet ovat tekstuurin pystysuuntaista kuviointia, eivät ikkunoista tai
rakennuksen muodosta laskettua likaa. Värikuvion skaalaaminen ei suurenna
pientä normal-rakennetta. Tavalliset omat PBR-kuvat ohittavat automaattiset
kanavat. GLB:stä tuotu itsenäinen kanavasijoittelu säilyy omanaan.

## GLB ja LOD

**Vie 3D-malli → GLB** jakaa identtiset paikalliset geometriat ja materiaalit
automaattisesti. Osat säilyvät nimettyinä erillisinä solmuina. Tiedoston
geometrian jakaminen ei yksin lupaa yhtä piirtokutsua kohdeohjelmassa.

**GPU-instanssit toistuville osille** kokoaa saman geometrian ja materiaalin
osat instanssieriksi. Kohdeohjelma tarvitsee `EXT_mesh_gpu_instancing`-tuen.
Osien nimet ja tunnisteet tallennetaan erän `extras.nivoInstances`-listaan.
Nivo osaa avata instanssit takaisin erillisiksi osiksi. Tämä ei palauta
alkuperäistä CAD-geometriaa eikä Nivon komponenttilinkityksiä; säilytä .nivo.

**Etäisyysversiot · LOD-paketti** tuottaa ZIPin:

| Tiedosto | Kolmiomäärän tavoite | Suurin suhteellinen geometriavirhe | Tekstuurin enimmäissivu |
| -------- | -------------------- | ---------------------------------- | ----------------------- |
| LOD0.glb | Alkuperäinen         | 0                                  | 2048 px                 |
| LOD1.glb | 50 %                 | 0,1 % osan koosta                  | 1024 px                 |
| LOD2.glb | 20 %                 | 0,5 % osan koosta                  | 512 px                  |

Kevennys säilyttää materiaali-, UV- ja avoimet rajat. Tavoiteprosentti ei
pakota algoritmia rikkomaan niitä: valmiiksi kevyt rakennus voi säilyttää
kaikki kolmionsa. Kaikki versiot käyttävät samaa sijaintia ja kokoa.
`manifest.json` kertoo toteutuneet määrät, materiaalit, geometriat ja tavut.
Piirtokutsujen määrä on mallin materiaalierien määrä, ilman varjopasseja.

Valitse kohdeohjelmassa tilanteeseen sopiva LOD ja vaihtumisetäisyydet.
Älä näytä versioita päällekkäin. ZIP ei kytke LOD-vaihtoa automaattisesti päälle.
Viennin yksikkö on metri ja ylösakseli Y. Kevennys tehdään workerissa ja
alkuperäinen projekti säilyy koskemattomana. KTX2-pakkaus, automaattinen
kaupunginosien lohkominen ja rakennuksen muotoa seuraava lika ovat jatkokehitystä.

## Geometriamuokkauksen pyöreä reuna ja push/pull

**Reunat**-valinnassa tasaisesti kaartuva suljettu reunasilmukka korostuu ja
valitaan yhtenä kokonaisuutena. Suora särmä tai teräväkulmainen monikulmio
valitaan edelleen särmä kerrallaan. Kaikki verkkoreunat näyttävä asetus
mahdollistaa yksittäisten kolmioverkon reunojen valinnan.

Kaarevan CAD-osan pistemuokkaus tekee edelleen erillisen verkkokopion ja
piilottaa alkuperäisen. Suljetun verkkokopion tasainen pääty tunnistetaan
skaalauksen jälkeen push/pull-pinnaksi. Siirto kuljettaa yhteiset reunapisteet
ja viereiset seinät mukana, säilyttää materiaaliryhmät ja UV-saumat sekä
hylkää kuoren kääntymisen ja itseleikkaukset. Esimerkiksi laajennetun
sylinteripäädyn voi nostaa tai laskea ja perua muutoksen normaalisti.

Tämä on suljetun verkon tasopinnan siirto, ei verkkoon tehtävä boolean-reikä
tai uuden seinämän pursotus avoimesta verkosta. Muut CAD-työkalut ovat yhä
käytettävissä alkuperäisessä osassa.
