# Mechanical Animation v0.1 — arkkitehtuuriauditointi

## Toteutus 0.52.0 — käyttö

**Animaatio** yläpalkissa avaa aikajanan samaan mallinäkymään.

1. Luo klippi. Valitse näkymästä osa tai mallilistasta ryhmä/kokoonpano.
   Oikean paneelin kohdevalinnalla pääsee myös suljetun kokoonpanon yksittäisiin osiin.
2. Poimi tarvittaessa pivot näkymän kulmasta, reunasta tai mittaviivasta.
   Oletuspivot on osan tai ryhmän keskellä. Pivot asetetaan ennen luonnosasennon tekemistä.
3. Lisää avain aikaan 0. Vaihda aikaa ja käytä **M**, **R**, **L** tai oikean
   paneelin paikallisia X/Y/Z-kenttiä. **Lisää / päivitä avain** tai **I** tallentaa asennon.
4. Valitse aikajanan timantti: muokkaa aikaa, seuraavan välin interpolointia
   ja asentoarvoja; kopioi tai poista avain. Asentoarvojen muutos hyväksytään
   Lisää / päivitä avain -painikkeella. Ajoituksen voi muuttaa myös raahaamalla.
5. Toista tai tauota välilyönnillä. Nopeuden negatiiviset vaihtoehdot toistavat
   taaksepäin. Stop palaa aikaan 0; tilan sulkeminen palauttaa mallinnusasennon.
6. **Vie 3D-malli → GLB → Pivotit ja animaatioklipit** vie liikkeet.
   **Klippi ja vienti → Lataa animaatiodata** tuottaa erillisen JSON-tiedoston.

Luonnosasento on selvästi merkitty. Ajan vaihtaminen hylkää tallentamattoman
luonnoksen. Esikatselun kelaaminen/toistaminen ei kirjoita historiaa, pilveä
tai geometriaa; avainmuutokset käyttävät normaalia Undo/Redo-historiaa.
Sarana-/liukutyökalun kahden asennon toiminnot ovat paneelin alareunassa.

[Blast Door -testimalli](../public/examples/blast-door.nivo): 13 osaa,
kuusi raitaa, 3,5 sekuntia, eri aikaan liikkuvat ovilehdet ja lukitustapit,
hydraulivarsien skaalautuminen sekä viisi tapahtumamerkkiä.
Malli on synteettinen esimerkki, ei käyttäjän projekti.

## Toteutuksen rajat ja vienti

- Ryhmä ja kokoonpano säilyvät erillisinä käsitteinä. Molemmat voivat saada
  animaatioraidan, joka liikuttaa sisältöä; lapsiosan oma liike on paikallinen.
- Ryhmän vaihtaminen staattisen hierarkian sisällä säilyttää asennot.
  Jos siirto vaihtaisi animoitua vanhempaa, se estetään selittävällä ilmoituksella:
  perityn liikkeen leipominen uudelle vanhemmalle on jatkokehitystä.
- Pivotin jälkikäteen vaihtaminen säilyttää avainasennot. Kiertoliike avainten
  välissä voi muuttua uuden pivotin vuoksi; käyttöliittymä pyytää tarkistamaan sen.
- Kiertojen välillä käytetään lyhintä quaternion-kaarta. Yli 180° liikkeeseen
  tarvitaan väliavaimia. Paikallista akselistoa vinouttavaa maailman suuntaista
  epätasaista skaalausta ei tallenneta virheellisenä TRS-muunnoksena.
- Step on glTF STEP. Smooth on mukautuvasti näytteistetty LINEAR
  (paikallinen tavoitevirhe 0,01 mm / 0,0001 rad / 0,00001 skaalayksikköä
  ennen tiedoston Float32-pakkausta). Samalla raidalla Step+jatkuva liike käyttää
  lyhyttä dokumentoitua siirtymäväliä; tarkka alkuperäisdata säilyy JSONissa.
- GLB säilyttää hierarkian, osien/solmujen ID:t, TRS-kanavat, klippien nimet
  ja tapahtumat `extras.nivoAnimation`-tiedoissa. Metrit/Y-up saadaan juurimuunnoksella.
  Loop ja tapahtumat ovat metadataa: kohdeohjelma vastaa toistosta ja tapahtumista.
- Tapahtumamerkit voi lisätä, nimetä ja poistaa. Esikatselu ei suorita
  pelitapahtumia. Kelauksen, keskeytysten ja kierrosten tapahtumalogiikka
  kuuluu kohdeohjelmalle; Nivossa on erikseen testattu välin ylityksen apufunktio.
- GLB testattu Three.js:n lisäksi **Blender 5.2.2 LTS**:llä, mukaan lukien
  ryhmä/lapsiliike, quaternion-kierto, skaala ja ajassa taaksepäin kelaus.
  **Unreal-tuontia ei ole testattu**: tällä koneella ei ole Unreal-asennusta.
  Unrealin todellinen ajettava tuonti on edelleen erillinen hyväksymisportti.

Projektiformaatti on nyt v9, animaatio-osio v1. Vanhat projektit ja v8:n
jaettu kumoamishistoria avautuvat; vanha Nivo-versio ei voi hiljaa avata ja
uudelleentallentaa uutta v9-tiedostoa pudottaen animaatiot.

Keskeinen toteutus: `model/animationSchema.ts`, `model/animation.ts`,
`model/animationPose.ts`, `model/animationProject.ts`, `ui/AnimationWorkspace.tsx`,
`viewport/animation.ts` ja `exchange/animationExport.ts`.

## Alkuperäinen vaihe A — ennen toteutusta

19.10.2026. Tarkastettu Nivo 0.51.5, commit `a4df123`.
Tämä on käyttäjän Mechanical Animation -määrittelyn **vaihe A**.
Uutta aikajanaeditoria tai keyframe-tietomallia ei ole vielä toteutettu.

## Johtopäätös

Nykyiset pivotit, saranat, liu'ut, esikatselumatriisit ja GLB-vienti antavat
käyttökelpoisen pohjan. Monivaiheinen Blast Door tarvitsee lisäksi omat
klipit, paikalliset TRS-asennot, animaatiohierarkian ja yhteisen ajanarvioinnin.
Pelkkä aikajanan lisääminen nykyiseen sarana-/liukupaneeliin ei riitä.

Mallinnuksen siirron, kierron ja skaalauksen käyttöliittymä sekä tartunta
voidaan hyödyntää. Niiden nykyistä geometrian tallennuspolkua ei voi ajaa
jokaiselle animaatioavaimelle: kierto ja skaalaus muuttavat CAD-/mesh-geometriaa.
Tarvitaan samaan käyttöliittymään animaation asentoja muokkaava kohdesovitin.

Ryhmän ja kokoonpanon ero säilytetään: ryhmä järjestää, kokoonpano määrittää
mallin valintakokonaisuuden. Kumpikaan ei nykyisin sisällä omaa paikallista
transformaatiota. Animaation liikesolmu on oma toiminnallinen rakenne, jota
voi kohdistaa osaan tai ryhmän/kokoonpanon sisältöön.

## Nykyinen toteutus ja uudelleenkäyttö

| Alue                     | Todettu toteutus                                                                                                                                          | Tarvittava muutos                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Osat ja tunnisteet       | `Body.id` on pysyvä esiintymän tunniste. `component.id` yhdistää linkitetyn geometrian, ei yksittäisen esiintymän liikettä.                               | Raidat viittaavat esiintymän tai liikesolmun ID:hen, eivät nimeen tai komponenttiperheen ID:hen.                                                                                        |
| Ryhmät                   | `groupId`, `parentId`, `folder`/`assembly`; ryhmäsiirto mallilistassa säilyttää maailman geometrian.                                                      | Ryhmän liikeraita ja sen lasten paikalliset asennot tarvitsevat erillisen levossa olevan koordinaattikehyksen. Ryhmittelyä ei saa muuttaa huomaamatta animaatioksi.                     |
| Mallinnuksen transformit | Siirto muuttaa `origin`-arvoa. Kierto ja skaalaus muokkaavat geometriaa; `textureFrame` ja linkityksen kehys pitävät pintasuunnat mukana.                 | Animaatiomuokkauksen on muutettava luonnosasentoa, ei `feature`-geometriaa, aihiomittoja tai linkitettyjä kopioita. `textureFrame` ei yksin ole yleinen TRS-tietomalli.                 |
| Sarana ja liuku          | `Motion`: ID, nimi, ankkuri, liikkuvat osat, paikallinen pivot/akseli, määrä, kesto, smooth/linear. Yksi ajuri osaa kohti; ankkuriketjun syklit estetään. | Useita aikakohtia, vapaa position/rotation/scale, klipit, ryhmäkohteet sekä Step puuttuvat.                                                                                             |
| Esikatselu               | `motionTransforms` laskee ketjun; `createMotionPreview` muuttaa vain näyttömatriiseja. Lepotila palautuu tilan vaihdossa.                                 | Sama deterministinen `evaluate(clip, time)` aikajanalle, toistolle ja viennin vertailuun. Toiston kellon ja esikatseluasennon pitää pysyä erillään projektista.                         |
| Valinta ja työkalut      | Sama viewport ja pivotin tartuntapoiminta ovat käytössä. Animaatiotila ohittaa normaalin osoitinkäsittelyn; tavallisen työkalun valinta sulkee sen.       | Valinta, M/R/skaalaus ja näppäinkentät reititetään animaatiokohteelle. Nykyinen vartiointi ei vielä salli määrittelyn mukaista transformityöskentelyä animaatiotilassa.                 |
| Historia                 | `editor.transact`, rakenteellisesti jaetut projektit, enintään 100 askelta sekä muistiraja. Määrittelyn muutos on yksi peruutettava toiminto.             | Avaimen lisäys/poisto/paste ja dragin hyväksyntä käyvät saman historian kautta. Drag-esikatselu ja aikajanan kelaus eivät luo historiaa.                                                |
| Tallennus                | Projektiskeema 8 sisältää valinnaiset `motions`-määrittelyt; parseri muuntaa vanhat versiot. Paikallinen ja pilvitallennus käsittelevät projektia.        | Versionoitu `animation`-osio, skeema- ja viitevalidointi, vanhojen saranoiden/liu'ujen yhteensopivuus. Vanhan sovellusversion takaisin tallentaminen ei saa hiljaa poistaa uutta dataa. |
| GLB                      | Osa-ID:t `extras.nivoId`:ssä, pivot-solmut, translation/quaternion-kanavat, erilliset open/close-klipit. Smooth näytteistetään LINEAR-avaimiksi.          | Yhteiset nimetyt moniraitaklipit, scale, Step, ryhmähierarkia ja uusi TRS-koostaminen. Nykyinen vienti ei rakenna mallilistan kansio-/kokoonpanohierarkiaa.                             |
| LOD ja instanssit        | GLB-/LOD-vienti käyttää samaa kohtausrakennetta. Liikkuvat osat ja ankkurit jäävät staattisen GPU-instanssierän ulkopuolelle.                             | Säilytetään; jokainen animoitu esiintymä tarvitsee oman solmun, vaikka geometria olisi jaettu.                                                                                          |

Keskeiset koodikohdat:

- [Tietomalli ja ketjun arviointi](../src/model/motion.ts),
  [nykyinen animaatiopaneeli](../src/ui/MotionWorkspace.tsx),
  [esikatselu](../src/viewport/motions.ts).
- [Projektiskeema](../src/model/project.ts), [ryhmät](../src/model/groups.ts),
  [kierto](../src/cad/transforms.ts), [skaalaus](../src/cad/scaling.ts).
- [Viewportin tapahtumat](../src/viewport/interactions.ts),
  [työkalujen rajapinta](../src/viewport/types.ts), [App](../src/App.tsx).
- [Transaktiot](../src/useEditor.ts), [historia](../src/model/history.ts),
  [rakenteellinen jakaminen](../src/model/sharing.ts).
- [Kohtauksen vienti](../src/exchange/exportScene.ts),
  [pivotit ja animaatiokanavat](../src/exchange/motionExport.ts),
  [GLB-pakkaus](../src/exchange/export.ts).

## Ehdotettu tietomalli ja vastuunjako

Tämä osio on toteutussuunnitelma, ei nykyisen tiedoston uusi formaatti.

- `animation.version`: itsenäisesti versionoitu osio. Projektiformaatin
  seuraava versio migroi skeeman 8 ja säilyttää vanhat tiedostot luettavina.
- Liikesolmu: pysyvä ID, nimi, parent-ID, kohdeviittaus, pivot ja
  lepoasennon paikallinen TRS. Kohde voi olla osa, kokoonpano tai ryhmä.
  Sama osa ei saa saada kahta ristiriitaista sisarusajuria; lapsen oma liike
  on sallittu vanhemman liikkeen lisäksi.
- Klippi: ID, nimi, kesto sekunteina, loop, raidat. Raita viittaa
  liikesolmuun. Keyframe: ID, aika, position, quaternion, scale sekä
  **seuraavaan avaimeen** johtavan jakson interpolointi.
- Raidan ensimmäistä avainta ennen pidetään ensimmäinen asento, viimeisen
  jälkeen viimeinen. Raidan puuttuminen käyttää lepoasentoa. Samassa ajassa
  saa olla vain yksi avain per raita; korvaaminen on näkyvä ja peruutettava.
- Linear käyttää position/scale-lerpiä ja quaternion-slerpiä. Smooth käyttää
  samaa ajanfunktion `t²(3−2t)` arvoa näissä interpoloinneissa. Step pitää
  lähtöasennon seuraavaan avaimeen saakka. Nykyinen smooth-funktio voidaan
  käyttää uudelleen.
- Quaternion normalisoidaan, etumerkkijatkuvuus säilytetään. Yli 180 asteen
  tarkoituksellinen kierto tarvitsee välivaiheet: kaksi orientaatiota eivät
  yksin kerro kierrosten määrää. Nykyisten 270/360 asteen saranoiden muunnos
  ei saa menettää tätä tietoa.
- Maailman asento ratkaistaan vanhemmasta lapseen. Viewport soveltaa
  lepoasennosta laskettua deltaa olemassa olevaan maailman koordinaateissa
  olevaan näyttöverkkoon; vienti rakentaa samasta tiedosta paikalliset solmut.
  Epätasaisen skaalauksen, kääntyneiden vanhempien ja peilausten yhdistelmät
  testataan: TRS-hajotelma ei saa hukata leikkaavaa muunnosta huomaamatta.

Käyttäjän toiminnassa on kolme erillistä tilaa: tallennettu lepoasento,
tallennetut avaimet ja nykyinen asennon esikatselu. **Lisää avain** tallentaa
luonnosasennon; auto-key ei ole oletuksena käytössä. Pause pitää ajan,
Stop palauttaa ajan nollaan ja klipin alkuasentoon. Animaatiotilasta poistuminen
palauttaa mallinnuksen lepoasennon. Tallentamattoman asennon hylkääminen
näytetään käyttäjälle selvästi.

Ryhmän jäsenmuutokset, ryhmän purkaminen, osan poistaminen, kopiointi,
projektien yhdistäminen ja osakirjasto tarvitsevat uudet viitteiden
uudelleenkohdistukset. Nykyisten `motions`-määrittelyjen toteutus antaa mallin,
mutta ei automaattisesti käsittele uutta animaatio-osiota. Uudelleennimeäminen
säilyttää ID:t. Linkitettyjen kopioiden geometria voi säilyä yhteisenä ja
animaatio erillisenä.

## glTF-viennin ratkaistavat erot

glTF tukee paikallisia translation-, rotation- ja scale-kanavia.
Interpolointi kuuluu **samplerille**, ei yksittäiselle avainvälille.
Nivon saman raidan Step/Linear/Smooth-sekoitusta ei siksi voi vain kirjoittaa
kolmena nimilappuna yhden glTF-samplerin avaimiin. Lisäksi glTF ei määrittele
toiston loop-, nopeus- tai pelitapahtumalogiikkaa. Nämä ovat sovelluksen
toimintaa tai metadataa. [Khronos, glTF 2.0 §3.11 ja §5.8](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#animations)

Suunniteltu vienti:

- Yhtenäinen Step-raita → STEP; yhtenäinen Linear → LINEAR.
- Smooth ja jatkuvien interpolointien sekoitus → LINEAR-näytteistys,
  virherajaan perustuen. Position-, kulma- ja skaalausvirhe mitataan myös
  näytteiden välistä; nykyinen kiinteä 30 Hz ei ole yleinen tarkkuustakuu.
- Stepin sekoittuminen jatkuvaan liikkeeseen tarvitsee erillisen
  vientiratkaisun: lyhyen, ilmoitetun toleranssin hyppy approksimaatiossa
  tai erikseen rajatun vientitavan. Jatkuvaa käyrää ei merkitä täsmälliseksi
  Stepiksi. JSON voi säilyttää alkuperäiset avainvälit tarkasti.
- Sama lepoasennon hierarkia, pivotit ja ID:t GLB:hen ja esikatseluun.
  Säilytetään millimetrit/Z-ylös → metrit/Y-ylös -muunnos täsmälleen kerran.
- Loop/nopeus/tapahtumat tallentuvat Nivon metadataan; vastaanottavan
  sovelluksen pitää ottaa ne käyttöön. Ne eivät käynnisty GLB:stä itsestään.

## Unreal, Babylon ja riippumaton tarkistus

Nykyiset GLB-testit käyttävät Three.js:n GLTFLoaderia/AnimationMixeriä.
Ne tarkistavat oikean binääriviennin, ID:t ja toiston, mutta eivät ole
riippumattoman katselimen tai Unrealin hyväksyntä.

Tältä koneelta löytyi Blender mutta ei Unreal-asennusta tarkistetuista
`/Applications`- ja `/Users/Shared/Epic Games` -paikoista. Unreal-tuontia
ei ole tässä auditissa suoritettu. Sitä ei merkitä hyväksytyksi.
Epicin dokumentaatiossa glTF mainitaan animaatiota tuovana formaattina
Datasmithin yhteydessä, mutta se ei yksin todista uuden editorin rigid-node-
hierarkian ja ajoitusten toimivuutta valitussa Unreal-versiossa/importterissa.
[Epic, Datasmith Import Process](https://dev.epicgames.com/documentation/en-us/unreal-engine/datasmith-import-process-in-unreal-engine)

Vaiheen E kokeilu tehdään pienellä Blast Door -tiedostolla ensin, ei koko
peliprojektilla. Kirjataan Unreal-versio ja tuontipolku, klippien nimet,
solmujen parentit, yksiköt, pivotit ja mitatut asennot kaikissa avainkohdissa
sekä niiden välissä. Testataan sulkeminen, keskeytys ja lapsen oma liike.
Riippumaton Blender- tai Babylon-tarkistus sekä glTF Validator ovat erilliset
portit. Jos GLB:n rigid-animaatiot eivät siirry, kokeillaan saman arvioijan
tuottamaa versionoitua JSONia ja Level Sequence -editoriautomaatiota.

## Toteutusjärjestys ja hyväksyntäportit

1. **B — tietomalli ja arvioija.** Skeema, migraatio, parent-ketjut,
   pivotit, TRS ja Step/Linear/Smooth ilman käyttöliittymää. Testit
   eteen-/taaksepäin satunnaisista ajanhetkistä, quaternion-etumerkeistä,
   yli 180 asteen vanhoista saranoista ja virheellisistä viitteistä.
2. **D:n pieni pohja ennen C:tä.** Sama arvioija ohjaa olemassa olevia
   näyttömatriiseja; staattinen geometria ja tallennettu projekti pysyvät
   samana kelattaessa. Transformikohteen sovitin käyttää nykyistä
   valintaa, tartuntaa ja gizmoja. Ei geometrian uudelleenrakennusta per frame.
3. **C — aikajana.** Klipit, raitalista, kesto, play/pause/stop,
   loop/nopeus/suunta, kelaus; avainten lisäys/korvaus, valinta,
   siirto, copy/paste, poisto, numeerinen muokkaus ja interpolointi.
   Yksi raahaus = yksi historiatoiminto; Esc palauttaa vedon.
4. **D — kokonainen integraatio.** Ryhmä- ja lapsiraidat, osan
   uudelleennimeäminen, Hold, piilotus, kopiot, osapoistot ja
   eri projektin avaaminen kesken esikatselun. Vanha sarana/liuku
   pysyy helppona tapana tehdä tavallinen kaksiasentoinen liike.
5. **E — tallennus ja vienti.** Uudelleenavaus paikallisesti/pilvestä,
   vanhat projektit, Undo/Redo, GLB-/LOD-vienti ja riippumattomat tuontitestit.
   Unreal-portti on avoin kunnes todellinen toisto on mitattu.
6. **F — tapahtumat.** ID/nimi/aika ja JSON-vienti. Määritellään
   eteen-/taaksepäin ylitetyt aikavälit, loop-raja, nopeus, pause ja
   seek erikseen. Kelaus ei oletuksena laukaise pelitapahtumia.
   Varsinainen ääni-, fysiikka-, este- ja pelitilalogiikka jää pelimoottoriin.

Blast Door -hyväksyntämalli: pysyvä runko, kaksi ovikokoonpanoa,
kummankin omat lukitustapit ja hydrauliosat. Klippi `BLAST_DOOR_OPEN`,
3,5 s; avaimet 0 / 0,35 / 0,80 / 1,70 / 3,50 s. Nytkähdykset,
tiivisteistä irtoaminen ja sivuille liukuminen tehdään samalle ovelle
useilla paikallisilla TRS-avaimilla. Oikean oven ajoitus poikkeaa hieman;
lapsena oleva lukitustappi liikkuu sekä oven mukana että omaa raitaansa.
Hydrauliikan kohdistus tehdään avaimilla: IK/automaattinen sylinteriratkaisu
ei kuulu v0.1:een. Luusto, skinning, ragdoll, kangas, mocap, blending ja
rasitussimulaatio pysyvät tämän kokonaisuuden ulkopuolella.

## Auditissa tehty varmennus

- Koodipolut yllä on luettu; arviota ei tehty pelkän backlog-kuvauksen perusteella.
- Nykyisten liikkeiden 12 mallinnus-/vientitestiä hyväksytty: ketjut,
  erilliset laatikot, pivotkehys, kopiot, poisto/import, tallennus,
  Undo/Redo ja animaatioraidat.
- Kaksi selaimen sarana-/GLB-tarkistusta hyväksytty: esikatselu ja palautus,
  binäärivienti sekä lataus/toisto Three.js:n kautta. Tarkemmat tulokset
  ovat [validointilokissa](validation.md).
- Uusia keyframeja tai aikajanaa ei ole julkaistu tämän auditin perusteella.
