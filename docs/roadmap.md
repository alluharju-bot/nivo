# Toteutusvaiheet

[Kokonaisvaatimus](requirements.fi.md).

## V0.47.0 — kiiltävät pinnat ja ennustettava geometrian muokkaus

- Perusvalaistus erotetaan heijastuksesta samoista valopoluista. Kummankin
  kohinanpoisto seuraa omaa varianssia; laatan kiilto ei enää estä sen
  perusvalaistuksen puhdistamista. Heijastuvan pinnan väri, normaali ja
  matka suojaavat heijastuksen yksityiskohtia. Lasi ja ratkaisemattomat
  heijastusketjut käsitellään edelleen varovaisesti.
- Kohinainen heijastus saa enintään yhden lisäpolun laskentakierrosta kohti.
  Päätös perustuu valmistuneeseen historiaan. Raakakertymää ei suodateta,
  eikä kirkasta näytettä hylätä sen arvon perusteella. Näkymä ja vienti
  käyttävät samaa laskentaa; ulkonäköön ei lisätty uutta säädintä.
- Tavallinen läpinäkymätön renderi ei varaa täysikokoisia läpinäkyvyyden
  varapuskureita. Kameran vaihto tyhjentää kaikki uuden näkymän historiat.
- Tasopinnan kolmiointi rakennetaan muodon rajauksesta uudelleen.
  Koveruus, aukot, sisäiset ohjauspisteet ja tarkoitukselliset pintajaot
  säilyvät. Nostetun reunapisteen vaikutusta paikallistetaan vaihtamalla
  sisäisiä lävistäjiä. Sama kolmiointi näkyy esikatselussa ja hyväksyttäessä.
- Verkkopinnan muotoilualueet säilyvät tallennuksessa. Sisäinen kolmiointi
  ei ilmesty ylimääräisiksi muokattaviksi reunoiksi; sen voi edelleen näyttää
  tarkkuusasetuksista. Eri pintamateriaalit ja UV-saumat eivät yhdisty.
- **Pehmeä muotoilu** on valinnainen. Vaikutusetäisyys mitataan pintaverkkoa
  pitkin, eikä vaikutus hyppää toiseen kuoreen tai aukon yli. Muut
  reunalenkit voi pitää kiinni. Oranssi näyttää valinnan, violetti vaikutuksen.
- Testattu: ympyrän piste tasossa/pois tasosta, koko kehä, rengasaukko,
  sylinterin pääty, kovera rajaus, peräkkäiset muutokset, pintamateriaali,
  mittatiedot, linkitys ja Hold sekä Peru/Palauta ja tallennus/uudelleenavaus.
- Kaarevan CAD-osan vapaa pistemuokkaus tekee edelleen erikseen hyväksyttävän
  verkkokopion ja säilyttää alkuperäisen. Olemassa olevaa kaarevaa lähdepintaa
  ei tasoiteta tai muuteta automaattisesti uudeksi CAD-pinnaksi.

Jatkoon: kaarevan CAD:n tarkka aluejako ja säteittäinen muokkaus,
laajasti taivutettujen verkkopintojen adaptiivinen uudelleenverkotus sekä
lasi-/moniheijastusketjujen yksityiskohtien kohinanpoisto.
[Laatu, suorituskyky ja rajat](performance.md).

## V0.46.7 — renderin selkeät reunat ja pintayksityiskohdat

- Kameran näytteistys ei levitä osan reunaa viereisiin pikseleihin. Kohinanpoisto
  säilyttää eri pintojen osittaisen peittävyyden reunapikseleissä. Geometrinen
  tasotesti käyttää saman pinnan puoleista naapuripistettä, ei pintojen väliin
  muodostuvaa kuvitteellista tasoa.
- Kaikki suodatusvaiheet valmistuvat renderin omassa tarkkuudessa ennen kuvan
  sovittamista näyttöön. Ohjainkuvia ei sekoiteta eri pikseliruudukon kanssa.
- Karkean pinnan värikuvio erotetaan suodatettavasta valaistuksesta ja palautetaan
  lopuksi. Jo tarkentunutta hienovaraista valaistusta ei käsitellä uudelleen
  kohinana. Karheiden pintojen kohinanpoisto säilyy.
- Vinon pinnan läikkäkorjaus ja harvinaisten kirkkaiden osumien käsittely
  säilyvät. GPU-testit mittaavat todellisia kameranäytteitä, vinoa reunaa,
  suurentamista, hienoja värikuvioita ja karheiden pintojen kohinaa.
- Sama toiminta renderinäkymässä ja viennissä, ei uusia säätimiä tai puskureita.
  Geometrian muokkauksen kovennus on kirjattu seuraavaksi yöpassiksi yllä.

## V0.46.6 — geometriatyökalun latausvarmuus

- Geometrian muokkaus kuuluu sovelluksen alkulataukseen. Pages-päivityksen
  poistama vanha laiskasti ladattava skripti ei enää estä perustyökalun avaamista
  kesken istunnon. Geometrian valmistelu ja virheilmoitukset toimivat ennallaan.
- Tuotantobuildin regressio estää mallin avaamisen jälkeen kaikki uudet
  JavaScript-pyynnöt: geometriatyökalu avautuu, pisteiden siirto valmistuu,
  muutos voidaan perua ja työkalu avata uudelleen ilman sivun päivittämistä.

## V0.46.5 — vaaleiden pintojen valoläikät

- Kohinanpoiston tarkka lineaarinen syvyys ja pintatasotesti korjaavat vinon
  pinnan suuntaan venyvät läikät. Sama pinta säilyy yhtenäisenä myös lähellä
  sivuttaista katselukulmaa.
- Viisi suodatusmittakaavaa seuraavat jäljellä olevaa varianssia kahdessa
  kierrätettävässä välipuskurissa. Kirkkaat kohinaryhmät tasoittuvat ilman,
  että myöhemmät vaiheet käyttävät yhä alkuperäisen kuvan korkeaa varianssia.
- Oikeiden valokohtien, varjorajojen, pintojen rajojen, puunsyiden ja
  läpinäkyvyyden säilymiselle on GPU-testit. Samat korjaukset näkymässä ja viennissä.
- Yksityisen sisätilan saman kuvan vertailu; pelkkää rakeisuuden numeerista
  vähenemistä ei enää tulkita kokonaiskuvan laadun paranemiseksi.

Jatkoon: heijastusten kohina sekä peitossa olevien valojen tehokkaampi näytteistys.
[Vertailu ja rajat](performance.md).

## V0.46.4 — renderin raekuvio ja pienten valojen näytteistys

- Näytejono vaihtuu kirjaston 64 × 64 pikselin toistuvasta kohinalaatasta
  pikseli- ja heijastuskohtaisesti sekoitettuun Sobol-jonoon. GPU-regressio
  toistaa vanhan kuvion ja varmistaa uuden jonon konvergenssin sekä keskiarvon.
- Valonvalinta huomioi pistemäisen spotin keilan: voimakas mutta pinnasta pois
  osoittava spotti ei enää vie lähes kaikkia näytteitä oikeasti valaisevalta LEDiltä.
  Tasainen 10 % osuus säilyttää kaikkien valojen mahdollisuuden.
- Kokonainen tasomainen pyöreä LED-pinta saa muotoaan vastaavat valonäytteet.
  Renkaita, kaaren osia tai suljettua sylinteriä ei täytetä valaisevaksi kiekoksi.
  Kallistus ja näkymän kopiointi säilyttävät ympyrän; sama energia lasketaan kerran.
- Kohinanpoisto arvioi harvat kirkkaat osumat kaikissa kolmessa mittakaavassa.
  Harvemman varianssiverkon väliin osunut pikseli ei jää ensimmäisen vaiheen
  jälkeen koskemattomaksi. Albedo-, normaali- ja syvyysrajat suojaavat yksityiskohtia.
  Peilien ja lasin suodatus säilyy varovaisena; raakakertymää ei suodateta.
- Sama korjaus näkymässä ja kuvan viennissä. Yksi uusi RGBA16F-välipuskuri:
  8 tavua/pikseli eli enintään noin 24 MB esikatselun 3 MP rajalla.

Jatkoon: peilistä näkyvien yksityiskohtien kohinanpoisto, koteloitujen valojen
näkyvyyden huomioiva valonvalinta sekä muut kuin kokonaiset tasomaiset valopinnat.
Nämä korjaukset eivät lupaa täysin kohinatonta sisäkuvaa tietyllä näytemäärällä.
[Vertailun rajat ja tulokset](performance.md).

## V0.46.3 — kynän aloitus ja ympyrän piirto­taso

- Kynän pisteet hyväksytään sen omalta piirto­tasolta tai tarkasta
  tartunnasta. Erillinen origotason tarkistus ei enää hylkää klikkauksia,
  kun kamera on mallin lähellä ja origotaso kameran takana. Sama korjaus
  koskee aloitusta ja jatkopisteitä sekä tavallista näkymää että osan muokkausta.
- Tarkka ympyrän kaaripiste tunnistaa oman CAD-pintansa, vaikka se jää
  näyttökolmioiden suorien jänteiden ulkopuolelle. Suorakulmion ja kynän
  aloitus säilyy oikealla pinnalla; tartuntatoleranssia ei levennetä reikiin
  tai viereisiin pintoihin. Paksuudettomalle pinnalle voi aloittaa kummaltakin puolelta.
- Kameran kääntö heti kynän alkupisteen jälkeen ei enää niele seuraavaa
  hiiren liikettä ja estä kirjoitetun pituuden käyttöä. Olemassa olevan
  luonnosviivan säilyttäminen kameran liikkeen aikana jatkuu ennallaan.
- Regressiot: ulospäin jatkuva viiva ympyrästä, akselilukitus, perspektiivissä
  kirjoitettu mitta, Peru/Palauta, suorakulmio kaarireunasta, jaetun kaaren
  pintaomistus sekä kameran käännön jälkeinen piirto.

## V0.46.2 — geelit, aerogeeli ja muovit

- 14 uutta visuaalista esiasetusta: kirkas, meripihkanvärinen ja maitomainen geeli,
  sinertävä aerogeeli, kirkas/savu/huurrettu polykarbonaatti, PET, polypropeeni,
  PE-HD, nailon PA, POM, TPU ja silikoni. Aiemmat ABS- ja akryylipinnat säilyvät.
- Samat materiaalit maalaustyökalussa, osapaneelissa ja renderissä. **Läpäisy ja
  sisäinen sävy** kokoaa läpäisyn, taittokertoimen ja paksuuteen sidotun sävyn
  säädöt. Kiilto/pintakäsittely säätää myös pinnan huurrettavuutta. Omat optiset
  säädöt voi palauttaa materiaalin oletuksiin muuttamatta muuta pintaa.
- Absorptio käyttää projektin millimetrejä. Tarkentuva renderi laskee matkan
  kappaleen sisällä; nopea esikatselu arvioi paksuuden osan pienimmästä mitasta.
  Paksuudettomalla uudella materiaalipinnalla ei teeskennellä tilavuutta.
  Vanhat materiaalit säilyttävät oletusulkonäkönsä.
- Asetukset säilyvät osissa, pintamaalauksessa, omissa materiaaleissa ja
  projektitiedostossa. Materiaalimuutos käyttää nykyistä geometriapuskureita
  säästävää päivitystä. Uudet esiasetukset eivät lataa kuvia tai tilavuustekstuureja.
- Aerogeeli on **visuaalinen pinta-arvio**, ei tilavuussirontaa laskeva malli.
  Myös geeli ja silikonimateriaalit muuttavat ulkonäköä; ne eivät lisää
  pehmeän kappaleen fysiikkaa. Esiasetukset eivät ole tuotekohtaisia mittausarvoja.

## V0.46.1 — työkalujen suunta ja kameran yhteistoiminta

- Työkalupalkin kevyet **Piirrä / Muokkaa / Mittaa** -jaottelut säilyttävät
  suorat työkalupainikkeet. Muotovalikko sijoittuu käytettävissä olevan tilan
  mukaan myös siirretyssä palkissa.
- **Suorakulmio keskeltä** pitää ensimmäisen pisteen keskipisteenä myös
  mittoja kirjoitettaessa ja Tabilla vaihdettaessa. Mitat ovat kokonaismittoja.
  Ympyrä, ellipsi, säännöllinen monikulmio ja pallo alkavat jo keskipisteestä.
- Pursotuksen, siirron, kynän ja apuviivan kirjoitussuunnan tieto säilytetään
  myös ruudukkoa pienemmästä liikkeestä. Ruudukko pyöristää mitan; se ei saa
  vaihtaa liikkeen puolta. Myöskään esimerkiksi 13 mm:n osan ulospäin aloitettu
  pursotus ei saa ensin pienentää osaa 10 mm:iin.
- Kameraa voi liikuttaa kesken työkalun käytön muuttamatta luonnosta.
  Pursotuksen ja siirron hiirilaskenta sidotaan uudelleen nykyiseen mittaan
  kameran vaihduttua. Myös muotojen ja mittaviivojen vapaa asettelu säilyttää
  keskeneräisen päätepisteen.
- Zoom ja pan käyttävät osoitetun pinnan syvyyttä. Kameran lähelle jäänyt
  vanha orbit-kohde ei saa tehdä huoneen navigoinnista millimetriluokan hidastelua.
- Reunasta vedettävä apuviiva valitsee viereisistä pinnoista tason
  alkuperäisen hiiriliikkeen mukaan ennen ruudukon pyöristystä. X/Y/Z säilyvät
  nimenomaisina suunnan lukituksina.
- Pyörityksen akselirenkaat skaalautuvat näkymään, tavallisesti 52–130 pikselin
  säteelle. Piirto ja poiminta käyttävät samaa kokoa myös zoomattaessa.
- Leikatun sylinterin päätyä voi jatkaa ja lyhentää. Tasaisesti pursotettu
  poikkileikkaus tunnistetaan tilavuuden ja leikkausgeometrian vastaavuudella;
  reikiä tai sivujen tarkoituksellisia jakoja ei korvata oletusmuodolla.
  Päällekkäisten pyöristysten reunat kohdistetaan geometrian avulla.
- Pintaan piirretyn muodon alkuperäinen rajaus säilyy, vaikka tasopinta
  katkaisee sitä reiän tai pyöristyksen kohdalla. Sisäänpäin Push/Pull käyttää
  koko leikkausprofiilia. Tieto säilyy tallennuksessa, kopioissa, kierrossa ja
  skaalauksessa; muutettu tai poistettu pintajako irrottaa vanhan rajauksen.
  Ulospäin pursotus käyttää edelleen valittua materiaalipintaa.
  Vanhasta jo typistyneenä tallennetusta leikkauksesta puuttuvaa piirrosta ei
  voi päätellä varmasti: se on piirrettävä uudelleen tai palautettava historiasta.

### Seuraava tarkkuusmuokkauksen tarve: pinnan aluejako ja säteittäinen muokkaus

Käyttäjän vahvistama esimerkki: Ø10 × 20 mm sylinteri, Ø3 mm:n syvennys
1,76 mm syvänä. Jako 0,75 mm yläreunasta erottaa alemman 1,01 mm korkean
rengasalueen, jonka ulkohalkaisijaa kasvatetaan. Ø3 mm:n sisäreikä, ylin
0,75 mm ja muu sylinteri säilyvät. Tarvitaan tarkka kaarevan sivupinnan
aluejako korkeudella ja valitun alueen säteittäinen muutos sekä siirtymäpinnat.
Koko osan XY-skaalaus tai kaarevan CAD:n verkkokopion skaalaus ei yksin
toteuta tätä vaatimusta. Ei merkitä nykyisen pistemuokkauksen ominaisuudeksi.

### Backlog: toisto polkua ja pintaa pitkin

- Valitaan toistettava osa, profiili tai työstö ja reitti: ympyräreuna,
  reunaketju tai piirretty käyrä. Jako määrällä, välimatkalla tai suljetulla
  ympyrällä asteilla. Suunta säilyy, seuraa reitin tangenttia tai pinnan normaalia.
- Upotukset, reiät ja kohoumat samalla toimintaperiaatteella. Korurasian
  reunakoristeista voi tuottaa sekä leikkurit että erilliset upotettavat osat.
- Muokattava toistomäärä ja jako. Ensimmäinen kokonaisuus: reunat ja tasopinnat.
  Kaarevan pinnan seuraaminen jatkona; muodon asettaminen ja pinnan mukaan
  taivuttaminen erotetaan toisistaan. Kulmien ylitykset ja päällekkäiset kopiot
  tarvitsevat selkeän esikatselun ja ratkaisun ennen hyväksyntää.

### Backlog: materiaalikokeilut kokonaisuutena

**Ensivaihe toteutettu V0.46.2:ssa:** geelit, aerogeelin pinta-arvio ja muovivalikoima;
valon läpäisy, taittokerroin, sisäinen sävy ja sen syvyys sekä nykyinen pintakäsittely.
Jatkotyöt tehdään saman materiaalivalikon ja maalaustyökalun sisällä.

- Tilavuuden sisäinen sironta: aerogeelin sinertävä sameus ja vastavalon sävy,
  geelin/silikonin maitomaisuus, vahamaiset ja muut puoliläpäisevät pinnat.
  Pinnan karheus, absorptio ja sisäinen sironta ovat eri ilmiöitä. Tavoite on
  uskottava sisäosa myös sileällä pinnalla; karheus ei yksin korvaa sirontaa.
- Kirkkaat, sävytetyt ja huurteiset muovit; ohuet kalvot, paksut kiinteät osat ja
  ontot kuoret. Käyttäjä valitsee ulkonäön nopeasti esiasetuksella, tarkemmat
  säädöt avautuvat tarvittaessa. Myöhemmin tuotekohtaiset optiset tiedot erikseen.
- Pinnoitteet ja sävytetty lakka pohjamateriaalin päällä: oma sävy, paksuus,
  kiilto ja karheus niin, että puunsyy ja pohjan PBR-rakenne säilyvät.
  Materiaalin väri, pinnoitteen väri ja läpäisevän valon sävy pysyvät erillisinä.
- Kuplat, sisäiset sulkeumat ja kuituiset/huokoiset materiaalit myöhempinä
  kokeiluina. Kokeillaan ensin kevyttä esitystapaa; tilavuustekstuurit ja
  tarkka sironta vaativat erillisen suorituskykyarvion.
- Omat esiasetukset ja materiaalivertailu samoilla muodoilla: ohut levy,
  paksu kappale, kaareva pinta ja ontto kuori sekä suora-, sivu- ja vastavalo.
  Tarkistetaan värintoisto, paksuuden vaikutus, rajapinnat, kohina ja näytemäärä.
- Nopea esikatselu ja tarkentuva renderi käyttävät samoja arvoja. Esikatselun
  rajat kerrotaan ymmärrettävästi. Testataan päällekkäiset läpäisevät osat,
  peilit, LED-valot, pintakohtainen maalaus, kamera lähellä pintaa sekä muisti
  ja vaste MacBookilla/tabletilla. Piilotettujen kokeilujen ei pidä kuormittaa näkymää.
- Tallennus/pilvisynkronointi, Peru/Palauta, linkitetyt ja uniikit kopiot sekä
  pintakohtaiset materiaalit kattavat myös jatkossa lisättävät ominaisuudet.

### Backlog: lika, pöly ja materiaalikerrokset

Kaksi samaan maalaustyönkulkuun kuuluvaa käyttötapaa, pohjamateriaalia hävittämättä:

1. **Paikallinen merkki (decal):** tahra, pölyjälki, sormenjälki, vesijälki,
   naarmu, tarra tai logo. Valitse valmis merkki tai oma läpinäkyvä kuva,
   napsauta pintaa ja säädä kokoa, kiertoa, paikkaa ja voimakkuutta nykyisten
   tekstuurikahvojen tapaan. Rajaus valittuun osaan/pintaan estää vuodon seinän
   läpi tai naapuriosiin. Merkki kiinnittyy osan mukana, ja sen voi poistaa erikseen.
2. **Pintakerros:** koko valitun osan tai pinnan pölyisyys, lika, kuluminen tai
   kosteus. Määrä, mittakaava, sävy ja karheus; tarvittaessa oma normal-/bump-kartta
   ja maski. Kerroksen järjestys, näkyvyys ja poisto ovat muokattavissa.

Ensimmäiseen toteutukseen muutama neutraali pöly-/likavaihtoehto ja yksi
muokattava kerros. Sen jälkeen useat kerrokset, maskin maalaaminen sekä
automaattinen pöly ylöspäin oleville pinnoille ja kuluma reunoille. Pinnalla
näkyvä pöly ja ilmassa leijuva sumu/pöly erotetaan toisistaan.

Tekninen hyväksymisehto: samat jäljet nopeassa ja tarkentuvassa renderissä,
ei päällekkäisten pintojen välkkymistä, alpha-reunat ja värinhallinta oikein.
Arvioidaan materiaalikarttojen yhdistäminen ja välimuisti ennen uuden geometria-
tason lisäämistä jokaiseen likajälkeen. Pelkkä esikatselun shader-muutos ei riitä.
Kopioinnin, skaalauksen, UV-muutosten ja CAD-pintajaon vaikutus kiinnitykseen,
valinta/Hold, historia, pilvitallennus ja tekstuurimuisti testataan yhdessä.

### Backlog: mekanismien liike ja toimintakokeilut

1. **Sarana ja liuku ensin.** Valitse osa tai kokoonpano sekä reuna, piste tai
   akseli. Aseta sarana-akseli ja avautumisen suunta/asteet tai liukusuunta ja
   matka millimetreinä. Ovet, kannet, laatikot ja kiskot toimivat samalla tavalla.
   Määritä kiinteä ja liikkuva osa, lepoasento sekä liikerajat. Akselin valinnassa
   käytetään nykyisiä tartuntoja ja Shift-viitettä.
2. **Palautettava Kokeile-tila.** Liukusäädin, käsin veto, Toista/Tauko ja Palauta
   lepoasentoon. Liike ei muuta valmistusmittoja, lähdegeometriaa eikä muodosta
   historiaan tai pilveen muutosta joka kuvasta. Mekanismin määritys tallennetaan;
   tilasta poistuminen palauttaa lähtöasennon. Ryhmät säilyvät järjestelynä,
   kokoonpanot toiminnallisina kokonaisuuksina. Linkitettyjen osien geometria
   pysyy yhteisenä, esiintymän kokeiluasento voi olla oma.
3. **Liikkeiden yhdistäminen ja tilantarve.** Usean saranan/liukujohteen ketjut,
   mekanismien yhtäaikainen esitys, liikeradan näyttäminen ja törmäysvaroitus.
   Liikerajan tai törmäyksen rikkominen näkyy selvästi; sitä ei piiloteta.
4. **Jäykkien kappaleiden fysiikka erillisenä jatkona.** Painovoima, massa,
   kitka, kimmoisuus, tökkäys, pudotus/heitto ja törmäys. Yksinkertaiset
   törmäyskappaleet pitävät kokeilun nopeana. CAD-geometria ja valmistustiedot
   säilyvät ennallaan; simulaatio ei ole mittatarkka kuormitusanalyysi.
5. **Pehmeän kappaleen kokeilu.** Geeli, kumi, taipuminen, venyminen ja palautuminen
   vaativat verkotuksen, mekaaniset ominaisuudet ja numeerisen ratkaisun.
   Rajattu, palautettava prototyyppi arvioidaan erikseen, tarvittaessa ensin
   pelin/simulaation puolella. Visuaalinen geelimateriaali ei aktivoi fysiikkaa.

**Kuormitus, jännitys ja lujuuslaskenta ovat erillinen tutkimuskokonaisuus.**
Tarvitaan mekaaniset materiaaliarvot (esim. tiheys, kimmomoduuli, Poissonin luku,
myötöraja), tuennat, kuormat, liitokset/kontaktit, verkotus, konvergenssin
tarkistus ja validoitu ratkaisija. Visuaalinen animaatio ei osoita kantavuutta.
Päätös varsinaisesta FEM-integraatiosta tehdään käyttötarpeen ja vertailutestien
perusteella; sitä ei yhdistetä huomaamatta tavalliseen maalausvalikkoon.

## V0.46.0 — yhteinen geometriatyötila

- Osan muokkauksessa **Koko osa / Pisteet / Reunat / Pinnat** erottaa
  osan sijoittelun geometrian muuttamisesta. Valitulle osalle työtilan voi
  avata myös suoraan **Geometria**-painikkeesta. Sama kamera ja WebGL-näkymä;
  avaaminen ei muuta zoomia, ryhmää tai linkityksiä.
- Pisteeseen, reunaan tai pintaan voi tarttua suoraan. Siirto valitsee yhden
  akselin vetosuunnan mukaan; X/Y/Z lukitsee suunnan. Myös paksuudettoman
  pinnan reuna liikkuu. Liittyvät pinnat mukautuvat ja epätasomainen pinta
  rakentuu tasopaloiksi. M/R/L käyttää samaa työkalupalkkia.
- Shift lisää valintaan. Vedon aikana Shift hakee tarkan viitteen yhteisellä
  tartuntahaulla, myös muista osista, viivoista ja risteyksistä. Viite projisoidaan
  siirtoakselille ja ohittaa ruudukon. Poimi ankkuri / Poimi viite säilyvät.
  Numeerinen syöttö ja hiiriveto käyttävät samaa projektin ruudukkoasetusta;
  kirjoitettu mitta ohittaa askeleen. Kierron 5° askel vapautuu Shiftillä.
- Hyväksytty veto tai Enter muodostaa yhden **projektihistorian** toiminnon.
  Erillinen 30 muutoksen paikallishistoria on poistettu. Esc peruu luonnoksen,
  sitten tyhjentää valinnan ja lopuksi poistuu työtilasta. Työkalun vaihto
  hyväksyy kelvollisen luonnoksen; virhe jättää sen korjattavaksi.
- Kynä, mitat, muodot, Push/Pull, Offset, reunatyöstöt ja muut nykyiset työkalut
  avautuvat samasta palkista työtilan aikana. Pistevalintaan voi palata yläpalkista.
  Cut/Joinin kohde- ja työstöosat valitaan erikseen myös muista näkyvistä osista.
  Piilossa tai Holdissa olevia osia ei ohiteta tämän takia.
- **Muokkaa mittoja** samassa osapaneelissa molemmissa työtiloissa:
  perusmuotojen mitat ja viimeisen reunatyöstön mitta. Ympyrän pursotus säilyttää
  halkaisijan muokattavuuden. Tuettu CAD-ulkomitta käyttää yksiselitteistä
  positiivisen suunnan päätypintaa ja nykyistä Push/Pullia; reiät ja säteet
  säilyvät. Epäselvä pääty hylätään alkuperäistä muuttamatta.
  Aloituskulma tai ympyrän keskipiste pysyy paikallaan; profiilimitat ovat
  piirtotason suunnissa, yleisen CAD-osan ulkomitat maailman X/Y/Z-suunnissa.
- Mittapisteiden vanhat viitteet ja materiaalien kiinnitys säilyvät perusmitan
  muutoksessa. Profiilin uudet pisteavaimet erotetaan aiemman muodon avaimista,
  jotta saman paikalliskoordinaatin uusi piste ei sekoitu vanhaan viitteeseen.
- CAD/verkko-raja säilyy näkyvänä: kaareva CAD tarvitsee vapaaseen pistemuokkaukseen
  hyväksytyn verkkokopion. Muutokset eivät luo täydellistä parametripiirrepuuta
  eivätkä lisää verkkokopiolle kaikkia tarkkoja CAD-pintatyökaluja.

## V0.45.0 — geometrian muokkaus

Erillinen, tarvittaessa avattava **Geometrian muokkaus** toimii suoraan
valitulle osalle sekä osan muokkaustilassa. Avaa oikeasta paneelista,
Muodot-valikosta tai toimintohausta. Sulkeminen palauttaa samaan projektiin;
osan muokkaustila säilyy, ellei tulokseksi tehdä erillistä verkkokopiota.

- **Pisteet / Reunat / Pinnat**, osoituskorostus, oranssi valinta, aluevalinta
  ja Shiftillä lisääminen/poistaminen. Reunan tuplaklikkaus seuraa yhtenäistä
  reunalenkkiä tai selvää pehmeää jatkumoa, eikä arvaa haaraa terävässä kulmassa.
  Takapisteiden valinta on erikseen kytkettävissä. Uloimpien X/Y/Z-tasojen
  pisteet voi valita yhdellä painikkeella lisäasetuksista.
- **Siirrä / Kierrä / Skaalaa** vaikuttavat vain valittuihin pisteisiin.
  Liittyvät pinnat mukautuvat. Akselikahvat, millimetrit, asteet ja prosentit,
  yksi tai useampi akseli sekä maailman tai osan oma akselisto. Tasainen
  skaalaus toimii myös esimerkiksi vain X- ja Y-suunnassa. Kierron hiiriaskel
  on 5°; tarkka kirjoitettu kulma ohittaa sen. Siirtoon voi valita 1 mm askeleen.
- **Poimi ankkuri** asettaa keskipisteen esimerkiksi valittuun nurkkaan.
  **Poimi viite** siirtää ankkurin osan toiseen pisteeseen valittuja akseleita
  pitkin. Yksittäisen pisteen kierto/skaalaus tarvitsee muualle poimitun ankkurin.
  Ensiversiossa poiminta koskee tämän työtilan osaa; viitteet muista
  projektin osista ja Shift-poiminta aktiivisen vedon aikana ovat jatkotyötä.
  M/R/L ja X/Y/Z koskevat vain avointa työtilaa. Näyttötilojen 1–4 ja
  tavallisten mallinnustyökalujen valinta- ja Shift-säännöt säilyvät.
- Esikatselussa voi tehdä useita muutoksia (Enter tai **Toteuta muutos**).
  Työtilassa on 30 paikallisen muutoksen Peru/Palauta. **Hyväksy osaan**
  tallentaa koko istunnon yhtenä projektihistorian toimintona. Esc tai Peru
  hylkää koko luonnoksen. Projektin historiakapasiteettia ei muutettu.
- Suorareunaiset, tasopinnoista koostuvat osat palautetaan oikeaksi CAD:ksi.
  Vanhan pinnan sisäiset kolmiosaumat yhdistetään, mutta tarkoitukselliset
  pintajaot ja pintavärit säilyvät. Epätasomainen pinta jakautuu tasopaloiksi.
  Pisteisiin kiinnitettyjen mittojen viitteet sekä automaattiset aihiomitat
  päivitetään. Tavalliset Push/Pull ja Offset toimivat sopivilla tulospinnoilla.
- Kaarevan CAD-osan vapaa pistemuokkaus vaatii nimenomaisen
  **Muokkaa verkkokopiota** -valinnan. Alkuperäinen tarkka osa säilyy
  piilotettuna, uusi osa on uniikki. Verkkokopiolla on materiaali-, sijoittelu-
  ja STL-tuki, ei täyttä CAD-pintatyökalujen tukea. Olemassa oleva kolmiomalli
  voidaan muokata paikallaan; sen UV-saumat ja materiaaliryhmät säilyvät.
- Linkitetyn osan muutos jaetaan perheelle oletuksena. **Muokkaa vain tätä
  osaa · tee uniikki** erottaa sen. Osan tai ryhmän Hold estää aloituksen;
  lukittu linkitetty kopio estää yhteisen muutoksen. Esikatselu ei tallennu
  projektiin tai pilveen, eikä vedossa käynnistetä CAD-laskentaa. Osoitus käyttää
  erillistä BVH-kiihdytystä; työtila latautuu vasta avattaessa.
- Hyväksyntä tarkistaa risteävät pinnat, nollakokoiset kolmiot, päällekkäiset
  pisteet, tilavuuden suunnan ja CAD:n kelvollisuuden. Epäonnistunut muutos
  jättää luonnoksen korjattavaksi ja alkuperäisen ennalleen. Enimmäisrajat ovat
  30 000 pistettä / 60 000 kolmiota, CAD:n uudelleenrakennuksessa 4 000
  kolmiota. Monikuorisen tai irrallisista solideista koostuvan CAD-osan
  uudelleenrakennus ei vielä ole tuettu; tällaista osaa ei typistetä yhdeksi
  solidiksi. Tarkistukset eivät ole täydellinen tulostettavuustakuu.

Tallennuksen lisäkorjaus: synkroninen historian kirjoituksen tilavirhe tunnistetaan
myös IndexedDB-tapahtumakäsittelijässä, jolloin malli voidaan tallentaa ilman
historiaa aiemman varapolun mukaisesti.

### Tarkkojen muotojen seuraavat vaiheet

Yhteinen näkymä, valintakonteksti, projektihistoria, ulkopuoliset siirtoviitteet
ja ensimmäiset jälkikäteen muutettavat mitat on toteutettu V0.46.0:ssa.
Jatkokehitys säilyttää saman työkalulogiikan tavallisessa ja tarkassa muokkauksessa.

1. **Peilaa** yhteiseksi työkaluksi: osa tai peilikopio maailman tasoon tai
   poimittuun tasoon. Osageometrian peilaus ja puolikkaiden yhdistäminen ovat
   erillinen vaihe. Tarkistetaan suunnat, materiaalit, mittaviitteet ja linkitykset.
2. **Jälkikäteen muutettavat piirteet:** reiän paikka ja halkaisija, taskun syvyys,
   aiemmat pyöristyskerrokset sekä riippuvien työvaiheiden uudelleenlaskenta.
   V0.46:n perusmitat ja yksiselitteisen päädyn muutos eivät korvaa piirrepuuta.
3. Reunojen jakaminen, pisteiden yhdistäminen, aukon täyttö ja reunalenkkien
   yhdistäminen. Sovitetaan Kynä-, Offset-, Muotojen läpi- ja pursotustoimintoihin.
4. Kaarevien CAD-pintojen vapaa muotoilu tarkkuuden säilyttäen; verkon omat
   pinta- ja leikkaustyökalut. Verkkokopio ei vielä tue kaikkia CAD-työkaluja.
   Myös monikuoristen osien tarkka uudelleenrakennus on jatkotyötä.
5. Tulostustarkistukset: avoimet/moninkertaiset reunat, pintojen suunta,
   seinämäpaksuus ja sovitusvälykset; 3MF:n yksiköt ja osajako.
6. Fyysisen kosketuslaitteen eleet sekä Safari. Vapaa pehmennys ja subdivision
   vasta vakaan, tarkasti mitoitettavan perustan jälkeen.

## V0.44.1 — omien valmiiden osien monituonti

- **Projektikirjasto → Omat osat → Tuo osia kirjastoon** hyväksyy useita
  .nivo-tiedostoja samalla kertaa. Kaikki tiedostot tarkistetaan ennen tallennusta;
  virheellinen tiedosto tai tallennusvirhe peruu koko tuonnin. Avoin projekti,
  sen historia ja aiemmat osat säilyvät. Tuodut osat saavat omat tunnisteensa.
- Valmistajien tiedostoja valmisteltu käyttäjän paikalliseen kirjastoon:
  Hettich Sensys 9094000/9094010/9094020 ja Novisys 9313100/9313110/9313120,
  Oras Inspera 3018F sekä GROHE SmartControl 102168KF00. Alkuperäinen STEP
  ja .nivo-CAD-versio säilyvät paikallisesti; tiedostoja ei lisätä julkiseen repoon.
  Jakelu- ja muokkausoikeudet on tarkistettava ennen julkista mallikirjastoa.
  Molemmista hanoista lisäksi erillinen kevyt kolmiomalli sijoitteluun:
  GROHE 513 038 → 84 958 kolmiota, Oras 130 382 → 11 864. CAD-versiot säilyvät.
  Kolmiomallissa ei ole tarkkaa CAD-pintamuokkausta. Materiaalivärit eivät
  siirry STEP-tuonnissa; tuodut tiedostot käyttävät neutraalia pintaväriä.
  SAVO TWISTin varsinaista tuotemallia ei saatu; aiempi asennusprofiili säilyy.
  Häfelen, Blumin ja muiden valmistajien kattavampi mallivalikoima on jatkotyötä.
- hansgrohe Raindance Select E 300:n lähdesivu ilmoittaa tuotteen poistuneeksi;
  tieto näkyy nyt kortissa. Suomen saatavuutta ei päätellä lähdesivusta.

## V0.44.0 — tuotekirjaston ensimmäinen versio

- Projektikirjaston kolmas välilehti **Tuotekirjasto**: 43 tuotetta ja tuoteperhettä,
  haku nimellä, valmistajalla tai tuotekoodilla sekä käyttötarkoituksen rajaus.
  Ei uusia mallinnustyökaluja tai jatkuvia taustahakuja. Ei valmistajien kuvia,
  logoja tai CAD-aineistoa julkisessa sovelluspaketissa.
- SAVO: TWIST, ONE, ELEVATOR, NELIÖ, VOLTTI USB-C, SPIN USB-C, DUE ja WallDisQ.
  Valmistajan tuotekoodit ja versiot, asennusmitat ja lähteet. Seitsemälle tuotteelle
  aukkoluonnos, neljälle myös upotustila. DUE:n kahden reiän välimatkaa ei arvata.
  Asennusluonnokset ovat yksinkertaisia Nivon CAD-muotoja; kansi, johdot,
  kiinnikkeet, huullokset ja valmistuksen vaatimat nurkkasäteet eivät sisälly.
  Pinta on z=0:ssa ja upotustila sen alapuolella. Aukkoluonnos toimii olemassa
  olevassa Cutissa tasoleikkurina; asentaminen ei muuta kohdegeometriaa itsestään.
- Hettich: Sensys, Novisys, Quadro, Actro 5D, AvanTech YOU, TopLine XL ja
  AvanTech YOU Illumination. Häfele: Free space/flap/up, Slido D-Line11,
  Loox5 LED 2062/2068 ja 24 V:n haaroitusjohto. Lisäksi Blumin ja GRASSin
  hela-/laatikkoperheet sekä Geberitin, Oraksen, GROHEn, hansgrohen ja
  Gustavsbergin saniteetti-/hanatuotteiden lähteet.
- **Tuo tuotteen 3D-tiedosto** käyttää olemassa olevaa STEP/STP-, GLB/glTF- tai
  STL-tuontia. Valmistajan palvelusta haetun tiedoston voi samalla tallentaa
  Omiin osiin. Moniosaiset tuotteet ryhmitetään kokoonpanoksi. Tuotekoodi,
  nimi, lähde ja esitystapa tallentuvat osan tietoihin ja kulkevat projektissa,
  kirjastokopioissa sekä pilven projektidatassa. Alkuperäistä geometriaa ei skaalata
  automaattisesti tuotekortin mittoihin. Tuotetieto ei takaa myöhemmin muokatun
  geometrian vastaavan ostettavaa tuotetta.
- Lähteet tarkistettu 14.10.2026. Kortti näyttää dokumentaation lähdealueen;
  kansainvälisiä koodeja ei väitetä Suomessa saataviksi. Tämä on toimituksellinen
  aloitusvalikoima, ei vahvistettu myyntijärjestys. Tuotesivut voivat vaatia
  valmistajan kirjautumisen. Revit, IFC ja DWG tarvitsevat erillisen muunnoksen.
- **Jatko:** valmistajakohtaiset jakelu-/muokkausluvat ja niiden jälkeen kevennetyt
  suoraan lisättävät tuotemallit, suomalaiset tuotenumerot ja saatavuus,
  asennuspisteet sekä mallin korvaaminen tilavarauksen sijaintiin. Valaisimille
  valopinta ja mitattuun valovirtaan perustuvat asetukset, helasarjoille
  kokoonpanokohtaiset asennus- ja porauskuviot. Sähkötuotteiden yhteensopivuuden
  laskentaa ja asennussuunnittelua ei ole toteutettu tässä versiossa.

Keskeiset alkuperäislähteet:
[SAVO TWIST](https://savo.fi/tuote/pistorasia-twist/),
[SAVO ONE](https://savo.fi/tuote/pistorasia-one/),
[SAVO VOLTTI](https://savo.fi/tuote/pistorasia-voltti-usb-c/),
[Hettich CAD](https://www.hettich.com/en-dk/services/hettich-cad),
[Häfele Loox5](https://files.hafele.co.uk/catalogfiles/www/25-1014.pdf),
[GRASS CAD](https://www.grass.eu/fr/tec-center/donnees-cad/),
[Geberit BIM](https://www.geberit.fi/saniteetti-ja-putkistojarjestelmat/digitaaliset-tyokalut-ja-sovellukset/bim/).
Kaikkien korttien lähdeosoitteet ovat `src/model/productCatalog.ts`:ssä.

## V0.43.0 — tasajako ja muotosarjat leikkureina

- Sama **Tasajako** oikeassa paneelissa, kontekstivalikossa ja toimintojen haussa:
  kopioi valinta tai järjestä nykyiset osat. Suljettu kokoonpano pysyy yhtenä
  yksikkönä; kansioryhmän osat voidaan järjestää erikseen.
- Ulkoreunojen kokonaismitta vähentää osien todelliset akselinsuuntaiset mitat
  ja jakaa vapaan tilan tasan. Vaihtoehtoina viitekohtien kokonaismitta,
  jakoväli ja vapaa väli. Viitekohtana alku-/alareuna, keskipiste tai loppu-/yläreuna.
  X/Y/Z ja molemmat suunnat. Ensimmäinen yksikkö pysyy paikallaan.
- Määrä sisältää alkuperäisen. Mitta-/apuviivoille yksi lähtöviiva tai kaksi
  rinnakkaista rajaviivaa; N väliä = N+1 viivaa. Molempien rajojen tunnisteet
  säilyvät myös määrää muutettaessa. Useita viivoja voi järjestää luomatta kopioita.
- Kevyt kaavio, vapaan välin lukema ja päällekkäisyyden ilmaisu. Liian lyhyt
  ulkomitta, Hold, väärä viivasuunta ja projektin rajat estävät hyväksymisen.
  Kopioiden linkit, ryhmät ja nimet käyttävät olemassa olevaa kopiointia.
- **Muokkaa tasajakoa** löytyy mistä tahansa sarjan jäsenestä myös uudelleenavauksen
  jälkeen. Määrän pienentäminen poistaa loppupään kopiot; järjestäminen ei muuta
  osamäärää. Kopioiden suunnan vaihto säilyttää suoran sarjan. **Vapauta tasajako**
  jättää osat paikoilleen. Koko muutos on yksi Peru-toiminto. Tiedostot, pilven
  projektidata, projektien yhdistäminen ja osakirjasto säilyttävät jaon viitteet.
- **Toteuta ja käytä leikkureina** asettaa koko sarjan Cutin työstökappaleiksi;
  käyttäjä valitsee kohteet. Suljettu tasomuoto leikkaa valittujen kohteiden läpi
  oman tasonsa normaalin suunnassa. Paksu työstökappale leikkaa oman tilavuutensa.
  Tasomuoto ei ole leikattava tilavuuskohde; virheellinen roolien vaihto estetään.
- Nykyinen jako on suora pääakselin suuntainen. Viivan mitta tarkoittaa
  jakosuuntaista siirtymää; viivojen pitää olla rinnakkaiset. Enintään 1 001
  yksikköä sekä projektin 10 000 osan / 1 000 viivan rajat.
- Jatkokehitys: vapaan suunnan ja kokonaismitan poiminta mallista kahdella pisteellä;
  päihin erikseen määritettävät marginaalit; aidosti muokattava leikkaushistoria,
  jossa jaon muuttaminen korvaa vanhat reiät. Nykyinen Cut on geometriamuutos:
  peru leikkaus, muuta jakoa ja tee Cut uudelleen. Pelkkä leikkurien siirtäminen
  ei palauta poistettua materiaalia.

## V0.42.1 — Cutin linkitysvalinta ja Tab

- Ennen linkitettyjen kohteiden Cut-laskentaa valinta: **Tee uniikeiksi ja leikkaa**,
  **Säilytä linkitys ja leikkaa** tai **Takaisin valintoihin**. Kohde- ja
  työstökappalevalinnat sekä työstökappaleiden säilyttämisasetus pysyvät mukana.
- Uniikiksi tekeminen koskee vain valittuja kohteita; muut kopiot säilyvät.
  Leikkaus ja linkityksen poisto tehdään yhtenä historiatoimintona. Virhe tai
  keskeytys ei irrota linkityksiä. Hold estää edelleen lukittujen kohteiden muokkauksen.
- Pitkän laskennan voi keskeyttää ikkunasta tai Escillä ja yrittää samoilla valinnoilla uudelleen.
- Tab vaihtaa Cutin aktiivista valintaryhmää myös paneelin valintaruutujen jälkeen.
  Tekstikentät ja pudotusvalikot säilyttävät tavallisen Tab-käytön. Join toimii ennallaan.

## V0.42.0 — renderin kohina, valonäytteet ja GPU-kuorma

- Raakojen, peräkkäisten valonäytteiden keskiarvoista arvioidaan varianssi GPU:lla.
  Kohinanpoisto käyttää sekä tätä että saman pinnan paikallista vaihtelua, jotta
  harvat kirkkaat pisteet eivät jää suodattumatta. Kaksi suodatusvaihetta;
  albedo, normaalit ja syvyys suojaavat muotoa ja syykuviota. Peilit/lasi käsitellään
  varovaisesti. Suodatettua kuvaa ei syötetä valon kertymään.
- Analyyttisten valojen valinta huomioi kirkkauden, etäisyyden, valopinnan suunnan
  ja vastaanottavan pinnan suunnan. Valinta ja BSDF-osumien MIS käyttävät samaa
  todennäköisyyttä. 10 % tasainen sekoitus säilyttää kaikki valot mukana;
  yli 64 valon kohtaus käyttää kevyttä tasaista valintaa.
- GPU-aikamittaus ohjaa 1–8 laatan laskentaeriä. Vain yksi erä jonossa;
  aikaleiman puuttuessa käytetään valmistumisrajaa. Sama jono myös PNG-laskennassa.
  Kuvan suodatus esitetään enintään noin 12 kertaa sekunnissa, mutta ensimmäinen,
  tarkkuusvaiheen aloitus ja lopputulos näytetään aina. Kameran liike ei luo
  muuttumattomien opastemateriaalien shader-ohjelmia uudelleen.
- Alkuperäiset CC0 2K-kartat männylle, tammiviilulle ja amerikkalaiselle pähkinälle.
  Niitä käytetään pienessä renderin materiaalivalikoimassa; mallinnus säilyttää
  kevyemmät kuvat. Atlas käyttää korkeintaan 128 MiB ja laitteiston rajoja.
- Toistettava yksityisen mallin vertailu samalla kameralla: minuutin kuva ja
  500 näytettä, saunan sisäpuoli sekä allaskaluste/peili. Kuvia ja asiakasmallia
  ei julkaista. Palautuspiste: `render-before-quality-pass-v0.41.1`.
- Jatkotyö: näkyvyystietoa hyödyntävä valonhaku peitettyihin LED-uriin sekä
  heijastuksen takaisen pinnan opasteet. Nämä eivät sisälly nykyiseen suodattimeen.
- Seurattava satunnainen virhe: kuvatyön peruutuksessa kerran havaittu poistuneen
  shader-ohjelman valmistumistarkistus (WebGL 1281). Uusinnat ja viivästetty
  käännös läpäisivät; juurisyytä ei ole vielä toistettu hallitusti.

## V0.41.1 — mallinnuksen toistuvat pysähdykset

- Pilven automaattinen lähetys kahdeksan sekunnin työskentelytauon jälkeen.
  Tarkistusajastin, ikkunaan paluu ja verkon palautuminen käyttävät samaa jonoa.
  Hidas lähetys ei kerää päällekkäisiä tarkistuksia; käsisynkronointi toimii heti.
- Paikallisen mallin vastaavuus ja pilven sisältötunniste tarkistetaan workerissa.
  Muuttumattoman mallin tunniste käytetään uudelleen, toisen välilehden kirjoitus
  tarkistetaan edelleen ja alkuperäinen tiedosto-/pilviversioiden tunniste säilyy.
- Kynän liikkuva esikatselu on erotettu valmiista mittaviivoista. Osoittimen liike
  ei luo niiden tekstejä, tekstuureja tai shader-ohjelmia uudelleen.
- Mitattu käyttäjän 625 osan mallin paikallisella kopiolla. Jatkoseuranta:
  suuren mallin historiatallennus ja tiheän geometrian tartuntahaku ovat yhä
  mahdollisia erillisiä kuormituskohtia; tätä korjausta ei pidetä niiden ratkaisuna.

## V0.41.0 — kirkkaiden pintojen kohina ja kuvan viimeistely

- Kohinan pehmennys vertailee HDR-värien suhteellista eroa. Sama suhteellinen
  kohina ei enää jää kirkkaalla pinnalla suodattamatta vain kirkkauden takia,
  eikä pehmennys heikkene automaattisesti näytemäärän kasvaessa.
- Kerran näkymän muuttuessa piirrettävät pinta-, normaali- ja syvyyskartat
  suojaavat värejä, puunsyitä, pinnan reliefiä ja geometrian rajoja. Lasi- ja
  peilipinnoissa suodatus on varovaisempi. Alkuperäisiä valonäytteitä ei muokata.
- Kuvan ilme: Realistinen, Filminen, Pehmeä hehku, Unenomainen ja Utuinen.
  Valinnaiset tehosteet säilyttävät terävän peruskuvan ja lisäävät hehkua/utua
  sen päälle. Voimakkuuden säätö toimii myös valmiissa renderissä ilman uusia
  valonäytteitä, ja nolla poistaa tehosteen kokonaan.
- Ilme säilyy projektissa, nopeassa ja tarkentuvassa näkymässä sekä PNG-viennissä.
  Taustalla laskettava kuva säilyttää käynnistyshetken ilmeen. Esikatselun
  lisäpuskurit on rajattu; realistinen/filminen ilme ohittaa tehostepuskurit.
- Jatkotyö: oikea tilallinen sumu, savu ja valokeilat tarvitsevat volumetrisen
  valonkuljetuksen. Nykyinen utu on kuvan viimeistelyä. Kohinanpoiston seuraavia
  vaiheita ovat varianssin arviointi sekä heijastusten ja läpinäkyvyyden lisäopasteet.

## V0.40.5 — suljetun rajauksen pinta osan muokkaustilassa

- Muokkaustila erottaa olemassa olevan pinnan jakamisen ja uuden pinnan lisäämisen
  tyhjään kohtaan. Altaan aukon yli suljettu käyrä + kynäviiva muodostaa pinnan samaan osaan.
- Uusi pinta seuraa piirtotason suuntaa myös vastakkaisella käyrän piirtojärjestyksellä.
  Push/Pull liittää sisään pursotetun ulokkeen altaan tilavuuteen.
- Olemassa olevat pinnat ja umpinaisen geometrian sisäpuoli rajataan pois lisättävästä
  alueesta. Hold, linkitetyt kopiot, tallennus sekä Peru/Palauta säilyvät käytössä.

## V0.40.4 — Bézier-kaaren ja kynäviivan yhteinen pinta

- Kaari ja suora voivat jo rajata ehjän pinnan. Sulkeutumistarkistus ei enää
  vaadi kolmea reunaa kuten suorista sivuista koostuva monikulmio.
- Bézierin **Valmis viiva** ja sen jälkeen kynällä päätepisteestä toiseen
  piirretty suora muodostavat pinnan heti sulkemisessa, myös aiemmin tallennetulla
  käyrällä. Tarkka kaari säilyy; pinta toimii Push/Pullilla.
- Avoin rako ja edestakainen päällekkäinen suora säilyvät viivoina.

## V0.40.3 — Supabasen käyttöönoton valmistelu

- Hallinta-API:n käyttöönottokomento: ensin kuiva-ajo, sitten puuttuvat migraatiot,
  kirjautumisosoitteet ja sähköpostipohjat. Vain Nivon oma projekti hyväksytään.
  SMTP-asetukset säilyvät; komento voi asettaa julkiset arvot GitHubiin.
- Suomenkielinen kirjautumisviesti sisältää linkin sekä koodin toisella laitteella
  luettavaa sähköpostia varten. Koodi hyväksytään Enterillä lähettämättä uutta viestiä.
- Pilvilista päivittyy synkronoinnin yhteydessä. Käyttöönoton toistaminen ei korvaa
  saman projektin jo luotua pilvitunnistetta.
- Build estää puutteellisen asetuksen ja salaisen ylläpitoavaimen päätymisen selaimeen.
- Nivon oma Supabase-projekti, tietokanta ja yksityinen tiedostosäiliö otettu käyttöön
  13.10.2026. Oikealla palvelulla testattu käyttäjäeristys, kahden selainympäristön
  synkronointi, offline-paluu ja rinnakkaisten muutosten säilytys.
- Avoinna: oman sähköpostin toimituksen ja kahden fyysisen laitteen kirjautumisen
  varmistus. Oletusposti sallii vain Supabase-tiimin osoitteet; oma SMTP tarvitaan
  laajemmalle käyttäjäjoukolle sekä suomenkieliseen linkki-/koodiviestiin.

## V0.40.2 — siirron Shift-viite

- Shift päivittää aktiivisen siirron viitteen heti myös ilman uutta hiiren liikettä.
- Näkyvä viitepiste ja selite kohdistimen luona, erillinen siirron päätepiste
  sekä niitä yhdistävä katkoviiva. Valittu akseli tai paikallinen vino suunta säilyy.
- Kohteen keskipiste poimitaan näkyvältä pinnalta eikä umpinaisen kappaleen sisältä.
  Tarkkoja viitteitä ei pyöristetä ruudukkoon.
- Saman kappaleen kaarevan reunan segmenttien pisteytys seuraa osoitinta;
  kameran etäisyysetu ei siirrä viitettä viereiseen segmenttiin.

## V0.40.1 — mallilistassa suunnistaminen ja pyöristetyn reunan viite

- Projektikohtainen ryhmien sulkemismuisti selaimessa. Listan piilotus,
  Kappaleet/Mitat-vaihto ja sivun lataus säilyttävät tilan. Uuden osan valinta
  avaa vain sen omat yläryhmät ja vierittää rivin näkyviin myös virtuaalilistassa.
  Valittujen osien yläryhmät korostuvat; käyttäjä voi yhä sulkea valitun haaran.
- Rivivärit osille ja ryhmille, palettipainike ja rivin oikea napsautus.
  Esiintymäkohtainen `listColor` säilyy tiedostossa, kopioissa ja tuonnissa;
  materiaali ei muutu. Hold sallii tämän listan visuaalisen merkinnän.
- Paikannus korostaa osan viideksi sekunniksi myös geometrian läpi. Uusi
  paikannus aloittaa ajan uudestaan. Ei geometrian uudelleenlaskentaa,
  poimintakohteiden muutoksia tai korostusta tallennettuun PNG-kuvaan.
- Suorakulmion/ympyrän Shift-viite hakee näkyvän reunan myös piirtotason
  ulkopuolelta ja projisoi pisteen aktiiviseen tasoon. Ruudukko ei pyöristä
  poimittua mittaa; pyöristetty ovi säilyy alkuperäisenä.

## V0.40.0 — pilvisynkronoinnin pohja, reunakäsittelyt ja valinnan selkeys

- Supabase Auth + yksityinen tiedostosäiliö + käyttäjäkohtainen projektitaulu.
  Paikallinen tallennus ensin; vain erikseen käyttöön otetun avoimen projektin
  synkronointi. Sisältöhash, palvelimen atominen versiotarkistus, offline-paluu
  ja rinnakkaisten versioiden säilyttäminen. Oma Supabase-projekti ja julkiset
  selainasetukset tarvitaan käyttöönottoon. [Tarkemmat rajat](cloud-sync.md).
- Reunakäsittelyjen lähteet säilyvät ketjuna. Päädyn Push/Pull uusintaa myös
  aiemmat pyöristykset; poistaminen etenee uusimmasta kohti aiempia. Vanhan
  suorakulmaisen aihion nurkkapyöristys voidaan palauttaa vain tarkan
  uudelleenrakennuksen ja tilavuusleikkauksen vastaavuustodistuksen jälkeen.
- Mallilistassa ei erillistä Hold-merkkiä nimen vieressä; lukkopainike riittää.
- Valinnan ensimmäisellä pikarivillä **Lukitse / Vapauta**, **Piilota** ja **Haamu**.
  Sekavalinnan vapautus koskee vain valittuja osia, myös perityssä ryhmälukossa;
  muut osat pysyvät lukittuina. Haamu vaihtuu toisella painalluksella Solid-tilaan.
  Ryhmän lukitus ja vapautus koskevat koko alipuuta, myös erikseen lukittuja osia.
- Ryhmävalintaan yhteiset materiaalit, värit, siirto, kopio, kierto, skaalaus,
  poistaminen, linkitys ja määrät. Yksittäisen osan muokkaus vaatii yhden valinnan.
  Vapaassa monivalinnassa voi nimetä osat yhteisellä pohjanimellä ja järjestysnumerolla.
- Kappale/rakennusviiva ja viitepoiminta oikeaan paneeliin; tarkemmat käyttötavat
  lisäasetuksissa. Muokkaustilan banneri ja pinnattu mallilista eivät peitä valintoja.

### Pilven jatko ennen laajaa tuotantokäyttöä

- Versioiden säilytysraja, käyttämättömien tiedostojen palvelinsiivous, tilakiintiöt
  ja pilviprojektin poistaminen. Nykyiset tiedostoversiot säilyvät muuttumattomina.
- Suljettujen paikallisten projektien jonon synkronointi, nimettyjen vertailuversioiden
  siirto ja ristiriitojen vertailun suora avaaminen.
- Oman SMTP-palvelun käyttöönotto, sähköpostitoimitus ja kirjautuminen kahdella
  fyysisellä laitteella. Oikean Supabasen synkronointi on varmennettu kahdessa
  erillisessä testiselaimen ympäristössä; palvelujäljitelmä säilyy regressiotesteissä.

## V0.39.0 — mittakuvien merkinnät ja projektiversioiden vertailu

- Projektikirjastolla on oma kirjastokuvake; tiedoston avaaminen säilyttää kansiokuvakkeen.
- Projektin muutokset: nimettyjä vertailuversioita selaimeen tai aiempi .nivo-tiedosto.
  Pysyvät osatunnisteet yhdistävät versiot. Lisätyt osat vihreitä, poistetut punaisia
  haamuja ja muokatut meripihkan värisiä. Muokattujen aiemman geometrian voi näyttää
  haamuna. Värit eivät muuta mallin materiaaleja. Numeroitu, suodatettava luettelo,
  osaan kohdistaminen ja CSV-vienti. Pelkkä tiedoston aikaleima ei muodosta muutosta.
- Mittakuvat ovat tarkkoja ortografisia CAD-projektioita: etu-, taka-, oikea, vasen,
  ylä- ja alakuva. Sama suuntakehys ohjaa projektioita, pistepoimintaa ja mitoitusta.
- Yhteiset arkkimerkinnät tavallisiin mittakuviin, leikkauksiin ja mitta-arkkeihin:
  itsenäinen tekstilaatikko ja aluekorostus, siirto/koon säätö, tekstin ja värin
  muokkaus, piilottaminen ja poisto. Merkinnät ovat paperimillimetreissä; ne eivät
  deformoi tai muuta mallin geometriaa. PDF/SVG sisältää näkyvät merkinnät.
- Mallin sopivassa suunnassa olevat dimensiot näkyvät projektiossa. Mitta-arkin
  projektioon pääsee tuplaklikkaamalla mitoittamaan; samat dimensiot palaavat arkille.
  Arkkimerkinnän lisääminen tallentaa myös uuden arkin määrittelyn.
- Huomautustyökalulla voi mallinäkymässä asettaa tekstilaatikon yhdellä napsautuksella
  poistamalla Kohdistusviiva-valinnan. Aiempi kohdistuspiste + laatikko -tapa säilyy.
- Projektion tyhjä piiloviivajoukko ei kaada 2D-muodon mittakuvaa. CAD-kaaret
  säilyvät vektorikäyrinä. Reunaltaan katsottu taso näkyy viivana.

### Jatko — piirustuspaketit ja muutosten dokumentointi

- Vapaasti suunnatut nimetyt ortografiset projektiot ja detaljinäkymät, useat
  paperikoot sekä arkin vapaa sommittelu. Kuusi pääsuuntaa ja vapaasti asetettavat
  mallin leikkaustasot ovat tämän version lähtökohta.
- Malliin sidotut muutosalueet/revisiopilvet ja arkin revisiotaulukko. Nyt arkin
  korostus on itsenäinen paperimerkintä, osamuutosvertailu erillisessä 3D-näkymässä.
- Materiaalikohtaiset leikkausmerkinnät: betoni, puu, eristeet, levyt ym. Valitaan
  käytettävät suomalaiset/ISO-piirustusohjeet ja tarkistetaan niiden käyttöehdot
  ennen merkkikirjaston toteutusta. Nykyinen yleinen viivoitus ei väitä materiaalin
  tyyppiä eikä insinööritoimiston hyväksyntää.
- Etäversiohistoria ja paikallisen versiovertailun kytkeminen pilviristiriitoihin.
  Käyttäjäkohtaisen synkronoinnin ensimmäinen toteutus on V0.40.0:ssa.

## V0.38.0 — mobiilityötila ja projektin siirto laitteiden välillä

- Puhelimen työtilavalikko, aina näkyvä koko näytön painike, 54 px työkalupalkki,
  avattavat mallilista, näkymäasetukset ja ominaisuudet. Näppäimistölle varataan
  tila VisualViewportin mukaan; pysty- ja vaakakäyttö sekä safe area -reunat.
- Kosketuspiirto ja numeroiden tarkistus erotettu: perusmuodot, Push/Pull ja Offset
  hyväksytään erikseen. Hiiri säilyttää välittömän hyväksymisen myös pienessä ikkunassa.
  Tabletin kosketus käyttää samaa tarkistusvaihetta. Kahden sormen navigointi ei hyväksy muotoa.
- Ensimmäinen napautus voi avata fullscreenin, aloitusehdotuksen voi poistaa käytöstä.
  Tukemattomassa selaimessa näytetään kotinäyttöasennuksen ohje. Manifesti ja kuvakkeet,
  ei vielä palvelutyöntekijää/offline-käyttölupausta.
- Renderin asetuspaneeli suljettavissa puhelimella. Työpöydän paneelivalinta säilyy erikseen.
- Jatka toisella laitteella: .nivo-siirtotiedosto, käyttöjärjestelmän tiedostojako tai lataus.
  Pysyvä projektitunnus ja SHA-256-sisältöversio; sama sisältö käyttää olemassa olevaa
  projektia, eroava sisältö avataan erilliseen kirjastoprojektiin. Vanhojen tiedostojen
  Avaa- ja Lisää malliin -käytös säilyy. Historiat pysyvät paikallisina.
- Jatko synkille: palvelu ja tunnistautuminen, versioitu etätallenne,
  compare-and-swap-kirjoitus, offline-muutosjono ja ristiriitojen vertailunäkymä.
  Eri laitteiden tiedostoja ei saa yhdistää pelkän aikaleiman perusteella.
- Jatko mobiilille: fyysisen iPhonen/Safarin näppäimistö ja kotinäyttöasennus,
  pitkäpainalluksen kontekstivalikko, kynän kosketuskohtainen segmentin tarkistus
  ja yhtenäinen kosketusnavigoinnin opastus kaikissa työtiloissa.

## V0.37.0 — projektikirjasto, mallien tuonti ja 3D-vienti

- Useita selaimeen tallentuvia projekteja, omat historiat, nimeäminen,
  monistaminen, haku, pienkuvat ja poisto. Vanha automaattitallenne siirtyy mukaan.
- Avaa projekti ja Lisää malliin ovat erilliset toiminnot. Tuonti säilyttää
  ryhmät, kokoonpanot, tyypit, materiaalit, merkinnät ja sisäiset linkit omilla
  tunnisteillaan. Nykyinen kamera ja valaistus säilyvät. Peru poistaa koko tuonnin.
- Tallenna valinta kirjastoon: omat osat uudelleenkäyttöön toisissa projekteissa.
- STEP/STP tuodaan tarkaksi CAD-geometriaksi. STL ja GLB/glTF tuodaan kevyinä
  kolmiomalleina; yksikkö ja yläsuunta ovat valittavissa. GLB/glTF säilyttää
  pintavärit, UV:t sekä tuetut albedo-, normaali-, karheus- ja metallisuuskartat.
  glTF:n .bin- ja kuvatiedostot valitaan samalla kertaa. Etäviitteitä ei haeta.
- 3D-vienti: STL tulostukseen (mm, tarkkuus, reunojen sulkeutuneisuuden tarkistus,
  valinta/näkyvät osat, yhteinen sijoitus alustalle), STEP tarkalle geometrialle,
  GLB materiaaleineen. Viipalointi ja tulostimen ohjaus tehdään slicerissa.
- Valintapaneelin ensisijaiset asiat: nimi, ryhmä, tyyppi, Piilota, Hold sekä
  yksi Linkitetty/Uniikki-tilapainike. Uniikki osa linkitetään käyttäjän valitsemaan
  lähtöosaan; mitään aiempaa perhettä ei muisteta automaattista paluuta varten.
- Oikean napin valikko: tavalliset toiminnot näkyvissä, Muokkaa/Järjestä/
  Tallenna ja vie alavalikoissa, yhtenäiset ikonit ja näppäinvihjeet. Selaimen
  oma kontekstivalikko estetään sovelluksen alueella myös valikon päällä.
- Koko näytön Esc käyttää tuettua Keyboard Lockia. Ilman tukea selaimen
  poistumispainallus säilyttää työkalun; seuraava Esc peruu Nivon toiminnon.
- Kirjasto lukee listat pelkistä metatiedoista. Projektin vaihto vapauttaa vanhan
  CAD-historiavälimuistin, ja kolmiomallin siirto käyttää valmista näyttöverkkoa.
- Jatko: DWG/SKP/IFC ja 2D-tuonti, pakatut glTF-mallit, animaatiot, tuodun
  kolmiomallin CAD-muokkaus, 3MF sekä varsinainen tulostuksen korjaus/viipalointi.
  STEP-tuonti säilyttää geometrian ja sijoittelun; alkuperäisiä CAD-reseptejä,
  kokoonpanonimiä ja kaikkia valmistajakohtaisia metatietoja ei luvata palauttaa.

## Backlog — yhteinen Shift-viitekehys ja piirron aloitus toisesta kappaleesta

Käyttäjän tarkennus 12.10.2026. Suunniteltu jatkokehitys; ei vielä toteutettu.

- Keskeinen käyttötapaus: käyttäjä piirtää aktiivisen kappaleen pinnalle, mutta
  haluaa poimia **jo piirron aloituspisteelle** Shift-viitteen toisesta kappaleesta.
  Esimerkiksi kaapin pinnalle alkava piirros kohdistetaan viereisen kaapin
  kulmaan, reunaan tai keskipisteeseen.
- Aktiivinen kappale, muokkauskohde ja piirtotaso säilyvät. Viitekappale antaa
  kohdistuksen; sen osoittaminen ei siirrä piirtoa sen pinnalle, vaihda valintaa
  tai muuta viitekappaletta. Myös eri korkeudella tai eri tasossa oleva viite
  pitää voida hyödyntää aktiivisessa piirtotasossa.
- Viitepiste, siitä johdettu magenta suunta ja piirtotasolla toteutuva
  aloituspiste erotetaan selvästi. Suuntapalaute näkyy tarvittaessa osan läpi.
  Numeerinen mitoitus ja ruudukko eivät saa siirtää vahvistettua aloituspistettä.
- Toteutetaan yhteisenä toimintalogiikkana kynälle, muototyökaluille sekä
  mitta- ja apuviivoille, sekä soveltuvin osin muiden työkalujen viitehakuun.
  Sama periaate tarvitaan ennen ensimmäistä pistettä ja kesken toiminnon,
  sekä osan muokkaustilassa että tavallisessa mallintamisessa.
- Säilytetään toimiva Push/Pullin tavoitehaku ja siirron/kierron viitetartunta.
  Tarkennetaan käyttäjän esimerkeillä ennen toteutusta viitteen poiminnan,
  suunnan lukituksen ja Shiftin vapautuksen suhde sekä se, miten ulkoinen viite
  kohdistetaan aktiiviseen tasoon. Tavoite on sama, ennakoitava käytös ilman
  ylimääräisiä työkalun tai muokkaustilan vaihtoja.
- Hyväksymistestit: suorakulmion ja kynäviivan aloitus toisen osan kulman,
  reunan ja keskipisteen viitteellä; eri syvyys/korkeus; vino aktiivinen pinta;
  muokkaustila; viitteen vaihto ja peruminen. Aloituspiste, aktiivinen pinta
  ja viitekappale säilyvät oikeina koko eleen ja numerosyötön ajan.

## V0.36.13 — renderin pintamateriaalit ja pyöristetyn päädyn Push/Pull

- Tarkentuvan renderin ja kuvatallennuksen materiaalit säilyvät omilla
  pinnoillaan. Yhden pinnan maalaus tai LED-materiaali ei siirrä seuraavien
  osien materiaaliviittauksia. Korjaus tehdään renderin geometriakopioon;
  projektin osia ei tarvitse jakaa uusiksi komponenteiksi.
- Materiaaliviittausten tallennustarkkuus päivittyy myös silloin, kun
  pintamaalaus kasvattaa materiaaliryhmien määrän yli 255:n muuttamatta
  kolmioverkon kokoa. UV-koordinaatit ja materiaalien reaaliaikaiset
  päivitykset säilyvät.
- Reunakäsitellyn osan yksiselitteinen ulkopääty muutetaan säilytetystä
  lähdemuodosta, minkä jälkeen samat pyöristykset/viisteet rakennetaan
  uudelleen. Reunojen kohdistus tarkistetaan geometriasta; muuttunutta
  reunaindeksiä ei arvata. Pyöristysten mittoja voi muuttaa edelleen.
- Kasvatus, lyhennys, kierretyt osat, pintavärit ja aihiomitat on huomioitu.
  Offsetilla erotettu sisäpinta säilyy paikallisena tasku-/pursotuspintana.
- Rajaus: tämä ei ole yleinen kaikkien aiemmin muokattujen BRep-kappaleiden
  pyöristysten tunnistus. Korjaus hyödyntää tallessa olevaa reunakäsittelyn
  lähdettä. Jos kokonaisen päädyn muutos vaihtaisi lähteen topologiaa niin,
  ettei reunoja voi kohdistaa varmasti, muutos hylätään selitteellä ja
  alkuperäinen osa säilyy.

## V0.36.12 — sylinterin päätypinnan Offset

- Leikatun sylinterin kehän reunakäyrän sisäinen kiertosuunta ei enää käännä
  sisennystä ulospäin. Ulkoreuna pienenee ja reiän reuna kasvaa annetun mitan.
- Skaalattu tasopinta tunnistetaan laskennassa tasoksi myös silloin, kun
  geometriaydin tallentaa sen B-spline-pintana. Toimii molemmilta päädyiltä,
  kierretyllä kappaleella sekä ympyrästä positiiviseen tai negatiiviseen
  suuntaan pursotetulla sylinterillä.
- Liian suuri ympyrän sisennys hylätään myös silloin, kun se taittuisi
  keskipisteen yli takaisin näennäisesti kelvolliseksi ympyräksi.
- Akseliskaalaus poistaa erillisen geometriaytimen kopiosta vanhat
  piirtoverkkotiedot ennen muunnosta. Tarkka geometria, materiaalien pintaviitteet
  ja pääasiallisen näkymän välimuisti säilyvät.
- Offsetin esikatselu, Push/Pull, läpireikä, Peru/Palauta ja uudelleenavaus
  testattu. Kaarevan sylinterikyljen offset on edelleen eri, tukematon toiminto;
  tämä korjaus koskee tasomaisia päätyjä ja muita tasopintoja.

## V0.36.11 — lukittu osa löytyy monivalinnasta

- Valitun lukitun osan kohdalla näkyy lukkokuvake ja lämpimän sävyinen
  reunakorostus. Osan materiaalia ei vaihdeta lukituksen vuoksi.
- Valinnan tiedoissa näkyvät lukittujen määrä suhteessa koko valintaan,
  osien nimet ja lukituksen lähde: osan oma Hold tai nimetty yläryhmä.
- Jokaisen lukitun osan vierestä voi keskittää kameran kyseiseen osaan
  menettämättä huolellisesti koottua monivalintaa. Piilotetun osan kohdalla
  kerrotaan piilotuksesta ja keskittäminen odottaa näkyviin palauttamista.
- Mallilistassa Hold-merkki näkyy ilman osoittamista. Ryhmästä periytyvä
  lukitus tunnistetaan; muokkauskontekstin ulkopuolisuus ei luo Hold-merkkiä.
- Merkinnät seuraavat lukituksen vapautusta, ryhmälukitusta ja Peru/Palauta-
  historiaa ilman uutta CAD-laskentaa. Nykyiset muokkaussuojaukset säilyvät.
- Valintatesteissä löytynyt sivukorjaus: maalaustyökalun vasen veto ei enää
  käynnistä samalla kameran kiertoa, kun tyhjästä tilasta vedetään valintaruutu.

## V0.36.10 — kumitus käsittelee korostettua rajausta

- Jakoviivan päätepisteen lähellä kohdistin voi olla osan siluetin ulkopuolella,
  vaikka viiva on kumittimen tartuntasäteen sisällä. Tämä ei enää aloita tyhjän
  tilan valintaa vaan kumittaa korostetun rajauksen.
- Muokkaustilan tarkistus käyttää korostetun rajauksen osaa, vaikka hiiren
  alla oleva pinta tai erillinen piirrosviiva kuuluisi viiteosaan.
- Napsautuksen järjestys vastaa korostusta: apuviiva, pinnan jakoviiva, erillinen
  piirrosviiva. Muut osat, aidot ulkoreunat ja lukituksen suojaukset säilyvät.
- Erillisen piirrosviivan päätepisteestä aloitettava kynäviiva löytää sen alla
  olevan pinnan myös siluetin rajalla, missä hiiren säde voi ohittaa pinnan.
  Pinnan tulee todella sisältää tartuntapiste; eri tasossa olevaa viitettä ei
  siirretä väkisin pinnalle.

## V0.36.9 — kynän tartunta pinnan jakamista varten

- Jaetulta reunalta alkavan viivan pinta ratkaistaan osan oman geometrian
  perusteella ennen muiden osien tai mittaviivojen viitteitä. Lähellä oleva
  ylempi piste ei enää estä oikean piirtopinnan tunnistusta perspektiivissä.
- Saman pinnan reuna on vahva kohde. Reunaan kuuluvat kulmat, keskipisteet ja
  apuviivaristeykset säilyvät täsmällisinä; myös pinnan keskipistettä voi käyttää
  välipisteenä. Reunasta reunaan päättyvä viiva jakaa muokattavan pinnan heti.
- X/Y/Z-, Shift- ja R-suunnassa haetaan suunnan ja reunan todellinen risteys.
  Vino reuna ei jätä päätepistettä hiiren projektion vuoksi pinnan sisäpuolelle.
- Numerosyöttö ohittaa tartunnan. Liian lyhyeksi kirjoitettua viivaa ei jatketa
  reunaan automaattisesti. Tietoinen Shift-viite voi edelleen olla eri tasossa;
  vapaa piirto voi yhä liittyä kolmiulotteisiin pisteisiin.
- Komponentin muokkausraja ja lukitus säilyvät. Yllä oleva laajempi
  Shift-aloitusviitekehys on edelleen erillinen suunniteltava kokonaisuus.

## V0.36.8 — siirto osan omien suuntien mukaan

- Siirtosuunnat poimitaan tartuttavan osan todellisista CAD-reunoista.
  Pitkä suora reuna ja kohtisuora suunta muodostavat vakaan paikallisen akseliston.
  Ensimmäinen veto valitsee yhden suunnan; X/Y/Z ohittaa sen maailman akselilla.
- Vino suunta näkyy magentana myös osan läpi. Viitepisteen projektioviiva käyttää
  samaa väriä. Mittakenttä on **Siirtymä reunan suuntaan**.
- 20 mm on todellinen siirtomatka. Plus seuraa vetosuuntaa, miinus kääntää sen.
  Ruudukko pyöristää matkan, ei X/Y/Z-koordinaatteja erikseen; ankkuri säilyy.
- Shiftin aikana viitteen etäisyys projisoidaan nykyiselle siirtosuunnalle.
  Kopio ja toisto käyttävät samaa kolmiulotteista siirtymävektoria. Suunnat
  lasketaan lähdegeometriasta välimuistiin, ei jokaisella hiiren liikkeellä.
- Jatko käsitellään käyttäjän esimerkeillä erikseen: suunnan poiminta toisen
  kappaleen reunasta sekä yhteinen kontekstuaalinen Shift-viitekehys muille työkaluille.
  Tämä vaihe ei muuta kynän tai mittaviivan Shift-käytäntöjä.

## V0.36.7 — kierron suunta ja Shift-viite

- Automaattinen kiinnityspiste käyttää ankkurista kauempaa päätä myös pintapisteellä.
  Positiivisen koordinaattisuunnan suosiminen aiheutti täsmälleen 180° virheen.
- Shift vapauttaa 5°/90° kulma-askeleet, mutta säilyttää kulma-, reuna- ja
  mittaviivatartunnan. Sama käytös sekä automaattiselle että poimitulle pisteelle.
- Kiinnityspisteestä voi aloittaa vedon Shift valmiiksi pohjassa. Vapaassa
  tilassa kulma on vapaa; osoitettu tason ulkopuolinen viite projisoidaan kiertotasoon.

## V0.36.6 — kiinnityspiste seuraa ankkurin linjaa

- Oranssi ankkuri pysyy paikallaan. Sininen kiinnityspiste liikkuu mukana,
  ja niiden välinen viiva näyttää kohdistettavan suunnan.
- Kulmassa oletus on saman pitkän suoran reunan toinen pää. Keskeltä tai
  pinnasta käytetään ankkurin kautta kulkevaa, pitkän reunan suuntaista linjaa.
  Kiertoakselin suuntaiset reunat ohitetaan; aiemmin kierretyissä osissa käytetään
  todellisia CAD-reunoja. Monimutkaisissa muodoissa käyttäjä voi poimia pisteen itse.
- **Valitse kiinnityspiste** käyttää samaa pisteiden ja viivojen poimintaa kuin
  ankkuri. **Automaattinen** palauttaa oletuslinjan. Uusi ankkuri palauttaa
  kiinnityspisteen automaattiseksi; pelkkä renkaan tai osan vetäminen ei vaihda sitä.
- Tarkka tartuntakulma lasketaan kiinnityspisteestä, riippumatta siitä mistä
  renkaan tai osan kohdasta veto alkaa. Numeerisen esikatselun kulmaa ei lisätä
  tarkkaan kohdistukseen toistamiseen. Shift, Ctrl-kopiointi ja Undo säilyvät.
- Oletuslinjan geometriatarkastelu on välimuistissa; kulman muuttaminen ei
  skannaa raskaan osan reunoja uudelleen jokaisella osoitinpäivityksellä.

## V0.36.5 — kierron ankkuri ja suuntaviitteet

- **R → Valitse ankkuri**: sama kulmien, keskipisteiden, reunojen, mittaviivojen
  ja risteysten poiminta kuin muissa piirtotyökaluissa. Oranssi piste näyttää
  paikallaan pysyvän ankkurin. Keskipiste on edelleen oletus ja palautettavissa.
- Valitun osan pisteestä voi vetää suoraan kierron; renkaat ja numerosyöttö
  säilyvät. Kiertoakselin X/Y/Z-valinta näkyy oikeassa paneelissa korostettuna.
- Mittaviivat, apuviivat ja muiden osien kulmat, reunat sekä pintojen keskipisteet
  antavat tarkan suuntaviitteen. Valittu geometria ei tartu itseensä.
- Ilman viitekohdetta säilyvät 5° askel ja vahvempi 90° tartunta. Shift antaa
  vapaan kierron. Ctrl-kopiointi ja usean osan yhteinen kierto toimivat myös
  valitusta ankkurista. Ankkurin valitseminen ei tee historiavaihetta.
- Tason ulkopuolisesta viitteestä käytetään kiertotasoon projisoitua suuntaa.
  Kierto ei skaalaa osaa tai muuta pisteen etäisyyttä ankkurista: kauempana
  oleva tavoite antaa suunnan, ei muuta osan pituutta. Valitse akseli ennen vetoa.

## V0.36.4 — suurten mallien Peru-historia

- 100 vaihetta myös selaimen palautushistoriassa. Muuttumattomat osat, geometria
  ja kuvat jaetaan, ja saman BRep-tekstin kopiot tallennetaan kerran.
- Muistiarvio laskee jaetut tiedot kerran; yksittäinen siirto tai nimeäminen ei
  veloita koko mallin kokoa uudelleen. Hylätty redo-haara vapautetaan.
- Toimintohistoria näyttää peruttavien ja uudelleen tehtävien vaiheiden määrän.
  Muistirajan vuoksi lyhennetty historia ja tallennukseen mahtunut osajoukko
  ilmoitetaan. Rajat säilyvät: 64 MiB arvioitu projektihistoria, 8 MiB tallenne.
- Vanhojen historiaversioiden palautus, valintakontekstit, leikkaukseen palaaminen
  ja viimeisen piilotuksen palautus säilyvät. Viallinen historia ei estä mallin avaamista.

## V0.36.3 — kuvan säilyttävä tarkennus

- Esikatselun resoluutio kaksinkertaistuu molempiin suuntiin. Yksi karkea
  pikseli vastaa neljää seuraavan vaiheen pikseliä (kuvakoon pyöristys huomioiden).
- Edellinen karkea kuva säilyy uuden vaiheen väliaikaisena väriarviona.
  Sen paino pienenee tasaisesti ja on nolla kahdeksannessa näytteessä.
  Lopulliseen valolaskentaan ei jää karkeasta kuvasta perittyä väriä.
- Kohinanpoisto ei vaihdu päälle/pois jokaisen tarkkuusvaiheen alussa.
  Vain kokonaiset näytteet näytetään, ilman näkyvää ruutujen laskentapyyhkäisyä.
- Yksi rajattu GPU-erä kerrallaan, enintään neljä pientä ruutua. Seuraavaa
  ruutua ei aloiteta 4 ms CPU-aikabudjetin ylityttyä; yksittäistä ajurikutsua
  ei voi katkaista kesken. Eräkoko pienenee GPU:n jäädessä
  jälkeen. Kamera, materiaali- ja valaistusmuutokset tyhjentävät vanhan kuvan.
- Palautuspiste: `render-before-continuous-refinement-v0.36.2` (`e4b08bf`).
  Kokeilu on oma commit, jonka voi perua `git revert` -komennolla.

Tämä säilyttää aiemman **kuvan**, ei siirrä vanhan pikselin näytteitä neljän
uuden pikselin näytemääräksi. Yksittäisten säteiden uudelleenkäyttö sekä
syvyys- ja normaalitietoinen rekonstruktio ovat edelleen myöhempää työtä.

## V0.36.2 — automaattisesti tarkentuva esikatselu ja grafiikan palautuminen

- Renderöi näyttää heti nopean kuvan ja aloittaa tarkentumisen automaattisesti.
  Kameran liikkuessa käytetään nopeaa kuvaa. Pysähdyttyä aloitustarkkuus on
  enintään 640 px pidemmältä sivulta, sitten resoluutio kasvaa vaiheittain.
  Kevyt/Täysi-valinta poistuu; Nopea säilyy tarkentumisen poiskytkentään.
- Kokonainen edellinen näyte säilyy näkyvissä, kun seuraavaa lasketaan pienissä
  erissä. Näkyvää ruutu ruudulta pyyhkäisyä ei tehdä. GPU-jonossa on enintään
  yksi laskentaerä. Esikatselu on enintään 3 MP / 2560 px pidemmältä sivulta;
  erillinen kuvarenderi säilyttää käyttäjän valitseman kuvakoon.
- Esikatselun resurssit vapautetaan ennen erillisen kuvatyön aloittamista.
  Kirjaston puuttuvia vapautuksia täydennetään, käyttämättömät pienkuvapuskurit
  jätetään 1 × 1 -kokoon ja täysruutulaskennan tarpeettomat syvyyspuskurit poistuvat.
- WebGL-yhteyden katkeaminen erotetaan tuen puuttumisesta. Selain saa palauttaa
  yhteyden, ja näkymässä on myös uudelleenyritys. Renderin kuvakulma säilyy;
  palautumisen jälkeen tarkennus käynnistetään itse, jotta sama raskas työ ei
  ala välittömästi uudelleen. Mallinnusnäkymä vapauttaa suljetun kontekstinsa.

Jatkoon: syvyys- ja normaalitietoinen kohinanpoisto sekä kameran liikkeen
huomioiva aiempien näytteiden uudelleenkäyttö. Ohuet LEDit, peilit, lasi ja
pienet saumakohdat tarvitsevat vertailutestit, jotta suodatus ei hävitä detaljeja
tai levitä valoa esteiden läpi. Nämä eivät kuulu tähän julkaisuun.

## V0.36.1 — aihiomitat, reunojen valinta ja kaarevalle pinnalle piirtäminen

- Aihiomitat tallentuvat myös profiloituihin ja BRep-osiin ilman osatyypin
  määrittämistä. Vanhat projektit täydentyvät avattaessa. Mitat ja niiden
  suunnat pysyvät pareina; pisin mitta on aina pituus. Kierto ei kasvata mittoja
  maailman akselien mukaan. Leikattu osa mitataan omassa aihiosuunnassaan.
- Linkitetyt kopiot jakavat geometriset ja käsin annetut laskentamitat.
  Määrälaskenta ja leikkauslistan oma aihio päivittävät saman mittaperustan.
  Tyypit, syysuunta ja materiaalin luokittelu säilyvät esiintymäkohtaisina.
- Pyöristys ja viiste säilyttävät automaattiset mitat ja käsin annetun
  työstövaran myös linkitetyissä kopioissa. Vanhan tiedoston aiheeton
  tarkistuspyyntö korjataan, jos mitan geometriatunniste vastaa viimeisen
  reunakäsittelyn lähdettä. Muun muotomuutoksen vanhentunutta työstövaraa
  ei hyväksytä automaattisesti.
- F aloittaa uuden käsittelyn nykyiseen geometriaan. **Muokkaa edellistä
  käsittelyä** avaa aiemman säteen/viisteen. Reunoja voi valita useasta osasta;
  linkitettyjen kopioiden vastaavat reunat yhdistetään yhdeksi käsittelyksi.
  Hyväksyntä on yksi peruttava toiminto, virhe ei tallenna osittaista tulosta.
- Läheltä tähtääminen käyttää perspektiivikorjattua reunapistettä ja leikkaa
  kameran taakse jäävät viivanosat. Lähempää kulmapistettä suositaan maltillisesti.
  Tyhjän pinnan napsautus säilyttää reunavalinnan. Esikatselu jättää säteen
  saumaviivat pois; osan muokkausnäkymässä ne ovat käytettävissä.
- Kaareva pinta antaa piirtämiselle paikallisen tangenttitason. Sylinteristä
  lasketaan tarkka kosketuspiste ja normaali; muilla kaarevilla pinnoilla
  käytetään pintaverkon normaalia. Taso säilyy koon muuttuessa. Tämä tekee
  tasomuodon, ei vielä pinnan ympäri kietoutuvaa piirrosta.
- Tarkentuvan renderin sekä kuvarenderin epäsuorat näytteet saavat yhteisen
  kirkkausrajan ennen keskiarvoistusta. Näkyvät valopinnat ja ensimmäisen
  pinnan suora valaistus säilyvät. Poikkeuksellisen kirkkaat kaustiset kuviot
  voivat himmentyä; tämä on tarkoituksellinen firefly-kohinan kompromissi.

## V0.36.0 — pintojen korkeudet, nopea historia ja tallennetut kuvakulmat

- **Muodot → Pinnan korkeudet** tekee yhtenäisen CAD-pinnan 2–12 sisäkkäisestä
  suljetusta tasomuodosta. Suorakulmiot, ympyrät ja muut tasoprofiilit toimivat
  rajoina. Korkeudet annetaan suhteessa ensimmäisen rajauksen piirtotasoon.
  Sisimmän rajan voi jättää aukoksi; pohjan syvyys tekee umpiosan tasaisella alapinnalla.
- Esikatselu näyttää muuttuvan pinnan. Jokaisesta vyöhykkeestä näytetään
  pintaverkosta mitattu kaltevuusväli sekä nousu/lasku sisäänpäin. Tasakorkuinen
  neliö ja ympyrä eivät tarkoita yhtä samaa kaatoprosenttia kaikkiin suuntiin.
  Risteävät/koskettavat rajat, taittuva projektiopinta ja liian ohut pohja hylätään.
- **Muokkaa pinnan korkeuksia** valmiin osan tiedoissa palauttaa säädöt.
  Rajaukset tallentuvat osaan; lähdemuotojen piilottaminen tai poistaminen ei
  riko muokkausta. Siirto, kierto, tasaskaalaus ja linkitetyt kopiot säilyttävät
  säädöt. Muut geometriaoperaatiot viimeistelevät tavallisen CAD-osan.
- [Käyttöohje ja rajaukset](surface-levels.fi.md). Tämä on ensimmäinen
  korkeuksilla ohjattu pintatoiminto, ei vielä vapaa minkä tahansa osan
  yksittäisten verteksien/reunojen muokkaus. Yhteiseen ulkoreunaan osuvat
  sisärajat, useat kaivot ja vapaat muodonmuutokset jäävät backlogiin.
- CAD-historia säilyttää aiempia muotoja rajatussa **64 MiB / 24 geometriaa**
  välimuistissa. Sama muoto tallennetaan kerran kopioiden määrästä riippumatta.
  Peru/Palauta käyttää valmista tarkkaa muotoa ja verkkoa; ylisuuri muoto
  lasketaan edelleen normaalisti. Muistiraja on arvio, ei WASM-keon tarkka mitta.
- Tallennushistoria käyttää muuttumattomien tilojen jo tehtyä serialisointia
  uudelleen ja ohittaa vanhentuneet tallennuspyynnöt ennen serialisointia.
- **Renderöi → Kuva → Kuvakulmat** tallentaa kameran, kohdepisteen ja polttovälin
  projektiin. Nimeä napsauttamalla nimeä, palauta silmäkuvakkeella, päivitä tai
  poista rivin kuvakkeista. Kuvakulma ei muuta mallin geometriaa.

## V0.35.0 — pintamaalaus, pipetti, kynän kulma ja renderkameran objektiivi

- P:n **Koko osa / Pinta** rajaa maalauksen. Pintavalinnasta aloitettu P avaa
  pintamaalauksen; Siirrä/Kierrä/Skaalaa vapauttaa pintavalinnan ja käsittelee osaa.
  Koko osan maalaus korvaa aiemmat pintamateriaalit. Hold ja linkitys säilyvät.
- **Pipetti / I** poimii näkyvän pinnan materiaalin, sävyn, kiillon ja tekstuurin
  sijoittelun myös lukitusta osasta. Poiminta ei muuta mallia tai lisää historiaa.
  Paluu maalaamiseen on automaattinen; Esc peruuttaa vain aktiivisen pipetin.
  Toimii mallinnuksessa ja renderissä.
- Pintamateriaalit tallennetaan CAD-pintojen mukaan, eivät kolmiokohtaisesti.
  Offsetin alueet perivät lähtöpinnan; Push/Pullin pääty säilyttää maalauksen.
  Topologian muuttuessa vastaavuus ratkaistaan pintojen todellisesta
  päällekkäisyydestä, ei vanhoista pintanumeroista. Uudet sivupinnat käyttävät
  osan perusmateriaalia. Materiaalit toimivat nopeassa ja tarkentuvassa renderissä.
- Kynän R kiertää suuntaa viimeisen pisteen ympäri 22,5° välein. Kulman voi
  kirjoittaa; napsautus/Enter vahvistaa suunnan ennen pituuden asettamista.
  Pituus ja sen etumerkki noudattavat piirrettävää suuntaa. Shift poimii
  viitepituuden, X/Y/Z vaihtaa akseliin ja Esc vapauttaa kulmalukituksen.
- Renderin Kuva-osiossa polttoväli 12–200 mm, liukusäädin, numerosyöttö ja
  24/35/50/85 mm pikavalinnat. Muutos ei siirrä kameraa eikä rakenna geometriaa
  tai polunseurannan BVH:ta uudelleen. Oletus 35 mm, täyden kennon vastaavuus.
  Tieto tallentuu projektiin ja lopullisen kuvan kameraan.
- Jatko: useiden pintojen valinta ja erillisten pintatekstuurien sijoittelukahvat.
  Koko osan tekstuuriasettelu säilyttää erikseen maalattujen pintojen kuviot.

## V0.34.2 — pintavalinnan ja työkalukohteen erottaminen, 11.10.2026

- Muokkaustilassa valittu pinta näkyy oranssina ja pistekuvioituna sekä
  Muokkaustilan Pinta valittu -merkintänä. Korostus toimii tummilla tekstuureilla,
  metallilla ja lasilla riippumatta valaistuksesta. Hover ei peitä valintaa.
- Push/Pullin ja Offsetin kohde näkyy sinisenä. Työkalun käyttäminen ei enää
  itsessään muuta kohdetta erikseen valituksi pinnaksi. E:n nollasyvyyden
  esikatselu ei maalaa oranssia pintavalintaa siniseksi.
- Valittu pinta on ensisijainen E/O-kohde sekä näppäimellä että työkalupalkista.
  Hiiri toisella pinnalla ei muuta kohdetta eikä aloituspisteen normaalia.
  Myös Push/Pullin hiiriveto säilyttää valitun pinnan, Shift poimii tavoitemitan.
  Vanhentuneesta pintaviitteestä ei arvata toista pintaa.
- Delete käyttää muokkaustilan pintavalintaa myös muun työkalun aikana.
  Koko osaa ei poisteta pintavalinnan puuttuessa. X säilyy poistona Valitse-tilassa.
- Pintavalinta vaihtaa piirtomateriaalin rakentamatta geometrian puskureita
  uudelleen; yksi valittu pinta tarvitsee edelleen enintään kolme piirtoerää.
- Tarkennus v0.35.0: siirto, kierto ja skaalaus käsittelevät koko osaa käyttäjän
  linjauksen mukaan. Pintamaalaus on toteutettu erillisenä valintana.

## V0.34.1 — offset-kehän keskialueen poistaminen, 11.10.2026

- Osan muokkaustilassa tavallinen napsautus valitsee pinnan. X/Delete,
  oikean reunan Poista pinta ja kontekstivalikko poistavat valitun
  paksuudettoman alueen; koko osaa ei poisteta vahingossa pintavalinnan puuttuessa.
  Muokkaustilan ulkopuolella tavallinen osavalinta ja Shift-monivalinta säilyvät.
- Toimii sekä jaetulle 2D-luonnokselle että pursotetun kehän keskelle jäävälle
  tasoalueelle. Kehän tilavuus, muut pinnat ja erilliset viivat säilyvät.
  Umpinaisen osan kuorta ei avata tällä komennolla. Hold, linkitetyt kopiot,
  tallennus ja Peru/Palauta käyttävät tavallista muutosketjua.
- Cut ja Leikkaa aukko tunnistavat myös pinta-alan muutoksen. Pelkän
  tilavuuden vertailu palautti aiemmin alkuperäisen osan ja johti virheelliseen
  ”Työstökappaleet eivät leikkaa kohteita” -ilmoitukseen. Jäljelle jäävät
  tasopinnat säilyvät myös silloin, kun leikkaus poistaa kaikki tilavuusosat.
- Jatko: useiden pinta-alueiden valinta yhdellä kertaa. Shiftin viitehaku
  Push/Pullissa säilyy nykyisenä.

## V0.34.0 — osatyypit ja määrälaskenta, 11.10.2026

- Projektikohtaiset nimetyt tyypit ja laskentatapa kpl / m / aihioala m².
  Oikean paneelin Tyyppi-valinta toimii yksittäisille osille ja monivalinnalle.
  Luonti, nimeäminen, laskentatavan vaihto ja tyypin poisto ovat peruttavia;
  tyypin poisto säilyttää osat. Hold estää osan luokituksen muuttamisen.
- Valinnan yhteenveto ja Valitse kaikki samantyyppiset. Osat → Määrät näyttää
  projektin tai ryhmän määrät sekä pituus-/aihioerittelyn. CSV-vienti sisältää
  yksikön, laskentaperusteen ja puuttuvien mittojen määrän.
- Jokainen esiintymä lasketaan kerran, myös piilotetut. Apumuodot ja piirrokset
  rajataan pois. Tyyppi kopioituu, mutta ei linkitä geometriaa tai muuta ryhmitystä.
- Aihiomitat ovat osan omassa suunnassa, eivät maailman X/Y/Z-ulkomittoja.
  Siirto, kierto, skaalaus, pyöristys ja tunnetun aihion työstö päivittävät tiedot.
  Suorakulmainen osa tunnistetaan myös jälkikäteen kierrettynä. Tuntematon muoto
  tai vino venytys vaatii vahvistetut aihiomitat; puutteet näkyvät summissa ja CSV:ssä.
- Aihioala = pituus × leveys yhdeltä puolelta; aukkoja ei vähennetä. Omat
  aihiomitat tarkistetaan geometrian muututtua. Kelvollisia aihioita käytetään
  myös leikkauslistassa, kun kaikki kolme mittaa ovat tiedossa.
- Tyyppi on kevyesti osan nimen ja ryhmän yhteydessä. Laskennan lisämitat ovat
  avattavassa osiossa; taulukon osat ladataan näkyviin vasta erittelyä avatessa.
  Tyypin vaihto ei rakenna piirtoverkkoa uudelleen.

### Seuraavaksi — materiaalitarpeesta hankintaan

- Lautojen ja runkopuiden katkaisusuunnitelma varastopituuksista, sahausura ja hukka.
- Erikseen nimetty nettopinta-ala aukkojen vähennyksillä; aihioala säilyy omana tapanaan.
- Johdetut määrät, esimerkiksi neljä ruuvia laudelautaa kohti, ilman ruuvien mallintamista.
- Hankintavara ja pakkaus-/varastopituudet erilleen mallin todellisista määristä.

## V0.33.2 — yhdisteltävät skaalausakselit, 10.10.2026

- Oikean paneelin X/Y/Z ovat itsenäisiä valintoja. Valitut akselit käyttävät
  yhteistä kerrointa; muut säilyttävät sekä mittansa että sijaintinsa.
- Sama rajaus koskee tavoitemittoja ja näkyviä kulma-/sivukahvoja.
  Pois valitun akselin sivukahvat piilotetaan. Akselivalinta säilyttää kertoimen.
- Vähintään yksi akseli säilyy valittuna. X/Y/Z-näppäimet valitsevat edelleen
  yhden akselin nopeasti; paneelista voi lisätä toisen tai kolmannen.

## V0.33.1 — raskaiden osien käsittely, 10.10.2026

- Siirron ja kierron hyväksyntä käyttää aiempaa tarkkaa piirtoverkkoa.
- Akseliskaalauksen lähdeverkko muuntuu kiristetyillä toleransseilla, kun CAD:n
  muunnoshistoria vahvistaa pintojen vastaavuuden. Tavallinen laatikko pysyy parametrimuotona.
- Valmiit operaatiot, pintatiedot ja rinnakkaiset linkitetyt kopiot käyttävät CAD-välimuistia.
- Mitatut ennen/jälkeen-ajat ja rajat: [suorituskyky](performance.md).
- Jatko: raskaan BRepin affine-muunnos on edelleen hidas; geometriaa muuttavan
  operaation Peru verkottaa palautetun muodon uudestaan. Tutki rajattua historiavälimuistia
  ja muunnosytimen nopeutusta erikseen todellisen WASM-/GPU-muistin mittauksen kanssa.

## V0.33.0 — Skaalaa, 10.10.2026

- L avaa skaalauksen. Kulmakahvat muuttavat kokoa tasaisesti, sivukahvat yhdellä
  maailman akselilla. X/Y/Z valitsee akselin. Kerroin tai tavoitemitta toimii myös
  millimetreinä; Enter tai vedon vapautus hyväksyy, Esc peruu.
- Yhteinen kiintopiste: keskikohta, alakulma tai mallista poimittu piste.
  Monivalinta, alaryhmät ja kokoonpanot säilyttävät osien suhteellisen sijainnin.
- Linkitetty määrittely skaalataan kerran. Valitut kopiot siirtyvät yhteisen
  kiintopisteen mukaan; muut kopiot jakavat koon omassa sijainnissaan. Erillinen
  valinta tekee osista uniikkeja. Hold suojaa myös linkitettyjä kopioita.
- Esikatselu lainaa nykyisiä piirto- ja reunapuskureita ilman CAD-laskentaa.
  Tarkka BRep säilyy myös kaarevissa, pyöristetyissä ja rei'itetyissä osissa.
- Venytyksen jälkeen tasopinnat tunnistetaan myös B-spline-esityksestä:
  Offset, Push/Pull, reuna-ankkurit ja kopioiden pisteviitteet säilyvät.
- Yhden BRep-osan raja 16 Mt. Skaalauksen laskennan aikaraja 120 s; kumoaminen
  ja peruuttaminen säilyttävät alkuperäisen projektin.

## V0.32.2 — tiheän osan siirtokorostuksen jäätyminen, 10.10.2026

- Siirron tartunta ei sädehae koko reunaviivastoa jokaiselle mahdolliselle ankkurille.
  Näkyvyys ratkaistaan parhaasta ehdokkaasta alkaen samoilla tartuntaprioriteeteilla.
- Ruudun koko luetaan kerran hakua kohti; vedossa ei tehdä toista yleistä viitehakua.
- Nollasiirtymä ei luo päällekkäistä haamuverkkoa. Siirtäminen ja Ctrl-kopiointi
  käyttävät edelleen tarkkaa verkkoa ilman esikatselun CAD-laskentaa.

## Backlog: mittoja säilyttävä koonmuutos

Tavallinen skaalaus muuttaa myös reikien mittoja, jakoa ja seinämän paksuutta;
epätasainen skaalaus muuttaa ympyrät ellipseiksi. Kiukaan halkaisijan muuttaminen
reikiä ja pellin paksuutta säilyttäen tarvitsee erilliset rakennesäännöt.
Suuren BRep-osan akselimuunnoksen laskenta-aika ja NURBS-tiedon koko ovat
jatko-optimoinnin kohteita; GPU-esikatselu ei odota tätä laskentaa.

## V0.32.1 — leikatun geometrian suorituskyky, 10.10.2026

- Valitun kaarevan solidin automaattiset pistepilvet poistettu. Avoimien kynäviivojen
  päät ja valittujen piirtokäyrien tarkoitukselliset tartuntapisteet näkyvät edelleen.
- Kolmioiden hakupuu palvelee myös mallin pintavalintaa ja viitehakua. CAD-indeksit,
  tarkat tasopinnat, Ghost, poikkileikkaukset ja päällekkäisen piirron etusija säilyvät.
- Valittu pinta käyttää enintään kolmea piirtoaluetta. Peilin pintakohtainen
  materiaalijako säilyy. Geometrian pitkä instanssiavain säilytetään korostusten yli.
- Reuna-/pintaluettelot muodostetaan hajautushaulla. Alkuperäinen järjestys ja
  tunnisteet säilyvät, myös tallennuksen, siirron ja päällekkäisen erillisen geometrian yli.
- Vanhan osan pisteviitteiden säilyttäminen ei verkota sen kaikkia pintoja.
  Tämä nopeuttaa myös seuraavia leikkauksia jo monimutkaiseen osaan.
- Reunakäsittely lähettää valmiiksi poimitut reunat suoraan CAD-laskentaan.
  Sama keskeneräinen/valmis esikatselu käytetään hyväksynnässä; worker käyttää
  valmiin piirtoverkon. Virhe, muuttunut syöte tai peruutus ei palauta vanhaa tulosta.
- Tarkkuutta, kaarien verkotustoleranssia tai tallennettavaa geometriaa ei kevennetä.
  Suuret monimutkaiset CAD-operaatiot tarvitsevat edelleen laskenta-aikaa.

## V0.32.0 — Join, kierron kopiointi ja aukkojen ympyrätoisto, 10.10.2026

- Join käyttää yhtä yhdistettävien osien valintaa. Etukäteen valitut osat, mallin
  napsautukset, listan valinnat ja valintasuorakulmio toimivat samalla tavalla.
  Cutin Säilytä työstökappaleet -asetus ei jätä Joinin alkuperäisiä osia tuloksen päälle.
- Sama Join yhdistää tilavuuskappaleet tai samalla tasolla olevat täytetyt muodot.
  Suorakulmio ja pääty-ympyrät yhdistyvät kaaret säilyttäväksi leikkuriksi.
  Eri tasot, avoimet viivat, sekoitettu pinta-/tilavuusvalinta ja Hold tarkistetaan.
  Liitos ei levitä yhdistettyä geometriaa lähtöosan muihin komponenttikopioihin.
- R-kierron Ctrl on kopioinnin kytkin. Esikatselu säilyttää alkuperäiset osat näkyvissä.
  Kopiointi käyttää siirron ryhmä-, kokoonpano-, nimeämis- ja komponenttilinkityslogiikkaa.
  Alkuperäinen geometria säilyy; kopio ja sen mitat/viitteet kiertyvät samassa historiavaiheessa.
- Leikkaa aukko sisältää Suora/Ympyrä-toiston. Ympyrän akseli X/Y/Z ja kiertopiste
  ovat asetettavia; oletuspiste on kohteiden keskipiste. Tasajako koko ympyrälle
  tai oma positiivinen/negatiivinen kulmaväli. Täysi kierros ei lisää päällekkäistä loppuaukkoa.
  Muoto ja leikkaussuunta kiertyvät yhdessä, joten myös sylinterin sivu voidaan rei'ittää.
- Rajattu leikkaussyvyys käyttää piirtotason suuntaa myös ympyröillä, joiden CAD-pinnan
  normaali on vastakkainen. Suunta säilytetään jatkettaessa sarjaa BRep-muodosta.
  Sarjan esikatselu, syvyys, kohteet ja ympyräasetukset säilyvät toimintohistoriassa.
- Regressiot: neljä toisiaan koskevaa seinää oviaukolla ja ikkunalla, yhdistetty kapseli,
  seitsemän reikää onttoon sylinteriin, kiertokopion linkitys sekä selaimen Peru/Palauta ja tallennus.
- Suuret Cut- ja aukkosarjat: toisistaan erilliset leikkurit ryhmitellään samoihin
  CAD-operaatioihin. Koskettavat/päällekkäiset leikkurit pysyvät erillisissä erissä;
  kohteesta ohi menevät rajataan pois. Välitulokset vapautetaan heti. Aukkosarja
  sarjallistaa ja verkottaa kohteen vasta kaikkien aukkojen jälkeen.
- CAD-pintojen ja jaettujen reunojen tunnistus käyttää hakutauluja toistuvan
  koko listan läpikäynnin sijaan. Tarkkuutta tai kaarien laatua ei alenneta.
  Regressiot: 90 kapselileikkuria onttoon sylinteriin (myös vastakkaiset kopiot),
  90 pyöreää aukkoa, päällekkäisyydet, kosketukset, ohi menevät ja kokonaan poistuvat kohteet.
- Kaarevat reunat: valinta ja Kaikki reunat ohittavat sileät tangenttiliitokset,
  sylinterin tekniset saumat sekä nollapituiset reunat. CAD-indeksit säilyvät.
  Uusi reunakäsittely nostettu suoraan paneeliin, jotta jo pyöristettyyn muotoon
  voi lisätä eri kokoisen/tyyppisen käsittelyn. Regressiot kattavat pyöristyksen
  ja viisteen sylinterille, ellipsille, kapselille, aukolle ja kaarevan putken aukolle.

## V0.31.1 — pinnan keskipiste ja apuviivan viitemitta, 10.10.2026

- Mitta- ja piirtotyökalujen keskipiste on todellisella, näkyvällä tasopinnalla.
  Lattian paksuus ei siirrä aloituspistettä lattian sisään. Pinnan CAD-keskipiste
  tarkistetaan täytetyn alueen sisältä: reikään tai koveran pinnan ulkopuolelle
  jäävää keskikohtaa ei tarjota pinnan pisteenä. Tartuntakohteet välimuistitetaan.
- Reunasta vedettävän apuviivan etäisyys poimitaan näkyvästä 3D-viitteestä omaan
  tasoon tai valitulle akselille. Seinän yläreunasta aloitettu mitta voi käyttää
  lattian keskipistettä; viiva säilyttää korkeutensa ja lähtöreunan suunnan.
- Täsmälleen osoitettu piste ohittaa kauempana olevan apuviivojen risteyksen.
  Vanha sivuun piirretty apuviiva ei estä tarttumista pinnan oikeaan keskikohtaan.
- Lähes ylhäältä katsottaessa seinän reunalta alkava apuviiva suosii vaakatasoa;
  ohut näkymä seinän pystypintaan ei vaihda vetoa huomaamatta pystysuuntaiseksi.
- Regressiot: sama mitta neljältä vastakkaiselta seinältä, vino näkymä, akselilukko,
  vanhat apuviivat sekä kynän ja vapaan mittaviivan aloitus lattian pinnassa.
  Alkuperäisiä malleja tai aiemmin piirrettyjä apuviivoja ei muuteta automaattisesti.

## V0.31.0 — mittamuisti, huoneen muodot ja aukon esikatselu, 10.10.2026

- Viisi viimeisintä erilaista mittaa yhteisessä, projektikohtaisessa mittamuistissa.
  Suorakulmioiden/pinta-alueiden sivut, ympyröiden ja muiden sädemuotojen halkaisijat,
  kynän hyväksytyt suorat segmentit, mittaviivojen pituudet ja apuviivojen etäisyydet
  opettavat muistia. Myös tallennettu kahden pisteen dimensio antaa mittansa muistiin.
  Muistin ehdotukset toimivat piirrettäessä muotoja, kynän suoria viivoja sekä mitta-
  ja apuviivoja. Dimensio merkitsee edelleen käyttäjän valitsemat todelliset pisteet.
- Tartunta on pieni ruutupikseleissä mitattu alue, jonka fyysinen enimmäispoikkeama
  on rajattu. Lähemmäs zoomaaminen tarkentaa ehdotusaluetta. Osoitettu geometria,
  risteykset, viitteet ja tarkka numerosyöttö voittavat muistiehdotukset. Shift
  säilyy viitehakuna; Alt ohittaa muistin. Ruudukko ei pyöristä muistista poimittua
  98 mm mittaa sadaksi. Muisti ei muuta akselia tai piirron aloituskulmaa.
- Muisti tallentuu `sessionStorageen` projektin tunnisteella. Sivupäivitys säilyttää
  sen; toinen projekti ei sekoita mittoja. Muisti ei lisää historiatapahtumia,
  eikä Peru poista viimeksi käytettyä mittaa. Kokonaista projektia ei skannata
  hiirtä liikutettaessa. Projektitiedoston formaatti ei muutu.
- **Yhdistä muodot** tekee tarkan CAD-unionin samalla tasolla olevista täytetyistä
  suorakulmioista, ympyröistä ja monikulmioista. Sisärajat ja päällekkäisyydet
  poistuvat, reiät ja kaaret säilyvät. Vastakkaiset pintanormaalit yhtenäistetään.
  Erilliset saarekkeet jäävät saman osan erillisiksi pinnoiksi. Eri tasot,
  avoimet viivat, tilavuuskappaleet ja lukitus tarkistetaan ennen muutosta.
- 2D-muodon **Offset ulospäin** säilyttää alkuperäiset pinnanjaot ja reiät sekä
  luo ulkokehän omaksi muokattavaksi alueekseen. Uusi kehä jää valituksi E:tä
  varten. Ulospäin voi vetää hiirellä tai valita suunnan ja kirjoittaa mitan.
  Sisään/Ulospäin, esikatselu, Peru/Palauta ja projektin tallennus toimivat yhdessä.
  Ulospäin tehtävä offset on tässä versiossa rajattu paksuudettomiin tasopintoihin.
- **Leikkaa aukko** sallii mallissa kohteiden napsauttamisen päälle/pois sekä
  saman valinnan listasta. Alkuperäinen osa pysyy poimittavana myös aukon kohdalta
  tai koko osan poistavassa leikkauksessa. Kameraa voi kiertää ja zoomata.
  Kohteet ovat sinisiä, leikkausmuoto punainen ja läpikuultava. Syvyys näkyy
  leikkausmuodon pituutena myös aukkosarjoissa. Leikkaussyvyys on suoraan näkyvä
  kenttä; tyhjä = läpi. Syvyysrajan ulkopuoliset osat ohitetaan ennen CAD-leikkausta.
  Syvyyden muuttaminen säilyttää käsin valitut kohteet, ja historia tallentaa
  kohteet, syvyyden, sarjan sekä muodon. Linkitettyjen kopioiden käytös säilyy;
  Tee kohteista uniikkeja rajaa muokkauksen valittuihin osiin.
- Mittatyökalun valikko sijoitetaan todellisen korkeutensa perusteella, jotta
  uudet Pinta-ala/Huomautus-rivit eivät jää ruudun ulkopuolelle eri telakoinneissa.

## Seuraavaksi — mittamuistin laajennus

- Projektin yleiset mitat: laske välimuisti mallin muuttuessa, ei hiiriliikkeissä.
  Näytä alkuperä selkeästi ja pidä ehdotusten määrä pienenä. Arvioi istuntoa
  pidempi muistaminen käytön perusteella.
- Kokonaisten muotojen muistaminen omana jatkona: säilytä mitat, muotosuhteet ja
  tarvittaessa kaaret/profiili. Monimutkaista muotoa ei korvata automaattisesti
  toisenlaisella; uudelleenkäytön pitää olla ennakoitavaa.
- Perustyökalujen luotettavuus ennen uusia havainneanimaatioita: Push/Pull,
  Offset, mitta-/apuviivat, pyöristys/viiste, Cut/Join, kopiointi/toisto ja aukot.

## V0.30.1 — suorakulmion aloituskulma, 10.10.2026

- Suorakulmion ensimmäinen napsautettu kulma säilyy, kun leveyttä tai syvyyttä
  muutetaan numeroilla. Myös negatiivisiin piirtosuuntiin tehty suorakulmio kasvaa
  tai pienenee tästä kulmasta, ilman korjaavaa hiiren liikettä. Tab, Shift+Tab ja
  mittakentän napsauttaminen käyttävät samaa piirtotason ja aloituspisteen logiikkaa.
- Peruuttaminen ja uuden muodon aloittaminen tyhjentävät edellisen piirron
  suuntatiedot. Korjaus kattaa sekä tasoihin piirtämisen että XY-piirron.

## V0.30.0 — rauhallisemmat työkalupaneelit ja havainneohjeet, 10.10.2026

- 33 työkalun ja toimintatavan kolmivaiheiset, 12 sekunnin havainneanimaatiot.
  Aktiivisen työkalun **Näytä esimerkki** ja yläpalkin **Käyttöohje** avaavat saman
  haettavan kirjaston. Pysäytys, kelaus, vaihevalinta, alusta toisto ja kosketusnäkymä.
- Paneelissa yksi lyhyt seuraava askel. Toistuvat käsikirjatekstit, aloitusvaiheen
  tarpeettomat hyväksynnät ja päällekkäiset työkaluvaihdot poistuvat. Mallinnuksen
  näppäimet eivät toimi ohjeikkunan läpi, ja keskeneräinen muoto säilyy suljettaessa.
- Valinnan Siirrä / Kopioi / Poista ja Muokkaa osaa / Kierrä / Kiinnitä ovat ennen
  avattavia osioita. Muotoilutoiminnot, vapaa siirto, kiertopisteen koordinaatit,
  tekstuurin vaihtelu ja nykyisen reunakäsittelyn hallinta avautuvat tarvittaessa.
- Pallolla ei ole paksuuskenttää. Piirtotapa-valinta näytetään vain osan muokkauksessa,
  jossa on todella kaksi vaihtoehtoa. Cut/Join näyttää täyden listan vain aktiivisessa
  kohde-/työstöryhmässä, toisessa jo valitut osat.
- Mittaviivan R/Shift+R-kierto ja kiertopainikkeet palauttavat kohdistuksen
  mallinnukseen: Enter hyväksyy kierron myös tallennuspainikkeen käytön jälkeen.
- Ohjeet ladataan avattaessa. Vain näkyvä animaatio päivittyy; piilotettu välilehti ja
  vähennetty liike pysäyttävät automaattisen toiston. Ohjeen latausvirhe on eristetty
  mallinnuksesta. Tämä versio sisältää havainneanimaatiot, ei ruutunauhoituksia.
- Automaattisesti ensimmäisellä käyttökerralla avautuva ohjekortti jää jatkotyöksi:
  ohje avataan nyt käyttäjän pyynnöstä, jotta selkeytyspassi ei lisää keskeytyksiä.
  Säännölliset käytettävyys- ja optimointipassit jatkuvat.

## V0.29.1 — merkintöjen sujuvuus ja mallilistan järjestäminen, 9.–10.10.2026

- Pinta-ala priorisoi osoitettua pintaa myös perspektiivissä ja negatiivisilla
  korkeuksilla. X/Y/Z ja Piirtotaso-valikko: YZ/XZ/XY. Tason vaihtaminen kiertää
  koko keskeneräisen alueen ensimmäisen kulman ympäri, pinta-alan säilyttäen.
  Sama akselinäppäin palauttaa automaattisen tason. Tallennettuja alueita ei muuteta.
- Hiiritapahtumat yhdistetään ruudun päivitykseen, saman pikselihaun säde ja
  matriisit käytetään uudelleen ja tarpeettomat ankkuri-/tartuntahaut poistuvat.
  Viimeinen vapautuskohta hyväksytään myös ennen seuraavaa animaatioruutua.
- Huomautuksen sijoitus/siirto aktivoi tekstikentän. Enter tallentaa ja Esc
  peruu tekstimuutoksen; kumpikin palauttaa näppäimistön malliin. Kohdistusviivan
  voi piilottaa ja palauttaa. Lihavointi ja valintaruutu samalla rivillä.
- Merkinnän väri ja tekstiväri päivittyvät kevyenä SVG-esikatseluna. Säädön
  hyväksyntä on yksi historiatoiminto, Esc peruu esikatselun. Värin muuttaminen
  ei käynnistä jokaisella hiiriliikkeellä projektin validointia tai 3D-piirtoa.
- Mitat/Merkinnät/Viivat-listojen roskakorit poistavat kyseisen rivin. Peru palauttaa.
  Kappaleissa Shift lisää näkyvän rivivälin, Ctrl/⌘ vaihtaa yksittäisen osan
  valinnan. Keskitä-kuvake kohdistaa kameran osaan muuttamatta valintaa.
- Pudotus toisen osan päälle luo järjestävän kansion kohdeosan nykyiseen
  ryhmään (tai päätasolle). Kohdeosa ja vedetyt osat/ryhmä tulevat sen sisään.
  Esikatselu kertoo tulevan ryhmityksen. Hold ja omiin jälkeläisiin pudotus estetään.
  Ryhmä ja kokoonpano säilyvät eri käsitteinä.
- Ryhmävalikot näyttävät kaikki ryhmäpolut. Ryhmää siirrettäessä oma ryhmä ja
  jälkeläiset näkyvät estettyinä syyn kanssa. Siirrä ryhmään -ikkunassa voi vaihtaa
  koko ryhmästä valittuihin osiin, jotka voi siirtää myös alaryhmään.
- Uuden kynä-/perusmuodon valinnainen nimeämiskortti ei varasta fokusta. Tab vie
  nimeen ja ryhmään, Enter tallentaa kummatkin yhdessä. Olemassa olevan ryhmän
  voi valita tai kirjoittaa uuden ryhmän nimen. Ulkopuolelle napsautus, Esc tai
  uuden työkalun valinta ohittaa kortin. Kopiosarjat ja tuonti eivät avaa sitä.

- **H** piilottaa valinnan (osat, ryhmät, viivat, dimensiot, merkinnät).
  **Shift+H** palauttaa viimeisimmän yhä piilotetun erän toimintohistoriasta;
  toistamalla palautuvat aiemmat erät. Myös listan silmäpainikkeet huomioidaan.
  **Alt+H** näyttää kaikki, myös yksittäin ja yhteisesti piilotetut mittamerkinnät.
  Ryhmän palautus säilyttää erikseen piilotetut jäsenet. Näkyvyys on yksi
  alavalikko oikean napin alla sekä näkymän silmäpainike; Navigoi ei käytä H:ta.
  Viimeisimmän palautus kattaa muistissa/tallennuksessa säilyvän kumoamishistorian.

## V0.29.0 — pinta-alueet ja tekstihuomautukset, 9.10.2026

- **Mittatyökalu → Pinta-ala**: napsauta vastakkaiset kulmat tai vedä suorakulmio.
  Jatka samalla tasolla ja paina Enter. Päällekkäiset, sisäkkäiset ja toistetut
  alueet lasketaan kerran; sisäiset jakorajat poistuvat. Myös L-muodot, aukot ja
  erilliset saarekkeet toimivat. Ensimmäinen pinta määrää tason, myös seinällä;
  Shift projisoi viitepisteen tähän tasoon. Backspace poistaa keskeneräisen
  suorakulmion tai edellisen valmiin; Esc peruu tallentamattoman alueen.
- **Huomautus**: kohdepiste tarttuu nykyisiin kulmiin, keskikohtiin ja reunoihin.
  Toinen napsautus tai veto sijoittaa tekstilaatikon. Valitse-työkalulla laatikkoa
  voi vetää säilyttäen kohdepisteen. Osaan sidottu piste seuraa osan siirtoa;
  kadonnut viite säilyy viimeisessä tunnetussa paikassa punaisella katkoviivalla.
- Oikealla voi muuttaa alueen nimeä/väriä tai huomautuksen tekstiä, laatikon ja
  tekstin väriä, kokoa, lihavointia ja kehystä. Shift+Enter lisää tekstirivin.
- **Merkinnät**-lista sisältää kummatkin tyypit. Yksittäinen ja yhteinen piilotus
  säilyttävät toistensa asetukset. Napsautus, Shift-monivalinta, valintaruutu,
  kontekstivalikko, Delete/X, valintahistoria sekä Peru/Palauta ovat mukana.
- Merkinnät eivät muuta kappaleiden geometriaa. Ne tallentuvat `.nivo`-tiedostoon,
  selaimeen ja historiaan; näkyvät merkinnät tulevat mallinnuksen PNG-kuvaan ja
  tavallisiin mittakuviin sekä niiden SVG-/PDF-vientiin. Muokkaaminen mallinäkymässä.
- Ensiversion rajat: yhdellä pinta-alueella yksi taso ja enintään 64 suorakulmiota,
  projektissa enintään 1000 aluetta/huomautusta. Alueen suorakulmiot pysyvät
  tallennuspaikassaan, eivät seuraa kappaleiden muodonmuutoksia. Merkinnät ovat
  päällimmäisenä piirtyviä suunnittelumerkintöjä, eivät renderimateriaalia.

## V0.28.2 — mittamerkintöjen valinta, teksti ja näkyvyys, 9.10.2026

- Kaikki 3D-dimensiot ovat valittavissa tekstistä tai viivasta. Oranssi korostus,
  Shift-monivalinta ja valintasuorakulmio. Dimensiovalinta säilyy toimintohistoriassa;
  Delete poistaa valitut merkinnät yhdessä peruttavassa toiminnossa.
- Tuplaklikkaus avaa oikealle **Merkinnän teksti** -kentän. Myös mittakuvan ja
  leikkauskuvan dimensioilla sekä apu-/mittaviivoilla on sama tekstieditori.
  `{mitta}` näyttää todellisen, päivittyvän mittaluvun. Tyhjä kenttä palauttaa
  automaattisen tekstin. Merkintä ei ohjaa geometriaa; todellinen mitta näkyy erikseen.
- Mitat/Viivat-listojen silmäkuvake piilottaa yksittäisen merkinnän poistamatta sitä.
  Piilotettu viiva ei osallistu tartuntoihin. Piilotetut merkinnät jäävät listaan;
  monivalinnan voi piilottaa ja palauttaa yhdessä. Yhteinen näkyvyyskytkin säilyttää
  yksittäiset piilotukset. Mittakuvakin kertoo, jos yhteinen kytkin on pois päältä.
- Näkyvyys ja teksti tallentuvat projektiin ja historiaan sekä näkyvät PNG-/SVG-/PDF-viennissä.
  Kahden pisteen dimension valintaklikkaus ei muuta sijaintia. Vetäminen säilyttää
  tarttumakohdan, ja SVG-merkinnät käytetään uudelleen ruutukohtaisen poistamisen sijaan.

## V0.28.1 — ylävalo ja mallinnusnäkymän kuva, 9.10.2026

- **Valaistus → Studio ja ympäristö → Studiovalon korkeus**: 0–90°.
  Molemmat studiovalot suuntautuvat 90°:ssa suoraan mallin yläpuolelta.
  Myös auringon korkeus ulottuu 90°:een. Valopaneelin suunta pysyy vakaana
  suoraan ylhäältä valaistaessa ja muualla kuin origossa.
- Studiovalojen ja ympäristövalon voimakkuuden nolla-asento näkyy tekstinä
  **Pois**. Ne säädetään erikseen nykyisistä liukusäätimistä.
- **Varjot** koskee nopeaa esikatselua, tarkentuvaa kuvaa ja tallennettavaa
  renderiä. Ilman varjoja kappaleet pysyvät näkyvinä ja heijastavina; kyseessä
  on havainnekuvan valaistus. Asetus säilyy myös materiaalin vaihtuessa.
- Vanhojen projektien alkuperäinen studiovalojen sijoittelu säilyy, kunnes
  korkeutta säädetään. Valaistusasetusten Peru/Palauta ja tallennus toimivat.
  Korkeuden muuttaminen ei rakenna geometriaa eikä lataa PBR-karttoja uudelleen.
- Mallinnuksen näyttötilojen vieressä oleva kamerakuvake **Tallenna näkymä PNG**
  tallentaa nykyisen kuvakulman, näyttötilan, ruudukon ja näkyvät mittamerkinnät
  ilman käyttöliittymää. Toiminto löytyy myös komentohausta. Kuvakoko on näkymän
  nykyinen pikselitarkkuus; kameraa, valintaa tai mallia ei muuteta.

## V0.28.0 — kotelotestin korjaukset, 9.10.2026

- Reunat: **Muodon nurkat** poimii pursotetun suorakulmion tai monikulmion
  pursotussuunnan kulmareunat. Suorakulmion **Puolipyöreäksi** asettaa säteeksi tasan
  puolet lyhyestä sivusta. Esim. 4 × 24 mm muoto saa R2-päät, ilman
  erillistä pitkäreikämuotoa. Esikatselu ja muokattava reunakäsittely säilyvät.
- CAD-ytimen epäonnistuessa tarkka puolipyöristys rakennetaan todellisesta
  tasoprofiilista vain, jos sen pursotus vastaa koko alkuperäistä osaa.
  Reiät säilyvät; sokkoporauksia tai muuta geometriaa ei korvata laatikolla.
  Liian suuri säde hylätään, sitä ei pienennetä huomaamatta.
- Tartunnan pisteytyksessä osoittimen etäisyys vaikuttaa yhdessä kohdetyypin
  kanssa: tarkka keskipiste tai reuna ei häviä kauemmalle kulmalle. Apuviivojen
  risteyksillä on edelleen vahva etusija aivan viereiseen geometriaan nähden.
- **Leikkaa aukko**: määrä 1–100, keskeltä keskelle -väli, suunta pinnan
  tasossa tai X/Y/Z, kaikkien valittujen osien läpi tai annettu syvyys.
  Geometrinen esikatselu, kohteiden valinta, yksi Peru/Palauta ja historian
  Palaa leikkaukseen säilyttävät myös sarjan asetukset.
- **Toista aukko** säilyttää juuri tehdyn Push/Pull-leikkauksen profiilin
  ja syvyyden, eikä vaadi erillistä leikkurikappaletta. Lisäaukkojen sarja
  alkaa seuraavasta sijainnista. Sarjan jälkeen toisto jatkaa viimeisestä
  aukosta samalla välillä ja suunnalla. Muu mallimuutos päättää pikatoiston.
- Cut/Join ja Yhdistä löytyvät osan näkyvistä toiminnoista ja kontekstivalikosta.

[Työnkulut ja rajat](enclosure-tools.fi.md).

## V0.27.0 — kaatopintojen tartunnat ja kynärajaukset, 9.10.2026

- Valmiiden loftien, pintojen ja umpiosien kaikki CAD-reunat osallistuvat
  yhteiseen tartuntahakuun. Geometrisesti suorat spline-reunat tunnistetaan
  suoriksi. Kaarien tessellointi ei muodosta ylimääräisiä verteksikohteita.
- Aloituspiste säilyttää poimitun reunan 3D-korkeuden. Ympyrän tartunta ja
  viivaristeys käyttävät tarkkaa ympyrää, myös siirretyissä instansseissa.
- Shift poimii alemman/ylemmän viitteen lukittuun suuntaan. Viivatason ja
  reunan projektio nimetään erikseen. Kynän Shift-vapautus päivittää heti.
- Suora kynä täydentää suljetut piirrosverkot pinnoiksi eri korkeuksilla.
  Neliö–kaivo-esimerkki ja neljän eri korkopisteen rajaus testataan.
  Seuraava yhdysviiva jakaa koskemattoman verkon uudelleen yhdessä
  historiatoiminnossa; lukitus ja myöhempi muokkaus suojaavat tulospinnan.
- Jatko: kaatoprosentit, reunaverkon näkyvä hallinta, paksuntaminen ja pintojen
  yhteenompelu; yleiset ei-tasoprojektoitavat verkot ja jatkumon hallinta.
  Mittaviivat ovat edelleen viitteitä, eivät automaattisen täytön CAD-rajoja.

## V0.26.0 — käyrien kautta mallintaminen, 9.10.2026

- Bézierin oletus on napsautettujen pisteiden kautta kulkeva kuutiollinen käyrä.
  Kaksi pistettä muodostaa suoran; Enter viimeistelee ja alkupiste sulkee muodon.
  Aiempi ohjauspistetapa säilyy valittavana. Shift-viitehaku, akselit ja mitat
  käyttävät kynän yhteistä vuorovaikutusta.
- Käyrän ja ympyrän neljännespisteet sekä kaari itse osallistuvat yhteiseen
  tartuntahakuun. Valitulle käyrälle voi lisätä prosenttikohdan tai 4/8/16 jaon.
  Pisteet näkyvät viivoissa; täytetyn kaaren pisteet näkyvät sen ollessa valittu.
  Asetukset, kopiointi, kierto ja tallennus säilyttävät tiedot.
- Bézier-pisteiden X/Y/Z-muokkaus oikealla. Muutos on yksi peruttava toiminto;
  Hold ja linkitettyjen osien säännöt pysyvät voimassa.
- Rakennusympyrä, ellipsi ja suorakulmio ovat nollapaksuisina oikeita CAD-viivoja.
- Muodot → Muotojen läpi: järjestetty profiililista, suunta, pehmeä/suora
  siirtymä, sivujen sulkeminen ympäri ja päätyjen sulkeminen. Kärkeen päättäminen
  tekee myös varsinaisen kartion. Esikatselu ei muuta mallia; hyväksyntä on yksi
  historian askel. Lähtömuodot säilytetään ja voidaan piilottaa hyväksyessä.
- Mukana julkinen, synteettinen pullo-, poikkileikkaus- ja kartioesimerkki.

[Työnkulku ja rajat](through-shapes.fi.md).

## Backlog — käyräpintojen jatko

- Hiirellä siirrettävät käyräpisteet ja tangenttikahvat, tangenttijatkuvuuden
  hallinta sekä pistekohtainen suora/kaareva kulma.
- Poikkileikkausten ja sivuohjaimien yhdistäminen samaan pintaratkaisuun;
  tässä prototyypissä ne ovat kaksi erillistä rakennustapaa. Pullon ympyrät
  toimivat sivukäyrien asetteluviitteinä, eivät koko kehän lisärajoitteina.
- Suljetun sivupinnan sauman G1/G2-jatkuvuus, profiilien aloituskohdan ja
  vastaavuuksien näkyvä ohjaus, risteävien pintojen lisätarkistus.
- Parametrinen riippuvuus lähtökäyristä valmiiseen pintaan. Nyt tulos on
  itsenäinen CAD-kappale: lähtömuodon muutos ei päivitä tulosta automaattisesti.
- Tartuntapisteen sijoitus hiirellä ja jako tarkalla kaaripituudella.
  Prosenttikohta käyttää nyt käyrän parametria, ei millimetripituutta.
- Kuoren paksuus, valitut päätykannet ja reiälliset profiilit; sweep ja revolve
  erillisinä jatkotyökaluina. Vapaaverkon deformointi ei korvaa CAD-pintaa.

## V0.25.0 — valaistus ja esityskuvan viimeistely, 8.–9.10.2026

- Renderin kolme näkymää: Materiaali, Valaistus ja Kuva. Työkalun tai välilehden
  vaihto avaa asetuspaneelin alusta; osan omat valonlähdeasetukset säilyvät materiaaleissa.
- Neljä valaistuspohjaa: Studio, Päivänvalo, Iltavalo ja Omat valaisimet.
  Auringon suuntaa voi vetää kehällä tai säätää nuolinäppäimillä; korkeus,
  voimakkuus, valon väri ja varjon pehmeys näkyvät heti. Sama suunta säilyy
  nopeassa, tarkentuvassa ja erikseen tallennettavassa kuvassa.
- Studiovalojen suunta, teho ja pehmeys sekä ympäristö, valotus ja lattia samassa
  kokonaisuudessa. Yksi liukusäätimen/auringon veto on yksi historian askel.
  Esc peruu keskeneräisen esikatselun. Asetukset tallentuvat projektiin.
- Tasapainoinen / Filminen kuvailme. Vanha kuvailme säilyy oletuksena.
  Kuvailmeen ja valotuksen vaihto säilyttävät lasketut näytteet. Kohinan
  pehmennys kevenee näytemäärän kasvaessa, jotta pintadetaljit säilyvät.
- Valon suunta ja voimakkuus eivät lataa kaikkia PBR-karttoja uudelleen.
  Valotuksen säätö ei laske varjokarttoja uudelleen. Kuvanvienti ja erillinen
  laskenta odottavat heijastusympäristön sekä materiaalien valmistumisen.
- Erillinen kuvanlaskenta käsittelee enintään neljä 256 px laattaa lyhyessä
  työerässä. Työerien välissä annetaan aikaa käyttöliittymälle. Koko kuva
  yhdistetään tallennettavaksi vasta lopussa, ei jokaisen laatan jälkeen.
- Auringon ja studion tehot ovat suhteellisia. Nopea kuva käyttää varjokarttoja;
  tarkentuva kuva laskee valopintojen koon mukaiset varjot ja epäsuoran valon.

Jatko: fyysisen Safari/iPad-laitteen varmennus, kapeiden valoaukkojen kohinan
vähentäminen, mitatut valotehot sekä suurten sisätilojen renderin suorituskyky.

## V0.24.2 — apuviivojen näkyvyyshaun korjaus

- Käyttäjän tallentamassa mallissa toistettu noin 20 FPS:n kamerakierto.
  Mallissa 26 osaa, 24 apuviivaa ja noin 178 000 näyttökolmiota. Materiaalien
  poistaminen ei auttanut; apuviivojen poistaminen poisti hidastumisen.
- Välimuistissa oleva kolmiohakupuu rajaa pisteiden ja tekstien peittotarkistukset.
  Pienten taso-osien tarkistus pysyy kevyenä, eikä CAD-kolmioiden järjestys muutu.
  Haamut, wireframe, yksittäinen/yleinen x-ray ja poikkileikkausten näkyvä puoli säilyvät.
- Sama malli samalla Chromella: kameraruudun mediaani 50 → 8,3 ms, noin 20 → 120 FPS.
  Ennen/jälkeen-kuvakaappaukset olivat identtiset. Käyttäjän tiedosto säilyy paikallisena.

## V0.24.1 — kameraliikkeen työkaluhakujen kuormitus

- Kameran kierto, panorointi ja kahden sormen navigointi keskeyttävät työkalun
  kohdehaun liikkeen ajaksi. Siirtokorostus ei kulje kameran alla osasta toiseen
  eikä lataa tekstuureja uudelleen. Tavallinen osoitus jatkuu kameravedon jälkeen.
- Erillinen, käsin käynnistettävä 12 kaapin mustan tammiviilun suorituskykykoe:
  tekstuurin koko ja kierto, yksittäiset kopioinnin toistot sekä kymmenen oven erä.
- Ensimmäinen vertailumalli ei toistanut käyttäjän 15–30 FPS:n kamerakiertoa.
  Käyttäjän tarkalla projektilla pääsyy löytyi ja korjattiin versiossa 0.24.2.

## Backlog — vanhempien käyttöliittymätestien tarkistus

- `snap-annotations.spec.ts`: mittaviivojen risteyksen sijasta haetaan myös
  1 mm päässä olevaa apuviivan ja levyn reunan risteystä; tutki kilpailutilanne.
- Saman tiedoston fillet-korostuksen pikselikoe ei löydä oransseja pikseleitä
  odotetusta kuva-alueesta. Tarkista kameran projektio ja korostus.
- Molemmat epäonnistuvat samalla tavalla myös ennen näkyvyyskorjausta julkaistussa
  versiossa 0.24.1; ne eivät syntyneet kolmiohakupuun käyttöönotosta.

## V0.24.0 — metallit ja puunsyyn suunta

- Kupari, hapettunut kupari, musta kromi sekä anodisoitu alumiini: hopea, musta,
  samppanja, pronssi, sininen ja punainen. Kaikki löytyvät Metallit-osiosta.
- Sileä / harjattu kuviointi toimii mm. messingille, kuparille, kromille ja alumiinille.
  Väri ja kiilto säätyvät erikseen. Hapettuneen kuparin oma patinakuvio säilyy;
  sen väri, karheus, korkeus ja metallisuus perustuvat samaan proseduraaliseen maskiin.
  Nämä ovat visuaalisia materiaalimalleja, eivät mitattuja valmistajareseptejä.
- Mallinnuksen metalleille kevyt, kerran luotava heijastusympäristö. Kiiltävä kromi
  ei enää näy mustana, kun suorat valot eivät osu heijastussuuntaan.
- Uuden puumateriaalin asettelu huomioi osan oman koordinaatiston ja pitkän sivun
  maalipensselissä, ominaisuuksissa ja renderin materiaalivalinnassa. Sävyn ja
  kiillon muutos säilyttävät käsin tehdyn asettelun. Vanhoille pinnoille suora
  suuntauspainike, joka ei vaihtele tekstuurin lähtöpistettä.
- Amerikanpähkinä · ruskea viilu ja Euroopanpähkinä · lämmin / tumma viilu.
  Kaikki aiemmat kuvat säilyvät. Harmaanruskea viilu saa väriä kuvaavan nimen;
  tummanruskeaksi sävytetyt käyttäjän materiaalit säilyvät muuttumattomina.

## Backlog — valaistus ja esityskuvan viimeistely

- Yhteinen Valaistus-näkymä: auringon suunta ja korkeus visuaalisella säätimellä,
  väri / värilämpötila, voimakkuus sekä varjojen pehmeys. Erottele aurinko,
  studiovalo ja ympäristövalo ymmärrettävästi; nykyinen päävalo on studiovalo.
- Yhtenäinen nopean ja tarkentuvan näkymän valon suunta. Varjon fysikaalinen
  pehmeys erilleen kohinanpoistosta; materiaalin syyt ja pienet yksityiskohdat
  säilyttävä terävyyden säätö. Vältä vaaleita reunuksia ja yliterävöitystä.

## Backlog — kiinnikkeet ja pyörähdysprofiilit

- Kupukanta, linssikanta ja tavallisimmat pultinkannat yksinkertaisesta
  kiinnikevalikosta: halkaisija, kannan korkeus, varren pituus ja upotus / kantaura.
- Profiilin pyöräytys akselin ympäri tarkkoja pyörähdyskappaleita varten.
- Kevyt kierreetön oletus kalustevisualisointiin; tarkka kierre tarvittaessa.
  Toistettavat linkitetyt kiinnikkeet, asettelu pinnalle ja leikkauslistan rajaus.

## V0.23.0 — pintakokoelma ja tekstuurin värisävy

- Yhteinen **Pintakokoelma** korvaa Aidot pinnat -nimen. Kokoelman sisäinen
  suodatus: puut, kivet ja laatat, seinäpinnat, tekstiilit ja nahka sekä maalit.
- 16 uutta Poly Havenin CC0-PBR-pintaa, yhteensä 25. Yhdeksän puutekstuuria
  täydentävät tammea, pähkinää, saarnia, vaahteraa, kirsikkaa, tiikkiä ja bambua.
  Mukana myös pellava, kaksi nahkaa, graniitti, terrazzo, terrakotta ja harmaa rappaus.
- 12 Nivon omaa maalisävyä, matta lähtöpinta ja yhteinen kiillon säätö.
  Sävyjä ei esitetä valmistajan, RAL:n tai NCS:n tarkkoina vastineina.
- Uudelle PBR-materiaalille värisävyn vaihto säilyttää kuvan valoisuuserot ja
  kohokuvion. Valkoinen palauttaa alkuperäisen kuvan. Kuultava sävy käyttää
  aiempaa kertolaskua; vanhat tallennetut materiaalit säilyvät tällä tavalla.
- Kartat pysyvät paikallisina 1K-resursseina ja latautuvat käytettäessä.
  Puunsyiden suunta tarkistettu kuvista; valkotammi kulkee V-akselia, muut uudet puut U-akselia.

## Backlog — sävytetty lakkakerros

- Pohjapinnan väristä erillinen lakan sävy, voimakkuus ja kiilto. Puunsyyt näkyvät
  pinnoitteen läpi. Sävy ei ole sama asia kuin pohjatekstuurin värin muuttaminen.
- Toteuta yhtenäisesti mallinnusnäkymään, nopeaan ja tarkentuvaan renderiin sekä
  kuvanvientiin. Pelkän pohjavärin kertomista ei nimetä fyysiseksi lakkakerrokseksi.
- Testaa kirkas ja sävytetty lakka puulla, sävyn nollaus, mattapinta, materiaalin
  tallennus sekä vanhojen projektien ulkonäön säilyminen.

## Backlog — puupintojen täydentäminen

- Täydennä jatkossa koivun, kuusen, haavan, lepän ja pyökin valokuvapinnat, kun
  puulaji sekä sovelluksen mukana jaettava lisenssi voidaan varmistaa. Nykyinen
  koivupreset säilyy Massiivipuut-osiossa; toista puulajia ei nimetä koivuksi.

## V0.22.0 — renderin vaste, pintakokoelma ja kuvan laatu

- Materiaalinvaihto säilyttää geometrian ja tracing-BVH:n. Valotuksen säätö säilyttää näytteet.
- Varjostin valmistellaan etukäteen ajureilla, joilla kääntäminen onnistuu asynkronisesti.
- Metal-GPU:lla mustuneen clearcoat-pinnan Fresnel-laskennan määrittelemätön pow korjattu.
- Yhdeksän CC0-PBR-pintaa: mänty, tammi, pähkinä, kipsi, rappaus, kaksi betonia, marmori ja laatta.
  Paikalliset väri-, normal-, karheus- ja korkeuskartat, mittakaava ja lähdetiedot mukana.
- Samat tekstuurin siirto-, kierto- ja hajontatoiminnot toimivat uusilla pinnoilla;
  puunsyy tunnistetaan kuvan todellisen suunnan mukaan.
- Nopea ja tarkentuva renderi käyttävät samaa HDRI-studiota. Kuvan viennillä on oma kopio.
- Tarkentuvassa kuvassa laajat studiovalot pehmentävät varjoja. Sammutetut valot eivät kuluta valonäytteitä.
- Reunat huomioiva kohinan pehmennys voidaan poistaa käytöstä. Se ei muuta näytteiden kertymistä.
- Täysi laatu ja kuvanlaskenta käyttävät 16 valon kimpoamista; 4096 näytteen sisätilavaihtoehto.
- Seuraavaksi: lumen/lm-per-m-kalibroitu LED, mitattu kameraresponssi suurissa sisätiloissa,
  hermoverkkopohjainen kohinanpoisto sekä erikseen validoitu WebGPU-siirtymä.
  Nykyinen pehmennys ei korvaa riittävää näytemäärää hämärässä epäsuorassa valaistuksessa.

## V0.21.5 — tarkennuksen käynnistyminen ja valmistuminen

- Ensimmäisen näytteen valmistelu näkyy omana tilanaan. Nopea esikatselu säilyy
  näkyvissä valmistelun ajan; kameran ylimääräistä liikuttamista ei tarvita.
- Kohtauksen valolaskennan shader valmistellaan vasta sen asetusten selvittyä.
  Sumun, syväterävyyden ja taustakuvan kytkimet asetetaan yhdessä, jotta aloitus
  ei käännä tarpeettomia väliversioita. Sama koskee erillistä kuvanlaskentaa.
- Ikkunan menettäessä fokuksen tai kameravedon menettäessä osoittimen kaappauksen
  tarkennuksen odotus vapautuu. Tavallinen kameraveto pitää laskennan tauolla.
- Pieni näytemäärätavoite ei pysäytä kuvan siirtymää puoliväliin: lopputulos on
  kokonaan tarkentuva kuva. Näytteiden kertyminen pysähtyy asetettuun tavoitteeseen.
- Täysi-laatu käyttää näkymän kokoista laskentapuskuria myös aiemman tavoitteen
  valmistuttua. Tarkentuva-painikkeella voi jatkaa käyttäjän tauottamaa laskentaa.
- Valaistuksen voimakkuuskertoimia ei muuteta. Valkoinen valokotelo heijastaa
  tummaa koteloa enemmän; nykyinen suhteellinen kerroin ei ole lumenkalibrointi.
  Ensimmäisen GPU-ohjelman valmistelun nopeus riippuu edelleen selaimesta ja
  näytönohjaimesta; asynkroninen valmistelu ja kuvan kohinanpoisto ovat jatkotyötä.

## V0.21.4 — piirron aloitustaso, pintakäsittely ja renderin sujuvuus

- Kynän ja vapaan mittaviivan näkyvä aloituspiste seuraa ruudukkoa jo ennen
  napsautusta. Perspektiivissä tyhjän tilan oletus on z=0; kameran kallistus ei
  vaihda sitä pystytasoksi. Kappaleiden ja apuviivojen tarkat tasot sekä sivunäkymät
  säilyvät. Lähes horisontin suuntainen säde ei aloita piirrosta kaukaisuuteen.
- Vapaan mittaviivan X/Y/Z-lukitus säilyttää etenemissuunnan myös ilman seuraavaa
  hiiren liikettä. Pinnan oma piirroskehys säilyy vapaassa mittauksessa.
- Matta ja Kiilto 0 % poistavat kirkkaan pintalakan. Käyttäjän karheusasetus
  ohittaa tekstuurin karheuskartan, joka aiemmin saattoi palauttaa kiillon.
  Materiaalin oma pintakäsittely palauttaa myös sen karheuskartan.
- **Peili**: levyn yksi leveä tahko oletuksena; Peilin puoli vaihtaa kääntöpuoleen
  tai molempiin. Sivureunat ja tausta ovat himmeät. Paikallinen suunta seuraa
  kappaleen kiertoa. Mallin todelliset heijastukset lasketaan Tarkentuva-tilassa.
- **Seinälaatta · valkoinen 100 × 200 mm**, skaalattava ja kierrettävä kuten muut
  materiaalit. Materiaalipresetit yhteensä 56.
- Kameran liike ei lataa kaikkia tekstuureja uudelleen näytönohjaimelle. Liikkeen
  aikana näytetään nopea esikatselu ja tarkennus jatkuu lyhyen asettumisen jälkeen.
  Paikallaan pysyvän mallin varjokartat säilyvät orbitin aikana. Luonnostarkennuksen
  pisin sivu on enintään 800 pikseliä; täysi laatu ja erillinen kuvanlaskenta säilyvät.
- Suorakulmaiset LED-valopinnat osallistuvat tarkentuvan renderin kohdennettuun
  valon näytteistykseen. Fyysinen valopinta näkyy edelleen kamerassa ja lasin läpi;
  saman heijastuneen säteen valo lasketaan vain kerran. Kaarevat valopinnat käyttävät
  edelleen geometrian emissiota. Nopea-tila ei laske epäsuoraa huonevalaistusta.

## Backlog — valaistuksen yksiköt ja kuvan laatu

- **Ensimmäinen kuva ilman rinnakkaiskäännöstukea.** V0.22 erottaa fyysisen GPU:n
  ja headless-ohjelmistopiirron: aiempi noin 50 s viive koski jälkimmäistä.
  M1 Prolla kylmä diagnostiikkakohtaus käynnistyi noin 2,7 s:ssa ja valmistellun
  PBR-esikatselun 8 näytettä noin 0,44 s:ssa. Selvitä edelleen kevyempi aloitus
  hitailla ajureilla ja ohjelmistopiirrossa; taustavalmistelu ei yksin nopeuta
  itse kääntäjää. Mittaa myös suuret sisätilat ja fyysiset mobiililaitteet.
- Valon nykyinen voimakkuus on suhteellinen kerroin, **ei lumenluku**. LED-nauhalle
  ehdotetaan lm/m ja valaisimelle lm. Toteutus tarvitsee pituuden/pinta-alan,
  säteilyjakauman, värin ja millimetreissä toimivan kohtauksen yhteisen kalibroinnin.
  Vanhojen arvojen säilytys ja siirtymä on ratkaistava; arvoa 50 ei nimetä uudelleen
  50 lumeniksi. Mittaus referenssikohtauksella ennen fysikaalisia lupauksia.
- Epäsuoran valon kohinan vähentäminen, peilausten laatutesti ja vaativan sisätilan
  suorituskykykoe. Suorakulmaisen LED:n kohdennettu näytteistys auttaa, mutta pieni
  valoaukko voi edelleen vaatia paljon näytteitä. V0.22:n kevyt reunat huomioiva
  suodatus sai V0.41:ssä suhteellisen HDR-vertailun ja normaali-/albedo-/syvyysopasteet.
  Seuraavaksi valon varianssin ja heijastusten huomiointi vaativissa sisätiloissa.
- V0.22 toi yhdeksän aitoa PBR-pintaa ja yhteisen HDRI-studion. Seuraavaksi
  lisää puu- ja kalustelevypintoja, valokuvavertailu ja suurempien materiaalien
  tarkkuuden valinta hallitulla muistibudjetilla sekä sisätilan valaistusopastus.

## Suunnitteluehdotus — reunojen siirto ja liittyvien pintojen mukautuminen

**V0.36.0:** sisäkkäisiin tasorajauksiin perustuva korkeuspinta on toteutettu
omana toimintona (yllä). Alla kuvattu yleinen reunojen vapaa siirto on edelleen
jatkotyötä. Tavallinen M/R/L käsittelee osaa käyttäjän myöhemmän linjauksen mukaan;
vapaa pintamuotoilu tarvitsee oman selkeästi erottuvan toiminnon.

Tavoite on **yleinen mallinnustoiminto**, ei vain kaatolattiatyökalu.
Valitse reuna tai reunaketju (myös koko ympyrän kehä), siirrä M:llä ja
X/Y/Z-suunnalla tai täsmällisellä mitalla. Reunan molemmin puolin liittyvät
pinnat mukautuvat; siirtämättömät rajat säilyvät. Esimerkkejä ovat kaatolattia,
vino katto, kalteva hylly ja osan muotoilu. Push/Pull säilyy erillisenä
pinnan pursotuksena. Reunan valinta pitää erottaa koko osan valinnasta
ilman, että Shiftin viitehaku rikkoutuu. Esikatselu kertoo mitä muuttuu;
itseään leikkaava tai muuten mahdoton tulos hylätään alkuperäistä muuttamatta.
Muokataan CAD-topologiaa, ei pelkästään näytettävän kolmioverkon pisteitä.
Pinnan triangulointi/taitteet, kaarevat rajat, sisäaukot ja umpiosan ehjyys
ovat toteutuksen keskeiset reunatapaukset. Kaatolattia on ensimmäinen
hyväksymistesti tälle yleiselle toiminnolle.

Täsmennetty työnkulku (9.10.2026): piirrä 2110 × 2750 mm lattia, sijoita
suihkualue 1000 mm apuviivoilla ja piirrä siihen 900 × 900 mm rajaus.
Laske sisemmän suorakulmion kehää 10 mm; ympäröivä lattia mukautuu siihen
ulkoreunan pysyessä paikallaan. Piirrä alueeseen kaivon ympyrä ja laske sen
kehää vielä 10 mm suhteessa suihkualueeseen. Korkotasot ovat näin 0, −10
ja −20 mm, kaivon keskusta jää auki. Rajaukset kuuluvat samaan pintaan,
eivät ole erillisiä siirrettäviä laatikoita. Tämä **ei vielä ole toteutettu**.
Nykyinen Muotojen läpi ei päivitä ympäröiviä pintoja näin. Tarvitaan yhteisen
pintatopologian korkeussäätö; sen pitää toimia myös millimetrisyötöllä,
historialla ja tallennuksella. Näytetään muuttuva kaato sekä tasaiset ja
vastakaatoiset kohdat. Yhteiseen ulkoreunaan osuvat sisärajaukset pitää
käsitellä erikseen, eikä samaan pisteeseen voi sitoa kahta eri korkeutta.

Käyttäjän esimerkki: suurempi kylpyhuoneen lattia laskee 1 × 1 m suihkualueelle,
joka laskee jyrkemmin pyöreälle kaivolle. Tämä ei vielä ole toteutettu ominaisuus.

- Ylänäkymässä lattian ulkoraja, suihkualueen raja ja pyöreä kaivo. Reunoille ja
  pisteille korkeudet tai kaadot; pinta ja poikkileikkaus päivittyvät 3D:nä.
- Kaivon kehällä yksi yhteinen korkeus. Taiteviivat säilyvät täsmällisinä ja
  korkeuspisteitä/reunoja voi myöhemmin nostaa hiirellä tai millimetreinä.
- Pinnan topologia rakennetaan korkeusehdoista: yleisesti neljä nostettua pistettä
  eivät ole samassa tasossa. Tarvitaan hallittu jako tasopintoihin tai nimenomainen
  kaareva pinta; pelkkä näyttöverkon pisteiden siirto rikkoisi CAD-geometrian.
- Tasakorkuiselta neliöreunalta pyöreään kaivoon ei saada joka suuntaan samaa
  kaatoprosenttia, koska matkat vaihtelevat. Näytetään todelliset kaadot ja
  vastakaadot; ristiriitaisia ehtoja ei korjata huomaamatta.
- Ensimmäisen version rajaus ehdotuksena: yksi alue ja kaivo, sisempi suihkualue,
  korkeussäädöt, ehjä lattian paksuus, Peru/Palauta ja tallennus. Yleinen vertex-/
  reunamuokkaus sekä usean kaivon ja epäsäännöllisten alueiden ratkaisu jatkotyöksi.

## V0.21.3 — vakaa orbit, maali ja renderin korjaukset

- Orbit säilyttää vaakasuoran horisontin. Samanaikainen pysty- ja vaakakierto
  vastaa aiempaa tavallista 3D-orbitia; kaarevat hiirenvedot eivät kerrytä
  sivuttaiskallistusta. Ylä-/alanäkymän ensimmäinen pystyliike poistuu navalta
  kummallakin vetosuunnalla. Kohdistimen orbit-keskus, kuutio ja zoomi säilyvät.
- Tarkentuvan ja taustalla laskettavan renderin ohjelmakoodi ladataan sovelluksen
  mukana. Käynnistys ei tarvitse myöhempää moduulihakua, joka voisi epäonnistua
  vanhaan selainvälilehteen Pages-julkaisun jälkeen. GPU-resurssit luodaan
  edelleen vasta renderöinnin käynnistyessä.
- Nopean esikatselun LED-valo käyttää varjostettuja valonäytteitä: peittävä
  geometria estää valon myös lasin läpi katsottaessa. Esikatselu käyttää
  rajattua, yhteistä kahdeksan paikallisen varjovalon budjettia. Tarkentuva
  renderi käyttää kaikkia todellisia valopintoja ja spotteja ilman tätä rajaa.

- **Maali · tasainen väri** materiaalilistan alussa, myös osan materiaaleissa
  ja renderöinnissä. Ei tekstuuria, kohokuviota, metallisuutta tai läpäisevyyttä.
  Uuden pensselin lähtökohta on valkoinen, silkinhimmeä maali.
- Valitse pensseliin sävy ja pintakäsittely (Matta / Silkinhimmeä / Puolikiiltävä /
  Kiiltävä tai Kiilto-säädin), sitten napsauta maalattavia osia. Maali korvaa
  aiemman materiaalin kuvioineen; osien geometria ja sijainti säilyvät.
  Vanhojen projektien materiaalit eivät muutu itsestään.

## V0.21.2 — selkeä näkymäpalkki, vapaa kierto ja valinnan korostus

- Kuutio hoitaa suunnanvaihdot zoomia säilyttäen. Päällekkäiset 3D / Edestä /
  Sivulta / Ylhäältä -painikkeet poistuvat. Näyttötilojen vieressä oleva
  **Yleisnäkymä** palauttaa viiston perspektiivin ja sovittaa koko näkyvän mallin.
  **Sovita näkymään** säilyttää suunnan ja sovittaa valinnan tai koko mallin.
- Kameran kierto käyttää näytön akseleita eikä pysähdy ylänäkymän jälkeen
  maailmankoordinaatiston napaan. Kohdistimen orbit-keskus ja zoomaus säilyvät.
  **Korjaus v0.21.3:** tämä vapaa kierto kerrytti sivuttaiskallistusta; orbit
  palautettiin horisontin säilyttävään liikelogiikkaan.
- Valitse-työkalun Shift korostaa koko osoitettavan osan tai suljetun kokoonpanon,
  samoin kuin napsautus valitsisi. Korostus vaihtuu myös ilman hiiren liikettä.
  Push/pullin Shift-viitehaku säilyy ennallaan.

## Backlog 7.10.2026 — Valinta-paneelin selkeytys ja usean pinnan käsittely

- **Toteutettu v0.30.0: Valinta-paneelin toiminnot kahdelle yhtenäiselle riville:** Siirrä / Kopioi /
  Poista; niiden alle samalla rivityksellä Muokkaa osaa / Kierrä / Kiinnitä.
  Jälkimmäiset eivät kuulu sisennettyinä Materiaali- tai Komponentti ja linkitys
  -osioiden jatkoksi. Avattavien osioiden rakenteen pitää pysyä siistinä.
- **Valinta-paneelin yläosa rauhallisemmaksi:** nimi, ryhmä ja keskeiset tilat
  selkeästi omille paikoilleen. Yhdellä vilkaisulla tulee ymmärtää, mitä on valittu
  ja mistä tärkeimmät toiminnot löytyvät. Vähennetään kilpailevia painikkeita ja
  sisennyksiä. V0.30.0 yhtenäistää päätoiminnot ja siirtää muotoilun avattavaan
  osioon; laajempi tilojen ja ryhmävalinnan selkeytys jatkuu.
- **Usean pinnan yhteinen push/pull:** suunnitellaan pintojen kerääminen ennen
  E-toimintoa. Push/pullin aikana **Shift on aina viitehaku**, ei monivalinta.
  Myös muut yhteiset pintamuokkaukset huomioidaan. Valintatapaa ei ole vielä
  päätetty: vältetään jatkuvaa tilojen vaihtamista ja säilytetään suora E/O-käyttö.
  Numerot 1–4 säilyvät näyttötiloille. Osat/Pinnat-kytkintä ei ole hyväksytty
  eikä monen pinnan push/pullia toteutettu.

## V0.21.1 — reaaliaikainen sävy ja kopioiden numerointi

- Värivalitsin näyttää sävyn heti mallissa ja renderöinnissä. Esikatselu päivittää
  materiaaleja ilman CAD- tai näkymägeometrian uudelleenrakennusta. Myös linkitetyt
  kopiot osallistuvat materiaalin jakamisen sääntöjen mukaan. Hold säilyy suojattuna.
- Hyväksy tallentaa yhden peruttavan muutoksen, Esc palauttaa tallennetun värin.
  Esikatselua ei tallenneta projektitiedostoon. Työkalun tai kohteen vaihto purkaa sen.
- Osien ja ryhmien uudet kopiot saavat `(kopio #1)` -päätteen. Alkuperäisen ja sen
  kopioiden kopiointi jatkaa yhteistä nimisarjaa, myös Toista-komennossa. Vanhoja
  nimiä ei muuteta taustalla; vanhasta `kopio kopio` -nimestä tehty uusi kopio
  saa siistin numeroidun nimen. Piilotetutkin nimet huomioidaan numeroinnissa.

## V0.21.0 — kynä, näkymät, pintakäsittely ja kopioiden linkitys

- Näkymän yläreunan yksi mittaviivakytkin piilottaa kaikki tallennetut dimensiot,
  vapaat mittaviivat ja apuviivat. Piilotettuja viitteitä ei voi poimia tai valita
  näkymästä. Tiedot ja mittakuvan merkinnät säilyvät; tila tallentuu projektiin.
- Tavalliset malliosat linkittyvät kopioitaessa samalla tavalla kuin komponentit.
  Rakentamisen apumuodot ja piirrokset säilyvät itsenäisinä. Ryhmää tai kokoonpanoa
  kopioitaessa vastaavat osat linkittyvät; ryhmä ja kokoonpano säilyvät eri käsitteinä.
- Tee ryhmä uniikiksi irrottaa koko ryhmän ja sen alaryhmien osat ulkopuolisista
  määrittelyistä. Ryhmän sisäiset toistuvat osat pysyvät keskenään linkitettyinä.
  Tämä ei ole rakennesääntöihin perustuva kokoonpanomalli: kansiorakenteen ja osien
  sijoittelun muutoksia ei monisteta muihin ryhmiin.
- Pikaleikkaus ja pinnanjako säilyttävät linkityksen oletuksena. Paikallinen muutos
  vaatii näkyvän Tee kohteista uniikkeja -valinnan. Veitsi monistaa vastaavat palat
  kopioiden omiin sijainteihin ja kiertoihin; palat pysyvät linkitettyinä.
  Saman komponentin ristiriitainen leikkaaminen useasta esiintymästä keskeytyy:
  valitse yksi yhteiseksi lähtökohdaksi tai tee kohteista uniikkeja.
- Tekstuurin asettelu käyttää erillistä osakohtaista `localTexture`-valintaa.
  Kuvion siirto/vaihtelu ei enää irrota sävyä, kiiltoa ja materiaalia linkityksestä.
  Aiempi nimenomainen esiintymäkohtainen materiaalivalinta säilyy.

- Kynän ensisijainen mitta on aina **viivan pituus esikatselun suuntaan**,
  myös kierretyssä kameranäkymässä ja miinusakseleilla. Negatiivinen pituus
  kääntää suunnan. Tab siirtää tarvittaessa maailman X/Y/Z-siirtymiin; ensin
  etenemistä vastaavaan akseliin. Tyhjä siirtymäkenttä vastaa nollaa. Enter
  lisää pisteen ja palauttaa syötön mallinnusnäkymään, jotta seuraavat numerot ja
  Shift eivät jää aiempaan kenttään. Maailman akselistoa ei kierretä kameran mukana.
- Shiftin vapautus säilyttää jo kirjoitetun mitan. Uusi piste vapauttaa väliaikaisen
  suuntalukon. Näkyvä vapautuspainike säilyttää keskeneräisen viivan ja piirtotason.
- Kameran kääntyessä piirtotason suuntaiseksi kynä saa käyttökelpoisen tason
  viimeisen pisteen kautta. Tarkat kulmat ja viitteet säilyttävät 3D-sijaintinsa;
  vain tarkoituksellinen suuntalukko projisoi viitteen lukitulle suoralle.
- Kynä ja yhteinen viitehaku tunnistavat mitta-/apuviivan ja todellisen CAD-reunan
  3D-risteyksen. Vapaa mittaviiva pysyy rajallisena, apuviivan jatke tarttuu.
  Piirto suosii pääakselia enintään 5° poikkeamalla; tarkka ankkuri menee edelle.
  Shift lukitsee näin löydetyn suunnan ja voi edelleen poimia viitteen pituudeksi.
- Yhteinen tartuntageometria sisältää myös eri osien tasopintojen todelliset
  risteysviivat, päät ja keskipisteet. Nostettu lattia muodostaa seinään uuden
  viitesauman. Rajaus kunnioittaa pintojen aukkoja; piilotetut ja peittyvät viitteet
  eivät kilpaile näkyvän sauman kanssa. Sama haku palvelee muotoja, kynää,
  mittaamista, siirtämistä ja Shift-push/pullia molemmissa muokkaustiloissa.
  Laskenta käyttää lähellä osoitinta olevia osia ja geometriakohtaista välimuistia.
  Kaarevien pintojen keskinäiset analyyttiset risteyskäyrät jäävät jatkotyöhön.
- Mallin näyttötilat Solid / Tasaväri / Ghost / Wireframe valinnalle tai koko
  näkymälle. Ghostin läpi valitaan, mutta sen tarkkoihin pisteisiin tarttuu.
  Numerot 1–4 vain vapaassa Valitse-tilassa; yläreunassa vastaavat kuvakkeet.
  Tilat tallentuvat projektiin, tukevat Peru/Palauta-toimintoja ja säilyttävät materiaalit.
- Ylänäkymän orbitin vanhentunut kiertoakseli korjataan kameran pystysuunnan vaihtuessa.
  Nimetyillä tahkoilla varustettu näkymäkuutio vaihtaa suuntaa ja sallii hiiri-/kosketuskierron.
  Kuution ja näkymäpainikkeiden suunnanvaihto säilyttää zoomauksen ja tarkastelukohdan.
  Sovita näkymään on erillinen yleisnäkymän komento.
- Tekstuurin sävy ja alkuperäisen värin palautus materiaalipaneelissa. Pintakäsittelyt
  Matta / Silkinhimmeä / Puolikiiltävä / Kiiltävä sekä Kiilto-säädin mallinnuksessa,
  maalipensselissä ja renderissä. Sama materiaalitieto ohjaa molempia renderöintitapoja.
- P-työkalun Maalaa / Tekstuurin asettelu: jatkuva pinnasta siirto, kierto- ja
  kokokahvat sekä tarkat luvut. Mallinnus ja renderi käyttävät samoja hiiritoimintoja.
  Veto tallentuu yhtenä historiatoimintona. Tekstuurin asettelu on esiintymäkohtainen.
- Valinnainen **Vaihtele valitut tekstuurit**: hajonta kuvion koon suhteessa,
  kierron vaihtelu oletuksena pois. Valmiiden puukuvioiden syyt suunnataan
  kappaleen oman koordinaatiston leveän pinnan pitkän sivun mukaan, myös kierretyissä
  osissa. Oman kierron voi säilyttää poistamalla suuntauksen. Laatat eivät muutu
  automaattisesti. Koko valinta muuttuu yhdellä peruttavalla toiminnolla; geometrinen
  komponentti- ja materiaalilinkit säilyvät; vain kuvion asettelu eriytetään.

## Backlog 7.10.2026 — PDF-palaute ja käyttäjän tarkennukset

**Tila: suunniteltu; yllä luetellut osat ovat työversiossa.** Lähde: käyttäjän
`Nivo _261007_115638.pdf` ja sitä täsmentävät vastaukset 7.10.2026.
Tämä täsmennys ohjaa jatkotyötä; ristiriitaisia vanhoja suunnitelmia ei toteuteta
sen yli. Epäselvästä toiminnasta kysytään ennen kyseisen muutoksen toteutusta.

### Mittatyökalun Luonnos ja pysyvät mittatasot

- Mittatyökalun **Luonnos**-valinta ja seinän/tasopinnan napsautus muodostavat
  kyseiseen tasoon oman 2D-kokonaisuuden. Sen mittaukset tallentuvat samaan
  kokonaisuuteen. Kyseessä on kevyt, uudelleen avattava mittataso; mallintaminen
  ei yleisesti edellytä erillisen rajoitepohjaisen sketch-tilan avaamista.
- Mittataso nimetään, näytetään/piilotetaan ja avataan uudelleen helposti.
  Työkalun vaihto tai luonnoksesta poistuminen säilyttää hyväksytyt mitat.
  Poistuminen, piilottaminen ja poistaminen ovat eri toimintoja.
- Toteutuksen suunnitteluperiaate: säilytä tason sijoitus ja mitat myös silloin,
  kun alkuperäinen seinäviite katoaa; ilmoita korjattava viite, älä hävitä
  kokonaisuutta tai kiinnitä sitä arvaamalla toiseen pintaan.
- Tuo näkyviin mittojen piilotus ja osan kokonaismittojen nopea lisäys.
  Dimensioihin helposti tartuttavat siirtokohdat sekä viereisten mittojen
  kohdistus samaan linjaan/tasoon. Merkinnän sijoittaminen ei muuta mitattua kokoa.

### Näyttötilat, kamera ja valinta

- Sovitut esitystilat: **1 Solid, 2 Tasaväri, 3 Ghost,
  4 Wireframe**. Valinta rajaa vaikutuksen valittuihin osiin; ilman valintaa
  vaikutus koskee koko näkymää. Esitystila ei muuta materiaalia tai geometriaa.
- **Vahvistettu:** Ghostin läpi voi valita takana olevan osan, mutta haamuun
  tarttuminen toimii. Tasaväri näyttää tasaisen osavärin ilman valaistuksen
  varjostusta tai tekstuuria. Varsinainen materiaali säilyy.
- **Ratkaistu pikanäppäinristiriita:** 1–4 vaihtaa esitystapaa vain vapaassa Valitse-tilassa, kun syöttökenttä
  tai keskeneräinen toiminto ei ole aktiivinen. Työkalujen mittasyöte säilyy.
  Samat tilat löytyvät näkyvästä valikosta myös kosketuskäytössä.
- Asetus tekee ohjelman Z=0-pohjatasosta läpinäkyvän ja poistaa sen tartunnan,
  kun kamera katsoo mallia tason alapuolelta. Tämä ei koske mallinnettua
  lattiaobjektia. Tarkista myös oletuspiirtotason poiminta, ei vain lattian piirto.
- Ylänäkymästä orbittamisen keinuminen: kameran up-suunnan ja OrbitControlsin
  välimuistissa olevan kiertosuunnan ero korjattu työversiossa. Varmista myös
  pohjakuvan ja vapaan leikkaustason kamerakehys samaa mekanismia käyttäen.
- Säilytä välitön osoitus → E/O. Valitulla facella on selkeä oranssi korostus,
  joka erottuu pelkästä osoituskorostuksesta. Ehdotus: erillinen pintavalinta
  mahdollistaa yhden tai usean alueen valinnan poistamista varten; tavallinen
  klikkaus säilyttää osan valinnan ja komponentin avaaminen oman merkityksensä.

### Muodot, tasoalueen poisto ja vapaat leikkaustasot

- Ympyrän ja yksinkertaisen sylinterin säde/halkaisija muokattavaksi myös
  luonnin jälkeen. Keskipiste säilytetään ja siihen voi tarttua. Ensimmäinen
  kokonaisuus ei yritä palauttaa mielivaltaisesti leikatun BRepin parametreja.
- **Poista pinta** (yhden alueen poisto toteutettu v0.34.1) tarkoittaa yksitasoisen muodon valittujen alueiden
  poistoa: esimerkiksi sisäympyrä pois kiekosta, jolloin jää rengaspinta.
  Sama koskee suorakulmioita ja muita suljettuja tasomuotoja sekä monivalintaa.
  Tämä ei ole läpireikäoperaatio eikä automaattinen umpinaisen osan kuoren avaus.
  Kaksi ympyrää tai offsetilla tehty sisäraja ja keskialueen poisto muodostavat
  ontoksi pursotettavan profiilin. Tarkista myös käyttäjän offset/pursotus-
  työnkulku, jossa jäljelle jää ylimääräinen erillinen tasopinta.
- Ennustava yhdensuuntaisuus myös vinoille kynäviivoille, saman luonnoksen
  osuuksille ja lähellä oleville reunoille. Säilytä tarkka tartunta ja Shift-viite.
- Helppo kaarityökalu. Suorakulmion kierto **piirron aikana** R:llä ja hiirellä.
  Mittaviivan nykyinen hyvin toimiva R-kierto säilyy; sitä ei korvata.
- Leikkaus-/projektiotaso asetetaan vapaasti, valitaan näkyvästi ja sitä
  liikutetaan/kierretään nykyisten M/R-työkalujen käyttötavalla. Suunnan vaihto
  säilyy. Tason muutos ei liikuta mallin osia. Nykyinen tasotietomalli tukee
  vapaata asentoa, mutta käyttöliittymän ohjaus on laajennettava.
- Pohjakuvan piilotus helposti löydettäväksi. Nykyisessä Pohjakuvat-paneelissa
  on jo silmäpainike; korjaus sisältää löydettävyyden ja toiminnan varmistamisen.

### Materiaalit ja asiakkaalle esitettävä renderi

- Maalipensselin aktiivinen väri/materiaali näkyy selvästi. **Tyhjä sivellin**
  tarkoittaa, ettei materiaalia ole valittu; se ei tarkoita materiaalin poistoa.
  Tyhjä sivellin ei muuta napsautetun osan pintaa.
- Tekstuurin siirto, kierto ja koon muokkaus saman pintatyönkulun yhteyteen
  mallinnuksen maalipensselissä: **toteutettu työversiossa**. Mallinnus ja renderi
  käyttävät yhteisiä tekstuurikahvoja; vedon hyväksyntä muodostaa yhden historiatoiminnon.
- Tavoite on **valokuvamaisempi** asiakasesitys sekä nopeassa esikatselussa
  että tarkentuvassa renderissä. Pehmeä valaistus ja varjot, materiaalien
  uskottavuus, värintoisto ja pinnan yksityiskohdat arvioidaan yhdessä.
  Terävyyttä ei korvata koko kuvan sumennuksella.
- Suunnittele yhtenäinen laatupassi: pehmeät valolähteet/ympäristövalaistus,
  valotus ja sävykartoitus, PBR-pintojen mittakaava, kohina ja mahdollinen
  kohinanpoisto. Arvioi parannukset samoilla kaluste- ja huonenäkymillä ennen
  ja jälkeen, myös GPU-muistin ja tabletin suorituskyvyn osalta.

### Saranat ja liikkeen havainnollistaminen

- Valitse oven vasen/oikea/ylä-/alareuna saranareunaksi, määritä avautuminen
  ja esikatsele/animoi liike asiakkaalle. Sovella samaa periaatetta myöhemmin
  laatikoiden ja kiskojen lineaariseen liikkeeseen.
- Suunnitteluperiaate: animaatio on tallennetun lepoasennon esitys; se ei
  muuta valmistusmittoja tai kerrytä jokaisesta kuvasta toimintohistoriaa.
- Kyseessä on liikkeen visualisointi. Rigid body -simulointi, törmäyslaskenta
  ja varsinainen kuormitus-/lujuuslaskenta ovat erillisiä mahdollisia jatkotöitä.

### Visuaaliset työkalujen ohjeet ja toistuva selkeytys

**V0.30.0:** haettava 33 havainneanimaation kirjasto ja työkalukohtainen
avauspainike toteutettu. Alla mainittu automaattinen ensikäyttökortti on jatkotyö.

**Palaute 10.10.2026:** nykyiset animaatiot eivät vielä havainnollista työtä
riittävän tarkasti. Kirjaston määrä ei tarkoita ohjeiden olevan valmiita.
Seuraavan tarkistuksen painopisteet ovat Push/Pull, Offset, mitta-/apuviivat,
pyöristys ja viiste, Cut/Join, kopiointi ja toisto sekä Push/Pullilla tehtävät
läpireiät. Käytännön työkalujen virheet korjataan ensin; ohjeen on näytettävä
todellinen tartuntakohta, käyttäjän toiminto, mitan syöttö ja valmis geometria.
Push/Pullilla tehtävää reikää ei korvata toisen leikkaustoiminnon esimerkillä.

- Ensimmäisellä työkalun käyttökerralla oikeaan reunaan avautuu selkeä pieni
  visuaalinen ohjekortti: aloitus, osoitus/veto, tarkka mitta, hyväksyntä ja
  peruminen. Käytä vain kyseiselle työkalulle olennaisia vaiheita ja esimerkkiä.
- Ohje ei peitä mallinnuskohdetta tai estä käyttöä. Kortin saa suljettua ja
  avattua uudelleen helposti työkalun yhteydestä sekä yhteisestä ohjevalikosta.
  Kosketuskäytössä näytetään myös vaihtoehdot näppäinoikoteille.
- **Jatkuva backlog-kohta: säännölliset optimointi- ja järkevöittämispassit.**
  Tarkastele työvaiheiden määrää, päällekkäisiä valintoja, termien johdonmukaisuutta,
  toimintojen löydettävyyttä, paneelien tilantarvetta ja palautteen selkeyttä.
  Ehdotettu rytmi on 2–3 toiminnallisen kokonaisuuden jälkeen ja ennen laajaa
  testijulkaisua; havaittu peruskäytön regressio korjataan heti.
- Mittaa samoilla vertailumalleilla esimerkiksi 296, 1 000 ja 5 000 osaa:
  orbit/zoom, osoitus/tartunta, monivalinta, siirron esikatselu, kopiointi,
  mallilista, muisti ja CAD-laskennan aikainen reagointi. Kirjaa lähtötilanne,
  todellinen pullonkaula ja tulos; tavoitelupauksia ei tehdä ilman mittausta.

### Ehdotettu toteutusjärjestys ja säilytettävät työnkulut

1. Kamera, näkyvyys, valinnan selkeys ja ensimmäiset työkalujen ohjekortit.
2. Pysyvät mittatasot ja mittojen sijoittelu; tasoalueiden poisto,
   ympyrän/sylinterin jälkimuokkaus, kaaret ja piirron kierto.
3. Vapaasti asetettavat leikkaustasot sekä yhtenäinen materiaalien käsittely
   ja renderin laatupassi. Saranavisualisointi omana rajattuna kokonaisuutena.
4. Selkeytys- ja suorituskykypassit yllä olevan jatkuvan käytännön mukaisesti.

Muodoilla leikkaaminen, push/pullin läpileikkaus sekä muutosmitan ja
toteutuvan kokonaismitan välillä vaihtaminen toimivat käyttäjän mukaan hyvin.
Näiden käyttötapa säilytetään ja regressiot tarkistetaan. Mittaviivan R-kierto,
tarkat viitteet, Hold, komponenttilinkitys, ryhmän ja kokoonpanon ero sekä
tallennus/Peru säilyvät uusien ominaisuuksien yhteydessä.

## V0.20 — viivat ja monimuotoinen mallintaminen

- Päällekkäiset vapaat mittaviivat yhdistyvät samalla 3D-suoralla. Duplikaatti
  ei lisää historiaa; risteävät, vierekkäiset ja vain päästään kohtaavat viivat
  pysyvät erillisinä. Jatko alkaa aina napsautetusta pisteestä.
- Valintaruutu poimii apu- ja mittaviivat. Oranssi korostus, Shift-lisäys,
  yhteispoisto osien kanssa sekä historiasta palautettava viivavalinta.
- Muodot-valikon tarkka CAD-pallo ja kuutiollinen Bézier-käyrä. Avoin käyrä
  voidaan liittää Jaa pinta -toiminnolla; suljettu käyrä muodostaa tasopinnan.
- Veitsi (N) paloittelee tilavuuskappaleet kameranäkymästä. Suora, taitettu,
  suljettu siluetti, analyyttinen Bézier-pinta ja vapaa viilto. Molemmat puolet
  säilyvät; lukitut ja piilotetut osat ohitetaan. Osista tulee uniikkeja,
  materiaalit ja ryhmät säilyvät, koko leikkaus kumoutuu yhdellä toiminnolla.
- Säilyvät mitta- ja apuviitteet seuraavat oikeita paloja. Alkuperäisen osan
  kokonaismitta kattaa palat yhdessä. Kameraa vaihdettaessa veitsiluonnos peruuntuu.
- Pehmennä reunat -pikatoiminto avaa koko osan säteellisen reunapyöristyksen.
- Laskennan aikana tallennustila ei enää näytä edellisen tilan Tallessa-tekstiä.
  Pitkä toimintovalikko pysyy ruudulla myös tabletilla.

[Toteutus, auditointi ja rajat](overnight-2026-10-05-modeling.md).

Seuraava luonteva käyräkokonaisuus: valmiiden Bézier-ohjauspisteiden muokkaus,
tangenttijatkuvuus ja profiilin pyyhkäisy reittiä pitkin (listat, putket ja kaiteet).
Sen jälkeen pyörähdys ja poikkileikkauksia yhdistävä loft. Orgaaninen subdivision
säilyy erillisenä myöhempänä verkkotyönkulkuna, ei piilotettuna CAD-muunnoksena.

## V0.19.2 — jatkuva mittaaminen ja erilliset viivanpäät

- Mittatyökalun pääpainike ja T muistavat viimeisimmän tilan. Nuolivalikko
  tarjoaa Apuviivan, Vapaan mittaviivan ja Dimension. Valikon sulkeminen
  säilyttää keskeneräisen mittauksen; tilan vaihtaminen aloittaa uuden.
- Vapaa mittaviiva jatkuu viimeisestä hyväksytystä pisteestä. Enter tai Esc
  päättää ketjun poistamatta tallennettuja viivoja. Pelkkä keskeneräinen jatke
  ei tallennu Enterillä ketjun päätteeksi, mutta kirjoitettu mitta tallentuu.
- Shift pitää aloitetun suunnan vain pohjassaolon ajan. Toisesta 3D-pisteestä
  poimitaan pituus lukittuun suuntaan; geometriamitta ei pyöristy ruudukkoon.
  X/Y/Z valitsee suoraan akselin. Kirjoitettu mitta on ensisijainen.
- R käynnistää hiirikierron 22,5° välein; Shift+R vapaan kierron. Pituus
  säilyy ja klikkaus tai Enter hyväksyy. Myös valmis viiva voidaan kiertää.
- Päätepisteen tuplaklikkaus ottaa sen siirtoon. Yhteisessä päätepisteessä
  valitaan muokattava viiva. Viivoja ei linkitetä: muiden päät jäävät paikoilleen.
  Oikean napin valikon **Poista mittaviiva** poistaa vain valitun viivan.
  Päätepisteen muutos ja viivan poisto ovat peruttavia, tallentuvia toimintoja.
- Reunalta aloittava mittaus ohittaa lähes sivuttain näkyvän naapuripinnan
  piirtotasoa valitessaan. Tarkkaan 3D-kohteeseen voi tarttua myös silloin,
  kun aiemman mittaviivan piirtotaso näkyy nykyisestä kamerasta sivuttain.

## V0.19.1 — selkeät pisteet ja tarkat tartunnat

- Mittaviivojen sekä keskeneräisten ja valmiiden kynäviivojen pisteet näkyvät
  reunustettuina merkkeinä, joiden koko säilyy zoomatessa. Kynän viiva on aiempaa paksumpi.
- Tartunta perustuu näytön pikseleihin: kulma/päätepiste 20 px, keskipiste 16 px
  ja viiva 12 px; kosketuksella 28/22/18 px. Lähennys erottaa lähekkäiset kohteet.
- Myös vapaan mittaviivan päät, keskipiste, viiva ja risteykset ovat tartuntakohteita.
  Apuviivat jatkuvat, mutta vapaan mittaviivan kuvitteelliseen jatkeeseen ei tartuta.
  Viivojen päät ja risteykset ovat ensisijaisia suhteessa mallin pisteisiin.
- Tarkasti osoitettu levyn reuna ei vaihdu ohuen levyn vastakkaisen reunan
  keskipisteeksi. Apuviivan etäisyyden voi kirjoittaa myös heti reunaan tartuttua.
- Reunatyökalun osoitettu reuna on oranssi 4,5 px:n viiva; valitut reunat näkyvät
  tummempana 3,5 px:n viivana. Korostus kattaa myös kaarevat CAD-reunat.
- Ruudukko porrastaa vapaan sijoittelun. Geometrian, apuviivan tai mittaviivan
  tarkkaa kohdetta ei pyöristetä. Numerosyöttö säilyy tarkkana; zoom ei muuta
  ruudukon askelta, jonka voi säätää asetuksista tai kytkeä pois.

## V0.19 — rakennuspinnat ja jatkuva pintojen käsittely

- 53 materiaalia: uutena sileä/karkea maalattu kipsi, tasoitettu seinä,
  raaka/liipattu betoni, kalkki- ja hiekkakivi, musta marmori, terrazzo,
  kiiltävä valkoinen / harmaa matta / terrakottalaatta ja öljytty pähkinä.
  Pinnoilla on fyysinen toistokoko, normal- ja karheuskartta. Laatan toisto
  sisältää noin 2 mm sauman; kyseessä on pintakuvio, ei erillinen laattageometria.
- Materiaalihaku ja aina näkyvät Valitse-, Tekstuuri- ja Maalaa-työkalut.
  Tekstuurin veto tallentaa yhden kumottavan muutoksen. Enter hyväksyy
  numeroarvot; työkalun tai kohteen vaihto säilyttää muutokset. Esc peruu
  keskeneräiset numeroarvot ja päättää työkalun, tallennetut vedot säilyvät.
  Osaa voi vaihtaa suoraan näkymästä työkalua sulkematta. Maalaa käyttää
  valittua sivellinmateriaalia vasta osaa klikattaessa; Hold estää maalauksen.
- Materiaalikirjasto jakaa saman kuvadatan Source-tunnisteen osien välillä.
  Tekstuurimuunnokset säilyvät esiintymäkohtaisina. Myös taustakuvan tilannekuva
  säilyttää jakamisen. Aktiivisten materiaalien johdetut kartat säilyvät välimuistissa.
- Tracerin kuvataulukko käyttää enintään 128 MiB, korkeintaan 1024 px per kerros,
  eikä ylitä näytönohjaimen kerrosrajaa. Suuri erilaisten kuvien määrä pienentää
  kuvataulukon resoluutiota; tämä ei muuta projektin alkuperäisiä kuvatiedostoja.
  Muistin tai kerrosrajan virhe palauttaa nopean esikatselun ja näyttää syyn.

Jatkossa: valokuvatut PBR-paketit, kuvioiden saumojen kohdistus eri osien välillä,
suoraan renderissä tuotavien kuvien sivellinpaletti ja materiaalien arviointi
fyysisellä iPadilla/Safarissa. Nykyiset uudet pinnat ovat proseduraalisia.

## V0.18 — pintarakenteet ja valot saman työnkulun osina

- Värikuvasta johdetut normal- ja karheuskartat ilman ylimääräisiä projektin
  kuvatiedostoja. Tuodut PBR-kanavat ovat ensisijaisia, ja kuvasta johdetun
  rakenteen arvioitu luonne kerrotaan käyttäjälle.
- Bumpin alkuperäinen kuvasuhde, fyysinen kohokuvion syvyys millimetreinä,
  tekstuurin skaalauksen aikainen reliefin säilyminen ja DirectX/OpenGL-valinta.
  Värikuvan tuonti käyttää natiivia kuvasuhdetta sekä mallissa että renderissä.
  Vanhan korkeuskartan voimakkuus säilyy, kunnes käyttäjä asettaa syvyyden.
- Hillityt melamiini-, kalustelevy-, puu-, kivi- ja metallirakenteet. Kuva- ja
  datakanavien väriavaruudet pysyvät erillisinä; omien karttojen pienet esikatselut.
- Sama valaisineditori mallissa ja renderissä: lämmin/neutraali LED, taustavalo,
  lämmin/neutraali spotti, väri, voimakkuus ja osan mukana kääntyvä suunta/keila.
- LED valaisee nopeassa esikatselussa kahden laajan pinnan approksimaatiolla.
  Esikatselussa kahdeksan voimakkainta LED-osaa, spotin varjot enintään kahdeksalle
  spotille. Tarkentuva kuva ja taustalaskenta käyttävät kaikkia todellisia
  emissiivisiä pintoja ilman esikatselun apuvalojen tuplalaskentaa.
- Kierretyn spotin lähtöpiste lasketaan osan paikalliselta pinnalta.
  Renderipaneelin kohde ja Materiaali/Kuva-vaihto pysyvät näkyvissä selattaessa.

Jatkossa: lisensoidut valokuvatut PBR-materiaalipaketit, saumattoman kuvan valmistelu,
kaarevien pintojen UV-saumat, emissiivisten pintojen tehokkaampi näytteistys ja kohinanpoisto, HDRI-ympäristöjen tuonti ja fotometriset
IES-valoprofiilit. Nopean LED-esikatselun peittymisvarjot vaativat erillisen toteutuksen.
Nykyinen bump/normal on valaistusdetalji; se ei ole geometrian displacement.

## V0.17.1 — kynän suora pinnanjako ja yhtenäinen Hold

Tavallisen kappaleen tai avatun osan reunasta reunaan kulkeva kynäviiva
jakaa pinnan heti pisteen vahvistuksessa. Keskeneräinen viivaketju ei lisää
kumoamishistoriaan tyhjiä tapahtumia. Suljettu komponentti ja kokoonpano
säilyttävät muokkaussuojan; valmis erillinen viiva tarjoaa Jaa pinta -toiminnon.
Perspektiivissä ensimmäisen viivan toinen piste täsmentää yhteisen piirtopinnan.

Shift lukitsee nykyisen tai ensimmäisen piirtosuunnan ja poimii viitteen pituuden
tälle suunnalle. Vapautus tai vahvistettu piste päättää tilapäisen lukon.
X/Y/Z:n tietoinen akselivalinta säilyy. Hold suojaa osan kaikkia tietoja paitsi
näkyvyyttä ja itse lukituksen vapautusta, myös välillisiä komponenttimuutoksia.
Osan alkuperäinen väri säilyy; lukitus näytetään kuvakkeella ja valinnan tekstillä.

## Yöpassi 5.10.2026 — mallista luotettavaksi työkuvaksi

Käyttäjä pyysi backlogista yhtenäistä yöpassia: nopeus, selkeys ja yksinkertaisuus.
Ryhmän organisatorinen ja kokoonpanon toiminnallinen merkitys säilytetään.
Auditin ehdotus tavallisen kopion oletuslinkityksen vaihtamisesta ei ohita
käyttäjän aiemmin sopimaa komponenttikopioiden linkitystä.

1. **Pintapiirroksen tarkoitus näkyviin — toteutettu.** Erillinen avoin kynäviiva
   tai tasomuoto voidaan liittää alla olevaan pintaan Jaa pinta -toiminnolla
   avaamatta osaa. Usean kohteen ja linkitettyjen osien vaikutus näytetään ennen
   hyväksyntää; paikallinen jako tekee kohteista uniikkeja. Suljetun muodon
   Leikkaa aukko säilyy käytettävissä hyväksymisen, uudelleenvalinnan ja
   tiedoston avaamisen jälkeen. Kynän suuntalukitus ja kosketuksen viitepoiminta
   käyttävät myös reunoja ja apuviivojen risteyksiä. Leikkaushistoria tallentaa
   muodon, kohteet ja säilytysvalinnan kevyinä tunnisteina. Palaa leikkaukseen
   palauttaa käytettävissä olevan kumoamistilan ja avaa toiminnon; Palauta valinta
   ei muuta geometriaa. Piirron syvyyskorjaus toimii myös perspektiivin
   logaritmisessa syvyyspuskurissa, ja valinta käyttää tarkkaa CAD-tasoa.
2. **Luotettavat kokonaismitat — toteutettu.** Oma semanttinen mitta osajoukolle
   tai ryhmälle. Ryhmä seuraa jäsenmuutoksia; osajoukko säilyttää kohteensa.
   Ääripisteen vaihtuminen, siirto, kierto ja Undo/Redo eivät muuta mitan
   merkitystä pisteiden väliseksi etäisyydeksi. Vanhoja pistemittoja ei arvata
   kokonaismitoiksi. Puuttuva kohde näytetään ja estää virheellisen työkuvan viennin.
3. **Luo mittakuvat yhdelle arkille — toteutettu.** 1–6 näkymää, enintään 50
   nimettyä arkkia projektissa. Selkeä oletusasettelu
   usealle suunnalle ja tallennetuille leikkauksille, yhteinen mittakaava,
   mahtumisen tarkistus sekä PDF/SVG. Sama tarkka malli ja semanttiset mitat
   palvelevat yksittäistä kuvaa ja kokonaisarkkia.
4. **Muokkauskontekstin viimeistely — toteutettu.** Uusi levyrunko syntyy
   kokoonpanoksi; ryhmä säilyy kansiona. Muokkaa osia, hierarkiapolku ja
   poistuminen näkyvät johdonmukaisesti. Linkitettyjen osien muokkauksen
   vaikutusalue kerrotaan muuttamatta olemassa olevia linkkejä tai kopioinnin oletusta.

Varmennus: CAD- ja mallikokeet, selain- ja kosketuskokeet, tiedoston avaus,
Peru/Palauta sekä todelliset mitta-arvot ja näkymän pikselit. Tulokset ja
rajaukset kirjataan [validointiin](validation.md).

Tämän passin jälkeen backlogiin jäävät: vapaa arkkitaitto, A3/monisivuiset
piirustuspaketit, automaattinen osakohtainen mittakuvasarja, semanttisten
ryhmämittojen vanhojen pisteviitteiden tietoinen uudelleenluonti, tallennetun
levyrungon parametrinen uudelleenmitoitus ja oma tuotekirjasto. Kokoonpano
itsessään ei lisää tolppajakojen tai levypaksuuksien rakennesääntöjä.
Kosketuksen vapaakierto ilman Shift-näppäintä on yhä oma pieni jatkokorjaus.

## V0.16 — tartunta, toisto, kynäviivat ja nopeat aukot

Toteutettu: pitkän reunan tartunta läheisessä perspektiivissä myös silloin,
kun reunan pää jatkuu kameran taakse. Apuviiva määrää uuden muodon aloitustason
myös ilman tukipintaa. Akselilla nostetun viivan suunta ja siirtymä määräävät
sen todellisen tason, joten ketjutus 800 mm + 1 000 mm toimii vanhoillekin viivoille.
Tason suuntainen katsesäde ei tuota äärettömän suuria mittalukemia.

Siirron numerosyöttö seuraa vedon akselia ja etumerkkiä. Toista + lisätoistojen
määrä toimii siirroille ja kopioille, myös ryhmille ja linkitetyille komponenteille.
Sarja on yksi Peru-askel; projekti- ja Hold-rajat tarkistetaan ennen hyväksyntää.

Vasemmalta oikealle vedetty sininen ruutu valitsee kokonaan sisällä olevat osat.
Oikealta vasemmalle vedetty oranssi katkoreunainen ruutu valitsee muotoon osuvat
osat. Shift lisää valintaan ja muokkaustilan rajaus säilyy. Osumavalinta
huomioi tarkan näyttöverkon, ontelot sekä poikkileikkaus- ja kamerarajat.

Kynän Enter päättää avoimen viivan. Osan muokkaustilassa reunasta reunaan
kulkeva viiva jakaa pinnan muuttamatta tilavuutta; muut viivat ovat erillisiä
CAD-piirrosviivoja, joihin voi tarttua ja joita voi siirtää tai kumittaa.
Suljetun muodon Leikkaa aukko laskee todelliset kohteet ja leikkaa valittujen
osien läpi molempiin suuntiin. Hold ja piilotus säilyvät, komponentit tehdään
paikallisesti uniikeiksi ja koko leikkaus palautuu yhdellä Peru-askeleella.

Poista ryhmä säilyttää osat ja alaryhmät ylemmällä tasolla. Ryhmän valinta
toimii myös sen ollessa tyhjä, ja Toiminnot-valikon Siirrä ryhmään tarjoaa
saman järjestelyn osalle, monivalinnalle ja ryhmälle. Kierto tarttuu 5° välein,
vahvemmin neljänneskierroksiin; Shift vapauttaa kierron ja numerosyöttö säilyy tarkkana.

Mahdollinen jatko toistolle: kiertosarjat ja erillinen jako kahden päätepisteen
välille. Push/pullin tai Cut-operaation yleinen toisto tarvitsee oman kohde-
ja pintaviitteiden logiikan; niitä ei toisteta tämän siirtotoiminnon kautta.

## V0.15 — yksi ymmärrettävä työskentelytapa

Toteutettu: työkalun yhteinen konteksti oikean paneelin yläosassa, yksi
mittalomake, lisäasetusten avaaminen tarvittaessa ja mittojen nostaminen
komponenttilinkityksen edelle. Esc peruu keskeneräisen eleen säilyttäen valinnan;
seuraava Esc päättää työkalun ja erillinen askel sulkee osan muokkauksen.
Hyväksyntä säilyttää työkalun. Mittaikkunan irrottaminen säilyy.

Hae-toiminto (Ctrl/⌘ K) etsii toteutettuja toimintoja nimillä ja avainsanoilla.
Toiminnot-valikon kanssa käytetään samoja valintatoimintoja; eston syy näkyy
haussa. Valitse toinen listaa osoitetun kohdan osat, esikorostaa myös peitossa
olevan osan ja huomioi kokoonpanot, piilotukset sekä muokkausrajauksen.
Kosketuksella esikorostus vahvistetaan erikseen. Mallilistan piilotettu pinta
ei enää peitä työkalupalkin napsautuksia.

V0.15:n jatkoksi suunniteltu **Luo mittakuvat** toteutettiin 5.10. yöpassissa:
useita näkymiä ja leikkauksia samalle arkille selkeällä oletusasettelulla.

## V0.14.1 — valinnan varmuus ja pinnalle piirtäminen

Toteutettu: koko siirrettävän osan/kokoonpanon korostus ennen tarttumista,
valmiin monivalinnan suojaaminen, Shift-valinta ja tyhjästä vedettävä
valintalaatikko odottavissa muokkaustyökaluissa. Kevyt toimintohistoria
sitoo valinnan tehtyyn muutokseen; vanhan valinnan voi palauttaa erikseen.
Lokissa säilyy enintään 100 merkintää ja 2 MiB tekstiä saman välilehden ajan.

Pinnalla oleva tasomuoto saa samassa tasossa olevan tukikappaleen edelle
piirto- ja valintaetusijan. Uusin päällekkäinen tasomuoto on päällimmäinen;
oikea etualan geometria peittää sen. CAD-sijaintiin ei lisätä näyttösiirtymää.
Yhteisen kulman siirtotartunta noudattaa samaa etusijaa.

## V0.14 — suuren työmaan sujuva mallinnus

Käyttäjän 296 osan kaappirivin kopiointi osoitti kaksi eri ongelmaa:
projektissa oli 1 000 osan tarkistusraja ja 1 184 osaan kasvattaminen näytti
harhaanjohtavan mittavirheen. Raja on korjattu 10 000 osaan ja virheet
erottelevat määrän, mitat ja viitteet. Tämä ei vielä takaa 10 000 osan suorituskykyä.

Yöpassi toteuttaa useiden huoneiden ja kalusteiden mallinnuksen perustan.
Alla alkuperäinen hyväksyntäsuunnitelma; toteutuksen mittaukset ja tarkat rajat
ovat [suorituskykyraportissa](performance.md) ja [validoinnissa](validation.md).

Toteutettu: resurssien säilytys, CAD-deltat ja toistuvien osien välimuisti,
instanssipiirto myös siirron aikana, avaruushaku, suuri virtuaalinen mallilista,
historian muistibudjetti, poikkileikkaukset ja mittakuvat, pohjakuvat sekä eristys.

Työjärjestys:

1. Mittaa 296, 1 184, 5 000 ja 10 000 osan mallit. Osoitus, orbit, valinta,
   siirto, ryhmän kopiointi, tallennus ja uudelleenavaus erikseen. Mittaa myös
   kolmiot, piirtojen määrä, pääsäikeen pitkät tehtävät ja muistin kehitys.
   Laatikkolevyjen rinnalle pyöristettyjä ja leikattuja kalusteosia.
2. Säilytä muuttumattomien osien GPU-resurssit. Valinta ja työkalun vaihto
   päivittävät vain korostukset. Siirron esikatselu muuttaa olemassa olevien
   näyttöobjektien muunnoksia; se ei rakenna koko valintaa joka osoitinliikkeellä.
3. CAD-workerin delta-päivitykset: vain muuttuneet osat ja verkot siirretään.
   Nimen, ryhmän ja näkyvyyden muutos ei tarvitse CAD-verkon palautusta.
4. Linkitetyn komponentin yhteinen näyttögeometria ja soveltuvin osin
   instanssipiirto. Jokainen esiintymä säilyy erillisenä valittavana CAD-osana;
   omat materiaalit, Hold ja muokkaustila säilyttävät nykyisen toimintansa.
5. Avaruusindeksi tartuntoihin ja sädepoimintaan, näkyvyysrajaus huoneittain
   ja kokoamattomien ryhmien listan virtualisointi. Muut huoneet eivät kuormita
   aktiivisen työalueen jokaista osoitinliikettä.
6. Tallennuksen ja historian muistikuorman mittaus ja vähennys. Nykyinen
   64 Mt:n tiedostotuonti, 8 MiB:n tallentuva historia ja 45 sekunnin
   CAD-aikaraja arvioidaan todellisten mallien perusteella. Rajan ylitys ei
   saa tuottaa väärää mittavirhettä tai hävittää nykyistä mallia.

Hyväksyntä: sama testi ennen ja jälkeen samalla laitteella, 296 → 592 → 1 184
kopiointi sekä suurempien mallien valinta/siirto/Peru/tallennus/uudelleenavaus.
Desktopin tavoite on 60 kuvaa/s tavallisessa mallinnuksessa ja vähintään
30 kuvaa/s sovitussa suuressa testimallissa laitteistokiihdytetyllä selaimella.
Tavoitteet saavutettiin synteettisten mallien M1 Pro -mittauksessa: 5 000 osan
siirto noin 60 kuvaa/s ja 10 000 osan siirto noin 32 kuvaa/s. Tämä ei ole
kaikille malleille pätevä kapasiteettilupaus. Fyysisen tabletin kuorma mitataan
erikseen. Mallinnuksen tarkkuutta tai erillisiä osia
ei uhrata nopeudelle. [Nykyiset mittaukset ja rajat](performance.md).

Samaan kokonaisuuteen toteutetut käytettävyyslisät: aiemmin pyydetty
kalibroitava pohja-/julkisivukuva (kaksi pistettä + tunnettu mitta, 1:1-skaala,
läpinäkyvyys ja lukitus) sekä **Eristä valinta**. Eristäminen näyttää valitun
huoneen tai kalusteen ja palauttaa lopuksi täsmälleen aiemmat piilotukset;
se on tilapäinen työskentelytila, joka ei muuta ryhmiä tai osien mittoja.

### Poikkileikkaus: toteutettu ensimmäinen kokonaisuus

Käyttäjä nosti leikkausnäkymät erityisen tärkeiksi rakennus-, remontointi- ja
kalustetyöhön. Toteutus kattaa sekä mallin tutkimisen 3D:ssä että
mitoitettavan leikkauspiirustuksen:

- Yksi selkeä **Leikkaus**-toiminto. Leikkaustason lähtövalinta X/Y/Z tai
  kappaleen tasopinta. Tason siirto kahvasta ja tarkalla millimetrisyötöllä;
  näkyvän puolen vaihto sekä leikkauksen päälle/pois-kytkin.
- Leikkaus on näkymäominaisuus. BRep, tilavuudet, osaluettelo, leikkauslista
  ja valmistusmitat säilyvät ennallaan. Leikkauskohtaan muodostetaan näkyvä
  täyttö/viivoitus todellisesta umpiaineesta: onteloa tai kaapin aukkoa ei täytetä.
- Näkyvyys ja poiminta noudattavat leikkausta. Pois leikatun puolen geometria
  ei saa varastaa tartuntaa tai valintaa. Leikkaustäyttö on esityspinta, jonka
  osoittaminen ei käynnistä push/pullia olemattomaan CAD-faceen.
- Nimeä ja tallenna leikkaus, esimerkiksi **A–A**. Projektiformaatti tallentaa
  tason sijainnin, normaalin, näkyvän puolen ja nimen. Vanhat projektit avautuvat
  ilman leikkauksia. Tason poistaminen poistaa vain näkymämäärityksen.
- **Mittakuva leikkauksesta** käyttää samaa tasoa ja todellisia CAD-leikkausreunoja.
  Viivapainot erottavat leikatun aineen taustalla näkyvistä reunoista.
  Mitoitus, mittakaava, PDF ja SVG toimivat samalla tavalla kuin muissa mittakuvissa.
  Mitta-ankkurin rikkoutuminen geometriamuutoksessa näytetään selvästi.

Hyväksymismallit: huone seinineen, lattioineen ja oviaukkoineen; kalusterunko
hyllyineen ja taustoineen; vino taso sekä pyöristetty osa. Leikkaustason
siirto, suunnan vaihto, aukot, sisäkkäiset ryhmät, piilotukset, tallennus ja
uudelleenavaus varmennetaan. Viedyn piirustuksen mitat ja mittakaava tarkistetaan
CAD-mittoja vasten. Leikkaustason veto mitataan myös 1 184 osan mallilla.
Tarkka CAD-leikkaus lasketaan workerissa; vanhentuneen laskennan tulos ei saa
palauttaa tasoa aiempaan paikkaan. Useat samanaikaiset tasot ja rajauslaatikko
ovat jatkoa yhden tason varmennetulle kokonaisuudelle.

### Seuraavaksi v0.14:n jälkeen

- Useita samanaikaisia leikkaustasoja ja rajauslaatikko.
- Leikkausmitan katkenneen viitteen uudelleenkohdistus ilman poistamista;
  leikkausmerkit tavalliselle pohjakuva-arkille ja monen leikkauskuvan arkkiasettelu.
- PDF-pohjakuvien tuonti, suuremman kuvakoon porrastettu näyttö ja valinnainen
  viivojen tunnistus. Kuvan rasteriviivoihin ei vielä synny geometriatartuntoja.
- Tarkka käyttäjämalli, fyysinen tabletti ja Safari/WebKit suorituskykyvertailuun.
- Muokattujen BRep-geometrioiden tiedostovarasto, osittainen projektin lataus ja
  peru-historian muutostallennus, jos nämä muodostuvat seuraavaksi pullonkaulaksi.
- CNC-ohjeistus pysyy backlogissa; PDF/SVG-leikkauskuva ei ole koneen työstörata.

## V0.13 — mallin hallinta ja ensimmäinen suorituskykypass

Toteutettu: vasen läpikuultava mallilista (aktiivisena kevyt maitolasipinta,
vetäytyneenä läpinäkyvä), nastakiinnitys ja kosketuspainikkeet; työkalupalkin
neljä reunasijaintia vetämällä tai valikosta; otsikon suora nimeäminen,
ryhmäpolku ja monivalinnan kokonaismitat. Delete/Backspace ja Valitse-tilan X
poistavat koko valinnan yhdellä historiavaiheella, Holdia kunnioittaen.

Kokoonpano valikoituu, siirtyy, kiertyy, kopioituu ja piiloutuu kokonaisena.
Tuplaklikkaus avaa tason kerrallaan yksittäiset osat; tavallinen ryhmä säilyy
listan järjestämisen välineenä. Kokoonpanon luonti säilyttää valittujen valmiiden
ryhmien hierarkian. Komponenttikopiot jakavat geometrian omissa jäykissä
koordinaatistoissaan. Tee uniikiksi, olemassa olevien osien linkitys ja
esiintymäkohtainen materiaali ovat mukana. Linkitetyn Hold-kopion geometriaa ei
muuteta hiljaisesti: koko toimi hylätään ja käyttäjä voi vapauttaa tai irrottaa linkin.

P-maalipensseli, valinnan yhteinen toimintovalikko ja kappaleen kautta näkyvä
siirtoakseli on toteutettu. Oikean napin veto säilyy orbitina.

Suorituskyky: yhdenväriset CAD-pinnat käyttävät yhtä pintapiirtoa per osa;
osoituskorostus on erillinen yhden pinnan verkko ja peräkkäiset piirtopyynnöt
kootaan yhteen animaatioruutuun. [296 osan vertailu ja mittausskripti](performance.md).
Geometriaresurssien säilytys, Worker-deltat, avaruusindeksi ja listan virtualisointi
on toteutettu v0.14:ssä. Käyttäjän varsinaisen 296 osan mallin profilointi
on edelleen hyödyllinen erillinen vertailu synteettisten mallien rinnalle.
Tavoiterajat asetetaan laitteistokiihdytetyllä selaimella mitatusta aineistosta.

Prioriteettia tarkennettu käyttäjän kanssa: helppokäyttöisyys, mittasyöttö ja
perustyökalut toteutetaan ennen layereita, ryhmiä ja komponentteja. Alkuperäinen
vaihenumerointi säilyy vertailua varten.

Versiossa 0.2 toteutettu: itsenäiset objektimeshit ja valinnainen yhdistäminen,
mittatyökalun apuviiva/vapaa mittaviiva, apuviivoihin tarttuva piirto ja siirto,
haettava Shift-viite (kosketuksella Poimi viite), 45° ennakointi, kelluva
numero-/Tab-syöttö, Enter/vapautus-hyväksyntä sekä sulkeutuva Kynä ja pursotus.

Versiossa 0.3 toteutettu: E-työkalun hover-pintavalinta ja suora veto kaikille
nykyisten mallien tasopinnoille, myös vinoille ja yhdistetyille osille.
Reunasta vedettävä rinnakkainen apuviiva, R/45° ja Shift+R/vapaa kierto,
X/Y/Z-lukot ja Esc-vapautus, siniset viivat ja globaali/viivakohtainen x-ray.
Kynän Shift-suuntalukko ja pituuden poiminta toisesta pisteestä, aloituspisteeseen
sulkeminen sekä pystysuuntaiset tasomuodot. Suurten pintojen syvyystarkkuutta
ja korostusten piirtotapaa korjattu. Projektiformaatti V3 säilyttää tarkan BRepin
pintamuutoksissa ja tuo V1/V2-projektit migraatiolla.

Versiossa 0.4 toteutettu: suorakulmio, ympyrä, ellipsi ja monikulmio sekä
kappaleen tasopintaan piirtäminen myös vinoilla pinnoilla. Jaetun alueen
push/pull, taskut, läpiaukot ja syvyyden poiminta pinnasta. Cut/Join käyttää
useita kohteita ja työstökappaleita; roolit voi vaihtaa ja työstökappaleet säilyttää.
Yhteisessä paneelissa nimi, mitat, paksuus ja käyttötarkoitus: kappale,
rakentamisen apumuoto, piirros tai nimetty itsenäinen osa. V4 tallentaa tarkat
käyräprofiilit ja BRep-tulokset sekä säilyneet verteksiviitteet.

Versiossa 0.4.1 toteutettu: push/pullin siirtymä ja lopullinen mitta,
kirjoitetun luvun merkityksen vaihto Tabilla sekä nykyisen ja jäljelle jäävän
materiaalin mitan näyttö. Vastapinta mitataan tarkasta geometriasta valitun
pinnan normaalin suunnassa. Etumerkitön mitta seuraa vetosuuntaa, etumerkki
määrää sen suoraan. Sama toiminto toimii vinoilla pinnoilla ja taskun pohjalla.

Versiossa 0.4.2 toteutettu: koko reunan korostus ja tartuntapiste kohdistimen
kohdalla, apuviivan veto reunan viereistä pintaa pitkin sekä erillinen
X/Y/Z-siirtolukko. Hyväksytyn toiminnon jälkeen työkalu pysyy aktiivisena;
Esc päättää työkalun ja tyhjentää valinnan. Mittaikkuna on oikeassa sivupaneelissa
ja sen voi siirtää otsikosta. Aiempi Escillä tehty pelkän akselilukon vapautus
korvautuu saman akselinäppäimen uudella painalluksella.

Versiossa 0.5 toteutettu: vapaan pinnan osoituskorostus, Offset-sisennys ja
sisäalueen E-syvennys/läpileikkaus, myös lopullinen mitta 0. R-kierto poimitun
pisteen tai reunan ympäri, kulmasyöttö ja 15°-porrastus, origoon siirto,
G-kiinnitys sekä nimettävät ja piilotettavat kappaleet ja yksitasoiset ryhmät.
V5 tallentaa ryhmät, lukituksen ja näkyvyyden. Kauas jatkuva ruudukko,
hillityt oletusakselit ja valinnaiset akselitekstit viimeistelevät työtilaa.

Versiossa 0.5.1 toteutettu: yksi kompakti yläpalkki, selaimen koko näytön tila,
Offsetin hiirisäätö ja tarkka CAD-esikatselu, koko objektin valinta yhdellä
klikkauksella sekä M + Ctrl -kopiointi tartuntapisteestä ja numeroilla.

Versiossa 0.6 toteutettu: push/pullin kahden klikkauksen pintakohdistus ja
Toteutuva kokonaismitta -sanasto, osien yhteiset X/Y/Z-ulkomitat 3D:ssä ja
mittakuvassa, mittojen riveihin sijoittelu sekä osavärit monivalinnalla.

Versiossa 0.6.1 toteutettu: vapaa E-veto ja Shiftillä haettava tavoitepinta,
perspektiivin vakaa hiiriohjaus, suorakulmion/ympyrän kahden napsautuksen piirto
sekä piirtotavan Automaattinen / Uusi osa / Pinnan alue. Kaapin aukon päälle
piirretty ovi syntyy automaattisesti itsenäiseksi osaksi.

V0.9.0 toteuttaa kahden vapaasti poimitun pisteen mitan, vinon reunan pituuden
ja mittalapun siirtämisen. Jatkokehitys: halkaisija/säde, kulma ja usean näkymän arkit.

Viisteiden, pyöristysten ja ryhmähierarkian ensimmäinen versio on toteutettu
v0.8.0:ssa, ja reunakäsittelyn hiiri-/kosketussäätö v0.8.3:ssa. Muokattavat reunaparametrit ja kahden pisteen mitoitus valmistuivat v0.9.0:ssa. Seuraavaksi jää referenssikuvan kalibrointi. Fyysinen tabletti
ja Safari varmennetaan erikseen. Linkitetyt komponentit valmistuivat versiossa 0.13.0.

## Toteutettu v0.7.0: osan muokkaustila ja geometrian korjaus

Käyttäjän LED-nauha- ja kaappiesimerkit osoittavat, että pinnan käyttäminen
piirtotasona ja sen muokkaaminen tarvitsevat näkyvän toimintarajan.
Muokkaustila, rajauksen poisto ja tallentuva palautushistoria on toteutettu.

- Normaalitilassa piirtäminen luo uuden osan, myös olemassa olevan osan pinnalle.
- Tuplaklikkaus tai Muokkaa osaa avaa yhden osan muokkaustilaan. Näkyvä
  muokkausraja, osan nimi ja Valmis-painike kertovat kohteen. Muut osat
  himmenevät ja tarjoavat tartuntoja; niiden geometria ei muutu.
- Muokkaustilassa piirrot jakavat vain avattua osaa. Uusi osa on edelleen
  eksplisiittisesti valittavissa esimerkiksi erilliselle LED-nauhalle.
- E/O-pikatoiminnot säilyvät suorina: osoitus ja E/O kohdistavat kyseisen
  toiminnon näkyvästi yhteen osaan. Tämä ei jätä seuraavaa piirtotyökalua
  muokkaamaan osaa; pysyvä piirtomuokkaus avataan tuplaklikkauksella.
- Valmis sulkee muokkaustilan. Esc peruu ensin keskeneräisen eleen; ilman
  keskeneräistä elettä Esc sulkee muokkaustilan.
- Nivon kaikki kappaleet ovat itsenäisiä objekteja, joten muokkaustila koskee
  kaikkia osia. Komponenttityyppi ja myöhemmät linkitetyt
  instanssit ovat erillisiä käsitteitä.
- Ensimmäinen kumitustoiminto: **Poista rajaus**. Valitaan saman tasopinnan
  sisäinen jakoviiva, näytetään yhdistyvä alue ja yhdistetään viereiset
  samantasoiset pinnat. Tilavuus, mitat, nimi ja väri säilyvät. Toiminta perustuu
  tallennettuun CAD-geometriaan ja toimii myös uudelleenavaamisen jälkeen.
- Rakenteellisten reunojen poistaminen, taskujen/aukkojen täyttö ja piirretyn
  luonnoksen poistaminen ovat eri toimintoja. Pelkkä viivan piilottaminen ei
  saa esittää geometrian korjaamista.
- Undo/redo säilyy selaimen päivityksen yli: enintään 20 lähintä askelta
  yhteensä, 8 MiB:n budjetti. Nykyinen malli ja historia tallentuvat samaan
  IndexedDB-transaktioon. Virheellinen tai vanhentunut historia ohitetaan;
  tallennustilan loppuessa yritetään nykyistä mallia ilman historiaa.
  Projektitiedoston formaatti säilyy V5:nä ja sisältää vain nykyisen mallin.

## Toteutettu v0.8.0: viisteet ja pyöristykset

- F: näkyvän suoran tai kaarevan CAD-reunan poiminta ja monivalinta yhdellä osalla.
- Pyöristys säteellä, tasamittainen viiste, kaikki reunat -valinta ja tarkka
  CAD-esikatselu. Numerosyöttö; Enter hyväksyy ja Esc peruu.
- Virheellinen mitta tai mahdoton geometria säilyttää alkuperäisen osan.
  Osan ja ryhmän Hold estää muokkauksen. Nimi, väri, ryhmä ja säilyvät viitteet
  pysyvät mukana; historia ja tarkka BRep tallentuvat.
- Hiirellä vetäminen valmistui v0.8.3:ssa. Parametrien jatkomuokkaus valmistui v0.9.0:ssa. Jatkokehitys: erimittaiset viisteet ja tangentiaalisten reunaketjujen valinta.
  Olennaisia seuraavia detaljeja ovat poraukset, upotukset ja toistokuviot.

## Toteutettu v0.8.0: renderöinnin ensimmäinen versio

- Erillinen esitysnäkymä, viisi materiaalia (matta, maalattu, puu, metalli, lasi),
  osavärit ja koko valinnan materiaalinvaihto.
- Kolme studioympäristön sävyä, valotus, varjot ja PNG-vienti nykyisestä kamerasta
  1 600 tai 2 400 pikselin leveydellä. Materiaalit ja valoasetukset tallentuvat.
- Omat tekstuurit ja syysuunnan/skaalan säätö valmistuivat v0.9.0:ssa. Jatkokehitys: tallennetut kamerat,
  omat valaistusympäristöt ja kohinanpoisto. Emissio, spotit ja progressiivinen path tracing valmistuivat v0.10:ssä.

| Vaihe | Tila                 | Sisältö                                                                                                                                  |
| ----- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Perusta varmennettu  | CAD-worker, pursotus/leikkaus/pyöristys, BRep-serialisointi, pintaviite, ortografinen HLR. Fyysinen tabletti vielä testaamatta.          |
| 1     | Työnkulku toteutettu | Suorakulmio → push/pull → valinta/siirto ja tartunnat → etukuva ja mitta → projektitiedosto/SVG, tallennus, historia, kosketus.          |
| 2     | Osin toteutettu      | Sisäkkäiset ryhmät, nimet, näkyvyys, Hold ja ryhmäkopiointi tehty. Kokoonpanot ja linkitetyt komponentit tehty v0.13; layerit myöhemmin. |
| 3     | Osin toteutettu      | Pintaan piirtäminen, leikkaukset, booleanit, viisteet, pyöristykset, offset, muut piirtotyökalut ja mesh-muokkaus.                       |
| 4     | Osin toteutettu      | 30 presettiä, tekstuurit, pintasijoittelu ja emissio tehty. UV-saarekkeet myöhemmin.                                                     |
| 5     | Osin toteutettu      | Studiovalaistus, esitysnäkymä ja PNG-vienti tehty. Tallennetut scenet ja kamerat myöhemmin.                                              |
| 6     | Osin toteutettu      | A4, CAD-poiminta, PDF/SVG toteutettu. Useat näkymät ja leikkaukset myöhemmin.                                                            |
| 7     | Suunniteltu          | Fyysisen tabletin työnkulut, suorituskyky, valinnan hienosäätö ja resurssibudjetit.                                                      |

Jokainen vaihe pysyy ajettavana. Uusi toteutus ei saa rikkoa aiempien projektien
tuontia, historiaa tai mitoitusta. Hyväksymisesimerkit A–C täydennetään työkalujen
valmistuessa. V0.9.0 lisää viimeistellyn kaapin ovineen, mittoineen ja tekstuureineen. Layerit, linkitetyt komponentit ja tallennetut kamerat jäävät A–C-esimerkkien jatkotyöksi.

## Backlog: mittakaavaan kalibroitava referenssikuva

Pohjakuva tuodaan XY-tasolle ylänäkymään. Julkisivu-/naamakuva tuodaan
pystytasolle etunäkymään; sama työnkulku soveltuu sivukuvaan.

1. Käyttäjä avaa kuvan ja valitsee tason.
2. Hän osoittaa kuvasta tunnetun mitan kaksi päätepistettä ja kirjoittaa
   todellisen mitan millimetreinä tai muussa tuetussa yksikössä.
3. Nivo skaalaa kuvan yhtenäisesti niin, että tunnettu väli on mallissa
   täsmälleen annettu mitta (1:1). Myös korkeus skaalautuu samalla kertoimella.
4. Kuvan sijainti ja kierto voidaan kohdistaa origoon tai mallin pisteisiin.
   Kuvan päälle voi heti piirtää ja rakentaa oikean kokoisia osia.
5. Referenssikuva voidaan lukita, piilottaa ja näyttää läpikuultavana.
   Kuva ja kalibrointi säilyvät tallennuksessa, avauksessa ja undo/redo-toiminnoissa.

Hyväksyntäesimerkki: pohjakuvan kahden pisteen väliksi annetaan 4 200 mm.
Samoihin päätepisteisiin piirretyn malliviivan tulee olla 4 200 mm pitkä.
Sama tarkistus tehdään julkisivukuvan pystymitalle. Epäkelpo tai nollapituinen
kalibrointi ei muuta nykyistä kuvaa tai mallia.

## Yöpassi 2.10.2026

Toteutettu kokonaisuus: sisäkkäiset ryhmät, periytyvä näkyvyys ja Hold,
ryhmän ja monivalinnan yhteinen siirto/kopiointi, viisteet ja pyöristykset sekä
renderöinnin ensimmäinen versio. Ryhmän sisällön rajaus tehdään valintaa
muuttamalla ennen siirtoa; näkymään sovitus on erillinen toiminto. Linkitetyt
komponentti-instanssit pysyvät myöhempänä ominaisuutena.

Muokkaustilan ja apuviivojen viimeistelyssä lisättiin näkyvä tilapalkki,
tyhjän tilan turvallinen tuplaklikkauspoistuminen, apuviivan lähtöetäisyys,
3D-risteystartunnat sekä viivan valinta, toimintovalikko ja kumitus. Koko
mallin oikean painikkeen kontekstivalikko on jatkokehitystä; kameran oikealla
painikkeella tehtävä kierto säilyy nykyisellään.

## Toteutettu v0.8.1: loppupään mittatartunta ja rakennusviivamuodot

Reunasta aloitetun apuviivan loppupää tunnistaa reunan, nurkan ja keskipisteen;
korostus jää osoitettuun kohteeseen. Tarkka geometrinen tartunta ohittaa
ruudukon pyöristyksen. Vapaa mittaviiva voi tallentaa loppupään reuna-ankkurin.

Muototyökalujen toimintovalikon Mittaus/rakennusviiva tuottaa tasomaisen
katkoviivaääriviivan erilliseksi apumuodoksi. Pohjana oleva kappale pysyy
muuttumattomana myös muokkaustilassa. Suorakulmio, ympyrä, ellipsi, säännöllinen
monikulmio ja suljettu kynämuoto käyttävät samaa toimintoa. Kappale-valinta
palauttaa normaalin piirtotavan. Apumuodot tallentuvat ja ovat peruttavissa,
mutta ne eivät tule mittakuvaan tai renderöintiin.

## Toteutettu v0.8.2: kappalelistan raahaus ja sivupaneeli

- Osat ja monivalinnat voi vetää ryhmään ja Päätasolle. Ryhmän veto siirtää
  koko alaryhmän; syklit on estetty. 3D-sijainti säilyy, Peru toimii yhdellä askeleella.
- Korostettu kohde, vetolappu, reunavieritys ja kosketuksen pistekahvat.
- Ryhmän nimi valitsee ryhmän; kaksoisnapsautus/F2 nimeää sekä osat että ryhmät.
  Näkyvyys ja Hold pysyvät riveillä, purkaminen siirtyi ryhmän asetuksiin.
- Lista pysyy paneelin yläosassa, valinnan tiedot ja työkalut sen alla.
  Väri, sijainti, nimeäminen/ryhmä ja mallinnuksen lisätoiminnot avataan tarvittaessa.

## Toteutettu v0.8.3: viisteiden ja pyöristysten suora säätö

Valittu seuraavaksi kokonaisuudeksi, koska se viimeistelee korkean prioriteetin
perustyökalua ja noudattaa E/O-työkalujen tuttua veto- ja numerosyöttöä.

- F → veto reunasta säätää sädettä tai viisteen kokoa. Vapautus hyväksyy,
  Enter toimii myös numerosyötön jälkeen ja Esc peruu.
- Napsautus säilyy monivalintana. Jo valitusta reunasta veto säätää koko
  reunavalintaa; kirjoitettu mitta lukitsee koon vedon loppuun asti.
- Vakaa aloitussuunta ja kameran mittakaava, palautetta reunan vieressä,
  CAD-esikatselussa ja samassa sivupaneelissa. Ei uutta työkalua tai valikkoa.
- Viimeisin koko lasketaan hyväksyttäessä tarkasti. Virheellinen mitta säilyttää
  alkuperäisen geometrian; Hold ja osan muokkauskonteksti pysyvät voimassa.
- Kosketuksen toinen sormi keskeyttää vedon. Historia ja tiedostomuoto säilyvät.
- Jälkikäteen muokattavat reunaparametrit, erimittaiset viisteet ja
  tangenttiketjujen valinta jäävät jatkokehitykseen.

## Toteutettu v0.8.4: kohdistinzoomaus ja valinnan kamerakeskus

- Rulla zoomaa kohdistimeen perspektiivissä ja rinnakkaisprojektiossa;
  kahden sormen zoomaus käyttää sormien keskipistettä.
- Valinnan yhteinen keskipiste ohjaa kameran kiertoa ja zoomin työskentelysyvyyttä.
  Muokattava osa on ensisijainen myös silloin, kun valinta tyhjenee.
- Valinta ei siirrä kameraa eikä käännä katselusuuntaa. Erillinen Sovita näkymään
  säilyy tapana keskittää ja sovittaa valinta. Panorointi toimii edelleen.

## Toteutettu v0.8.5: orbit kohdistimen alla olevan pinnan ympäri

- Kiertoliikkeen alussa poimitaan kohdistimen alla oleva näkyvä pinta ja piste
  lukitaan vedon ajaksi. Pieni rengas näyttää kiertokeskuksen.
- Pinta on ensisijainen myös muokkaustilassa, Hold-osalla ja geometrian
  esikatselussa. Piilotetut osat, apuviivat ja kiertokahvat ohitetaan.
- Tyhjästä tilasta aloitettu kierto käyttää muokattavan osan tai valinnan
  keskipistettä; ilman valintaa nykyistä näkymäkeskusta.
- Navigoi-tilan yhden sormen kierto käyttää samaa poimintaa. Toinen sormi
  vaihtaa tavalliseen panorointiin/zoomaukseen. Kohdistinzoomaus säilyy.
- Valitse-tilan Shift-monivalinta huomioi myös painalluksen alun, joten Shiftin
  vapautus ennen hiirtä ei korvaa valintaa. M siirtää vapaasti valitut osat
  yhdessä ilman ryhmää. Shiftin viitepoiminta kuuluu muihin työkaluihin.

## Toteutettu v0.9.0: jatkuvat kulmaliitokset

Kaapin etureunan pyöristys voi estää viereisen lyhyen reunan käsittelyn
seuraavassa operaatiossa. CAD-ydin osaa käsitellä useita reunoja yhdessä.
Ennen v0.9.0:aa Nivo säilytti hyväksynnän jälkeen vain tulosgeometrian;
nyt uusien käsittelyjen lähde ja parametrit säilyvät jatkomuokkausta varten.
Erillinen kulmatyypin valinta jää alla kuvattuun jatkokehitykseen.

- Säilytä lähde ja reunakäsittelyn parametrit, jotta kohtaavia reunoja voidaan
  lisätä samaan pyöristyskokonaisuuteen ja laskea kulmaliitos uudelleen.
- Tavoite: kolmen reunan Rolling Ball -liitos toimii myös jatkettaessa aiempaa
  käsittelyä. Neljän reunan tapaukset ja eri säteet varmennetaan geometrian mukaan.
- Setback on vaihtoehtoinen pehmeä siirtymä; sen toteutuskelpoisuus nykyisellä
  ytimellä tutkitaan erikseen. Tangenttiketjun valinta on erillinen toiminto.
- Viisteiden kohtaaminen käsitellään omana tapauksena. Mahdoton säde tai
  leikkaava siirtymä ei saa rikkoa alkuperäistä osaa tai muuttaa mittaa hiljaisesti.
- Hyväksyntä: etureuna ensin, sitten siihen liittyvät lyhyet sivureunat;
  tarkka esikatselu, muuttaminen, Peru/Palauta sekä tallennus ja uudelleenavaus.

## Toteutettu v0.9.0: viimeistelty, mitoitettu ja materiaalitettu malli

**Tila: toteutettu 3.10.2026.**

- F säilyttää lähdegeometrian, reunat ja koon. Kolmen kohtaavan reunan jatkaminen
  testattu 18 mm levyllä, pitkällä sivulla ja ontolla kaapilla. Neljän reunan
  pyramidikärki toimii testissä; Setback ja kaikkien topologioiden kattaminen
  eivät kuulu todettuun tukeen.
- T → Dimensio: kaksi poimittua pistettä, sivusijoitus, vedettävä teksti,
  akselimitta, pysyvät viitteet, mittakuva ja SVG.
- 27 paikallista presettiä, omat kuvat, projektin materiaalikirjasto sekä
  tekstuurin siirto-, koko- ja kiertokahvat. PNG ja renderin kohdistinnavigointi.
- Siirron yhtenäinen ruutukoordinaateissa tehtävä poiminta, liikkuvien osien
  omien pisteiden poissulku ja tarkka geometriatartunta ennen ruudukkoa.
  Ruudukkoaskel on nyt säädettävissä asetuksista.
- V6-projekti ja V2-historia: kuvat ovat kerran aineistotaulussa, vanhat
  projektit ja historia migroidaan. Uusi viimeistelty kaappiesimerkki on
  avattavissa aloitusnäkymästä ja tiedostona `public/examples/viimeistelty-kaappi.nivo`.

Alla säilyy toteutuksen hyväksytty suunnitelma ja sen ratkaisut. Varsinaiseen tavoitteeseen
kuuluvat kaikki kolme kokonaisuutta: muokattavat reunakäsittelyt, vapaasti
poimittu kahden pisteen mitoitus ja laajennettu materiaalien/tekstuurien työnkulku.
Niitä toteutetaan yhtenä kokonaisuutena, jonka lopputulos on mitoitettu kaappi,
muokattava pintakuviointi ja vietävä esityskuva. Aiempi pelkkiin reunoihin
rajattu yöpassi on tämän suunnitelman ensimmäinen osuus.

### Kahden pisteen dimensio

- Mittatyökalun selkeä **Dimensio**-tila: poimi ensimmäinen ja toinen piste,
  siirrä osoitin sivulle ja vahvista mittaviivan paikka klikkauksella.
  Myös toisesta pisteestä alkava veto ja vapautus toimii. Esikatselu näyttää
  mitta-apuviivat, mittaviivan ja arvon heti. Työkalu pysyy käytössä.
- Tartunnat verteksiin, reunan pisteeseen/keskipisteeseen, ympyrän keskukseen
  ja apuviivojen risteyksiin. Pisteet voivat olla eri kappaleissa, jotta
  esimerkiksi oven välys tai kahden kaapin väli voidaan mitoittaa.
- Oletus on pisteiden välinen todellinen etäisyys. X/Y/Z valitsee erikseen
  akselin suuntaisen mitan; valittu mittatapa näkyy esikatselussa.
- Valmiin mittaviivan sijoitusta voi muuttaa vetämällä. Mittateksti pysyy
  luettavana zoomatessa. Mitta näkyy 3D:ssä, sopivassa mittakuvan näkymässä
  ja SVG-viennissä. Vinon 3D-mitan projektiota ei esitetä huomaamatta
  todellisena tasomittana: näkymään sopimaton mitta jätetään siitä näkymästä pois.
- Päätepisteet sidotaan osaan ja säilyvään geometriaviitteeseen silloin,
  kun sellainen on saatavissa. Siirto päivittää mitan. Jos muutos poistaa
  viitteen, mitta merkitään korjattavaksi eikä arvata lähintä uutta reunaa.
- Tämä on geometriaa kuvaava mittamerkintä. Mittaviivan siirtäminen muuttaa
  sijoittelua, ei kappaleen kokoa. Nykyiset X/Y/Z-kokonaismitat säilyvät.

### Tekstuurin lisääminen ja suora muokkaus

1. Valitse osa tai useita osia ja materiaali; oman tekstuurin saa **Lisää kuva**
   -toiminnolla PNG-, JPEG- tai WebP-tiedostosta.
2. Valitse **Muokkaa tekstuuria**. Pintaa pitkin vetäminen siirtää kuviota,
   kokokahva skaalaa sitä ja kiertokahva muuttaa suuntaa. Suhdelukko on oletuksena
   päällä. Sivupaneelista voi syöttää myös leveyden/korkeuden millimetreinä,
   siirtymän ja kulman sekä palauttaa oletussijoittelun.
3. Muutos näkyy jatkuvasti renderissä. Hyväksyntä tallentaa yhden muutosaskeleen;
   Esc palauttaa edeltäneen sijoittelun. Tekstuurin siirto ei liikuta kappaletta.
4. Puun syysuunta, kuvion koko ja kohdistus säilyvät osaa siirrettäessä,
   kierrettäessä, kopioitaessa ja projektia uudelleen avattaessa.

Materiaalit pysyvät yhdessä sivupaneelissa: materiaalikategoria, visuaaliset
esikatselut ja valitun materiaalin tavalliset säädöt. Tekstuurin kahvat näkyvät
vain sen muokkaustilassa. Oikea painike jatkaa kameran kiertoa ja rulla zoomausta;
vasen veto muokkaa tekstuuria. Renderin kamera saa saman kohdistinzoomauksen ja
pinnasta poimitun orbitin kuin mallinnusnäkymä.

### Materiaalikirjaston tavoite: 27 nimettyä presettiä

| Ryhmä             | Presetit                                                       |
| ----------------- | -------------------------------------------------------------- |
| Massiivipuut (6)  | Luonnontammi, vaalea tammi, savutammi, pähkinä, koivu, mänty   |
| Metallit (4)      | Harjattu alumiini, harjattu ruostumaton teräs, kromi, messinki |
| Lasit (3)         | Kirkas, savulasi, huurre                                       |
| Muovit (4)        | Matta ABS, kiiltävä ABS, kirkas akryyli, huurteinen akryyli    |
| Kivet (4)         | Graniitti, marmori, liuskekivi, travertiini                    |
| Posliini (3)      | Kiiltävä valkoinen, matta valkoinen, tumma lasitettu           |
| Kalustepinnat (3) | Valkoinen melamiini, harmaa laminaatti, maalattu kalustepinta  |

Presetit määrittävät myös pintakuvion, karheuden, metallisuuden ja tarvittaessa
läpäisevyyden/pinnoitteen. Puulajit ja kivet tarvitsevat erottuvat kuviot;
pelkkä saman materiaalin nimeäminen ja värjääminen ei täytä tavoitetta.
Sävyä ja tavallisia pintaominaisuuksia voi muuttaa, ja valmis oma materiaali
voidaan tallentaa projektin materiaalikirjastoon. Nykyiset viisi materiaalia
avataan yhteensopivasti. Mukana toimitettavat presetit toimivat paikallisesti.

### Toteutusjärjestys

1. **Yhteinen tallennuspohja ja CAD-varmennus.** Määrittele reunakäsittelyjen
   lähteet, dimensioiden ankkurit, materiaalit ja tekstuuriaineistojen viitteet.
   Varmenna kohtaavien reunojen laskentatapa alla olevan reunasuunnitelman mukaan.
2. **Reunatyönkulku valmiiksi.** Lähteestä uudelleen laskeminen, reunojen
   lisääminen/poistaminen, mitan muuttaminen ja F-paneelin jatkomuokkaus.
3. **Dimensio alusta vientiin.** Poiminta, sijoitus, myöhempi siirto,
   geometrian mukana päivittyminen, mittakuva ja SVG.
4. **Materiaalit ja reaaliaikainen tekstuurityökalu.** Presetkirjasto,
   kuvan tuonti, objektin mukana pysyvä kuviointi, suorat kahvat ja tarkat mitat.
5. **Yhteinen viimeistely.** Tallennus, Peru/Palauta, kopiot, vanhat tiedostot,
   renderin kameran yhdenmukaisuus ja PNG-vienti. Yksi avattava kaappiesimerkki
   käy kaikki uudet työvaiheet läpi.

### Tekninen pohja ja hyväksyntä

- Nykyinen dimensio tuntee vain osan min/max-ulkomitan. Laajenna se myös
  kahden ankkurin, mittatavan ja sijoitustason sisältäväksi merkinnäksi.
  Käytä yhtä mittalaskentaa 3D:ssä ja SVG:ssä; paperitekstin koko säilyy
  tulostuksessa ja 3D-tekstin koko ruudulla luettavana.
- Nykyinen puukuviointi käyttää maailman koordinaatteja ja kiinteää skaalaa.
  Uusi sijoittelu sidotaan objektin omaan koordinaatistoon. Tasomaiset ja
  laatikkomaiset kalusteosat saavat hallittavan projektion, ja pyöristysten
  saumakohdat tarkistetaan oikeassa materiaaliesimerkissä.
- Muuta tekstuurin muunnosta ja materiaalin asetuksia esikatselussa ilman
  CAD-laskentaa tai kaikkien meshien uudelleenluontia jokaisella hiiritapahtumalla.
  Kuvan sisältö voidaan jakaa, mutta yhden osan tekstuurimuunnos ei saa muuttaa
  muiden osien sijoittelua.
- Kuvia ei monisteta jokaisen osan tai Peru-askeleen sisään. Aineistot saavat
  omat tunnisteet, niille käytetään kohtuullista esikatselutarkkuutta ja ne
  sisällytetään projektin vientiin. Nykyinen 10 Mt JSON-tuontiraja ja 8 MiB
  historiabudjetti huomioidaan uuden tallennusmuodon suunnittelussa.
- Valmistumiskoe: viimeistele oven kohtaavat reunat, mitoita kaksi pistettä
  ja oven välys, valitse tammimateriaali, kohdista syyt ja kuvion koko vetämällä,
  tuo oma kuva toiselle osalle, kopioi osat ja tallenna. Uudelleenavaus säilyttää
  muokattavat käsittelyt, mitat ja kuvioinnin; SVG ja PNG vastaavat näkymää.
- CAD- ja selaintestit kattavat uuden kokonaisuuden sekä aiemmat E/O/M-,
  ryhmä-, Hold-, valinta- ja kameratyönkulut. Presetit tarkistetaan visuaalisesti
  sekä erillisillä näytekappaleilla että kaapissa.

Valmistumista arvioidaan näiden toimivien työnkulkujen perusteella.
Dimension ja materiaaliputken toteutus kuuluu yöpassin tavoitteeseen myös,
jos jokin erikoisempi kulmaliitos vaatii erillistä jatkotutkimusta.

## Yöpassin reunakäsittelyosuus: kaapin reunat valmiiksi ja myöhemmin muokattaviksi

**Tila: toteutettu v0.9.0:ssa; seuraava kuvaa hyväksyttyä työnkulkua.** Tavoite on, että käyttäjä voi viimeistellä
kaapin tai oven kohtaavat reunat, jatkaa käsittelyä myöhemmin ja muuttaa sen
mittaa samassa F-työkalussa. Tämä yhdistää korkeimman prioriteetin
kulmaongelman ja jo suunnitellut muokattavat reunaparametrit yhdeksi työnkuluksi.

### Käyttäjälle valmistuva työnkulku

1. Pyöristä etureuna esimerkiksi 3 mm säteellä ja hyväksy.
2. Palaa F-työkaluun ja lisää samaan käsittelyyn kohtaavat lyhyet sivureunat.
   Kulman pinnat lasketaan yhdessä alkuperäisestä geometriasta.
3. Muuta säde 2 mm:iin vetämällä tai numerolla. Poista tarvittaessa yksi reuna
   käsittelystä tai poista koko käsittely ja palauta terävä reuna.
4. Tallenna, avaa uudelleen ja jatka samaa muokkausta. Peru/Palauta toimii
   yhdellä askeleella per hyväksytty muutos.

### Toteutusjärjestys ja valmistumisehdot

| Vaihe                         | Toteutus                                                                                                                                                                                              | Valmistumisehto                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Todennettava geometria     | Toista ongelma 600 × 600 × 18 mm levyllä, pitkällä kaappisivulla ja ontolla rungolla. Vertaa peräkkäisiä ja yhdessä laskettavia 2–3 kohtaavan reunan pyöristyksiä sekä viisteitä.                     | Tarkat CAD-testit osoittavat toimivan laskentatavan ja hylkäävät mahdottomat säteet ehjää osaa muuttamatta. Neljän reunan tapaus tutkitaan erikseen.            |
| 2. Muokattava käsittely       | Tallenna lähdegeometria, käsittelyn tunniste, reunaviitteet, tyyppi ja mitta. Laske muutos lähteestä ja säilytä nykyinen tarkka tulos.                                                                | Säteen muutos, reunan lisääminen/poistaminen ja käsittelyn poisto tuottavat ehjän kappaleen; alkuperäiset valinnat löytyvät luotettavasti.                      |
| 3. Yksi käyttöliittymä        | Näytä käsittely nykyisessä F-paneelissa. Avaa olemassa oleva käsittely myös sen pyöristetystä pinnasta. Tarjoa selkeä Jatka käsittelyä / Uusi käsittely -valinta vain, kun molemmat ovat mahdollisia. | Käyttäjä pystyy suorittamaan yllä olevan työnkulun ilman erillistä historiapaneelia. Hiiri, numero, Enter, Esc ja esikatselu toimivat samalla tavalla kuin nyt. |
| 4. Tallennus ja muut työkalut | Päivitä projektiskeema, worker-viestit, kopiointi, siirto/kierto ja historian tallennus. Määrittele, miten myöhempi E/O/Cut/Join vaikuttaa käsittelyyn.                                               | Uudelleenavaus ja kopion muokkaus säilyttävät oikean lähteen. Muu muokkaus ei hiljaisesti katoa, kun pyöristyksen mittaa muutetaan.                             |
| 5. Kokonainen kaappikoe       | Käy läpi oven ja rungon viimeistely, orbit-lähitarkastelu, mitoitus, ryhmäkopio, Hold, tallennus ja palautus.                                                                                         | Automaattiset CAD- ja selaintestit, tarkistetut kuvat sekä avattava esimerkkiprojekti osoittavat valmiin työnkulun.                                             |

### Keskeiset toteutuspäätökset

- Reunan tunniste sidotaan tallennettuun lähteeseen. Nykyisen tulosmeshin
  vaihtuva reunaindeksi ei kelpaa pysyväksi viitteeksi. Epäselvää vastaavuutta
  ei arvata: käyttäjä saa valita reunan uudelleen.
- Ensimmäinen versio tukee yhtä mittaa per käsittely ja useita siihen kuuluvia
  reunoja. Eri säteet samassa kulmassa ja tangenttiketjun laajennus tulevat
  vasta perustyönkulun valmistuttua.
- Kappaleen siirto, kierto ja kopio huomioivat myös käsittelyn lähteen.
  Geometriaa muuttava myöhempi E/O/Cut/Join tarvitsee määritellyn toimintatavan:
  joko riippuvuudet lasketaan oikein uudelleen tai käsittely viimeistellään
  näkyvästi ennen jatkomuokkausta. Vanhaa lähdettä ei käytetä muun muokkauksen yli.
- Vanhat `.nivo`-projektit avautuvat sellaisinaan. Jo valmiiksi pyöristetyn
  BRepin puuttuvia lähdeparametreja ei päätellä varmoina; uusien käsittelyjen
  muokattavuus ja vanhan geometrian mahdollinen korjaus erotetaan selvästi.
- Setback ja neljän reunan kaikki yhdistelmät ovat geometriaytimen erillisiä
  varmennuksia. Niille ei lisätä käyttöliittymävalintaa ennen toimivaa toteutusta.

**Reunakäsittelyosuus on valmis**, kun kohtaavien reunojen jatkaminen, mitan muuttaminen,
käsittelyn poistaminen ja uudelleenavaus toimivat samalla esimerkkiosalla
ilman geometriavirheitä tai aikaisempien muutosten katoamista. Jos ensimmäinen
CAD-varmennus paljastaa ytimen rajoitteen, ongelma rajataan testillä ja
toimiva soveltuvuusalue kirjataan ennen käyttöliittymän lupausten laajentamista.

## V0.10: nopeus, selkeys ja ensimmäinen jaettava beta

- Työkalupalkin työpöytäversio on tiivis; kosketukselle suuremmat osumat.
  Muodot ovat yhdessä valitsimessa, Push/pull heti Valitse-työkalun jälkeen.
  Muototyökalun aktivointi odottaa käyttäjän alkupistettä ilman oletusesikatselua.
- Valitse-tilan laatikkovalinta ottaa kokonaan ruudulla rajauksen sisään jäävät
  osat, myös toisten osien takana. Shift lisää joukkoon. Klikkaus ja Shift-klikkaus
  säilyvät. Muokkaustilan rajausta ja piilotuksia noudatetaan.
- Mittakuvalla on oma työtila: kohde (valinta, osa, ryhmä, näkyvä malli), näkymä,
  kahden pisteen mitat suoraan CAD-pisteistä/reunoista, kokonaismitat ja vienti.
  Arkin automaattinen sovitus, A4-vektori-PDF ja SVG. Mallinnustyökalut eivät
  näy mittakuvan työtilassa. Mittamerkintä ei muuta mallin geometriaa.
- Esityskuvan asetukset: Materiaali / Valo / Kuva. Kolme LED-materiaalia nostaa
  presetit 30:een. Osakohtainen emissio, spotin suunta, keilakulma, väri ja voimakkuus.
- Valinnainen progressiivinen path tracing, näytemäärä, tauko/jatkaminen ja nykyisen
  kuvan PNG. Kameran tai materiaalin muutos aloittaa kertymän uudelleen.
  Esikatselu laskee renderöintinäkymässä. Erillinen kuvatyö jatkuu mallinnustilassa;
  selaimen sulkemisen yli säilyvää työjonoa ei ole,
  Blender Cyclesin koko ominaisuusvalikoimaa eikä kohinanpoistoa. Rasteriesikatselu
  säilyy oletuksena. Fyysisen iPadin GPU-/muistirajat varmennetaan erikseen.
- Osat-työtila muodostaa luettelon erillisistä kiinteistä malliosista ja ryhmistä.
  Numeroitu, säädettävä räjäytyskuva, CSV ja PNG. Piilotetut kokoonpanon osat ovat
  mukana luettelossa. Räjäytyksen siirtymät eivät muuta projektia tai mittoja.
- GitHub Pages -työnkulku testaa ja paketoi `/nivo/`-polkuun. Selainkohtainen
  paikallistallennus ja `.nivo`-tiedostot säilyvät; ei pilvisynkronointia.

### Toteutettu: levyrunko ja leikkauslistan ensimmäinen versio

Automaattinen luettelo on luotettava vain, jos valmistettavat osat ovat erillisiä.
Yksi ontoksi työstetty BRep on yksi osa. Sen pintoja ei lasketa erillisiksi levyiksi.
**Muodot → Levyrunko** on valinnainen toiminto:

1. Käyttäjä valitsee kaapin ulkomitat ja levypaksuuden.
2. Hän valitsee kannen/pohjan suhteen sivuihin (välissä tai päällä/alla).
3. Tausta valitaan: ei taustaa, päällä, upotettu; lisäksi paksuus ja upotus.
4. Esikatselu näyttää nimettyinä sivut, kannen, pohjan ja taustan. Hyväksyntä
   luo erilliset levyt ryhmään yhtenä peruttavana toimintona.
5. Valinnaiset tasavälein jaetut hyllyt sekä yksi- tai pariovi rakoineen sisältyvät
   esikatseluun. Rakenteellinen liitos on puskuliitos; porauksia ja heloja ei lisätä.

Valitusta osasta voi ottaa mitat ja sijainnin. Lähtöosa säilyy oletuksena;
Korvaa lähtöosa -valinta korvaa sen hyväksynnässä. Korvaus ja alkuperäiset
mittaviitteet palautuvat yhdellä Perulla. Työkalu ei päättele liitoksia BRepin pinnoista.
V0.12:n leikkauslista tunnistaa suorakulmaiset erillisosat niiden paikallisista
CAD-mitoista, myös kiertyneet osat. Muut muodot tarvitsevat vahvistetun aihion.
Reunalistat, automaattiset koneistusvähennykset ja linkitettyjen identtisten
komponenttien valmistusmäärät ovat jatkotyötä. Räjäytyskuvan vanha osaluettelon
CSV säilyttää maailman X/Y/Z-ulkomitat; Leikkauslistan oma CSV sisältää aihiomitat.

Muut seuraavat käytettävyyskohteet: ensimmäisen testaajan havainnot, yhtenäinen
hyväksymis-/peruutuslogiikka kaikissa työkaluissa, useat mittakuvan näkymät ja
leikkaukset, kalibroitava referenssikuva sekä linkitetyt komponentit.

### Laajan passin renderöintilisäykset

Kevyt/täysi esikatselu, pysäyttävä näytetavoite ja kameran vaihdon automaattinen
uudelleenaloitus. Erillinen PNG-laskenta ottaa materiaalien, geometrian ja kameran
tilannekuvan omalle renderöijälle. Käyttäjä voi palata malliin, muokata sitä ja
ladata valmiin kuvan tilakortista. Työ voidaan keskeyttää. Välilehden on pysyttävä
auki; taustalle piilotettu selain voi keskeyttää laskennan tilapäisesti.
Studion valoille suunta ja voimakkuus, ympäristövalon voimakkuus ja lattian näkyvyys.

## V0.11: tarkkuus ennen lisäominaisuuksia

Toteutettu: yhteinen hover-/painalluspoiminta, näkyvät priorisoidut CAD-pisteet, kameraa kohti olevan todellisen viereisen pinnan valinta, suorakulmion ja ympyrän vaihdettava piirtotaso, oletuksena yhden akselin siirto, Ctrl-kopioinnin vaihtokytkin sekä vapaan mittamuutoksen ruudukko. Tarkka kirjoitettu mitta ja tarkoituksellinen geometriatartunta säilyvät.

Push/pullin Shift-haku ja kosketuksen Poimi tavoitemitta käyttävät kulma-, keskipiste-, reuna- ja apuviivatartuntoja ennen pintapoimintaa. Piste antaa tason liikkeen suunnassa; liikkuvan pinnan omat pisteet eivät kelpaa tavoitteiksi. Osoitus → E → Shift toimii ilman ylimääräistä lähtöpinnan klikkausta. Muototyökalun viitepisteen lukitus näkyy jo ennen alkupisteen valintaa.

Materiaali ja valaistus löytyvät jo mallin osan tiedoista. Renderin erillinen Valo-välilehti yhdistyy Materiaaliin. Melamiinit ja kalustelevyt nostavat presetit 40:een. PBR-kanavat ja paikallisesti tuotetut kohokuviot, kuvien latauksen odotus ja tracerin palautusta kestävät tekstuurimuunnokset. Tarkentuva esikatselu päivittyy koko kuvan alueelta kerralla.

Seuraavat renderöintiaskeleet: lisensoidut valokuvapohjaiset materiaalipaketit, pinnan UV-sauman hallinta kaarevilla pinnoilla, kohinanpoisto ja fyysisen iPadin GPU-varmennus. Muun käyttöönoton tarkkuushavainnot pysyvät lisäominaisuuksia tärkeämpinä.

## V0.12: säteittäinen räjäytys ja leikkauslista

- Räjäytyksen siirtymä on osan keskipisteen ja kokoonpanon keskipisteen erotus
  kerrottuna räjäytysmäärällä. Kaikki suuntakomponentit säilyvät: takaosan
  sidelistat liikkuvat taakse sekä ylös/alas. Keskitetty osa pysyy paikallaan,
  järjestys ei vaikuta tulokseen, ja Koottu palauttaa täsmälleen lähtöesityksen.
- Osat-näkymän kaksi välilehteä käyttävät yhteistä kokoonpanovalintaa ja numerointia.
  Leikkauslista sisältää erilliset kiinteät osat myös alaryhmistä ja piilotettuina.
- Vakiot/oma levykoko, sahausura ja reunavara. Kuuden deterministisen suorien
  sahausten asettelun vertailu vähentää levyjen tarvetta ja säilyttää jäännöspaloja.
  Materiaali/pintaväri/kuva sekä levypaksuus erottavat levyt. Osakohtainen
  levymateriaalin nimi mahdollistaa tarkoituksellisen yhdistämisen.
- Syysuunta: vapaa 90° kääntö tai osan pituuden/leveyden lukitus levyn pituuteen.
  Suorakulmaisten osien todelliset mitat, käsin annettavat aihiot muille muodoille,
  osakohtainen poisjättö ja liian suuren osan näkyvä ilmoitus.
- A4-vaakasuuntainen vektori-PDF, suora tulostus, numeroidut levykuvat ja osalista,
  sekä CSV levynumeroineen. Keskeneräisyys näkyy myös viennissä. Asetukset ja
  aihiot tallentuvat .nivo-projektiin sekä Peru-historiaan; malli ei muutu.

### Backlog: CNC-ohjeistus

Toteutetaan myöhemmin käyttäjän pyynnöstä. Ei mukana V0.12:ssa.
Työstöradat, työkalujen/terien määritys, kiinnitys- ja läpileikkausvarat,
poraus- ja taskutoiminnot, konekohtaiset postprosessorit ja G-code-vienti.
Nykyinen leikkauslista on suorakulmaisten aihioiden sahaussuunnitelma,
ei koneen ohjausohjelma. Myöhempi nesting: vapaamuotoiset ääriviivat,
olemassa olevat jäännöslevyt sekä eri varastolevykoot samassa materiaalissa.
