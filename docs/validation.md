# Validointi — 1.10.2026

Ympäristö: Apple M1 Pro, 16 Gt, macOS 26.2 arm64, Node 24.14.0.
Playwright 1.63.0 / Chromium 153.0.8010.12. Tablettiprofiili on
Chromiumin iPad Pro 11 -kosketusemulointi, ei fyysinen iPad tai Safari.

## Automaattiset tarkistukset

| Tarkistus                    | Tulos                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                   | 36 testiä hyväksytty.                                                                                                                |
| Kehitystilan selaintestit    | V0.4:n kahdeksan uutta mallinnustyönkulkua hyväksytty työpöydällä kohdistetuissa ajoissa. Aiemmat CAD-worker-kokeet säilyvät.        |
| `npm run build`              | TypeScript ja tuotantopaketointi hyväksytty.                                                                                         |
| Tuotantopaketin selaintestit | Mittasyöttö, apuviivat, Shift-viite, kynä, yhdistäminen sekä aiemmat työnkulut työpöydällä ja tablettiprofiilissa. Ajotulokset alla. |
| `npm run format:check`       | Lähdekoodin ja dokumentaation muotoilutarkistus.                                                                                     |

V0.4:n koko tuotantotestisarja ajetaan komennolla
`NIVO_PREVIEW=1 npm run test:e2e` (50 tapausta). Viimeinen koko ajo:
**45 hyväksytty, 4 tarkoituksella ohitettu, 1 testin odotusvirhe** (5,3 min).
Tabletin ympyräreiän testi latasi sivun uudelleen ennen redo-laskennan valmistumista:
vanha tallennustila oli vielä näkyvissä. Testi odottaa nyt ensin operaation
valmistumisen ja sitten automaattitallennuksen. Aiemman ajon paneelin peittämä
kappalerivi ja toisen testin undo-odotus korjattiin; nämä menivät koko uusinta-ajossa läpi.

Korjattu ympyräreiän testi ajettiin tuotantopaketilla kahdesti kummallakin
profiililla: **4 hyväksytty** (37,9 s). Odotus kohdistuu alapalkin tilaviestiin,
ei laskennan aikana näkyvään toiseen status-elementtiin. Vinon pinnan
testi meni myös kahdesti läpi kummallakin profiililla (**4 hyväksytty**).
Pinnan tunnistus hylkää operaation, jos rajattua aluetta ei löydy; tällöin
toimintoa ei kohdisteta satunnaiseen pintaan. Viimeisen koodimuutoksen jälkeen
36 yksikkötestiä, TypeScript, tuotantopaketointi ja muotoilutarkistus hyväksyttiin.
Kaikki 46 varsinaista selaintapausta on näin varmennettu koko ajon ja
kohdistettujen korjausajojen yhdistelmällä.

Ohitukset ovat kaksi vain kehitystilassa ajettavaa worker-koetta ja
kaksi vain tablettiprofiilille tarkoitettua kosketustestiä työpöytäprofiilissa.

Geometriatestit käyttävät aitoa OpenCascade-WASM-ydintä:

- 600 × 400 × 18 mm pursotus: **4 320 000 mm³**.
- 100 × 100 mm läpiaukon vähennys: **4 140 000 mm³**.
- 2 mm reunapyöristys tuottaa kelvollisen, alkuperäistä pienemmän tilavuuden.
- BRep-serialisointi ja avaaminen säilyttävät tilavuuden.
- Kuusi semanttista pintaa tunnistetaan myös siirretyssä kappaleessa.
- Tasoluonnos toimii ennen pursotusta.
- Kovera kynämuoto (6400 mm²) muodostaa pinnan ja 18 mm pursotuksen.
  Tartuntaverteksit vastaavat todellista topologiaa.
- Päällekkäisten 100 × 100 × 20 mm osien unioni antaa 300 000 mm³;
  erilliset osat säilyttävät yhteistilavuuden 400 000 mm³ saman objektin sisällä.
- Mahdoton 1000 mm pyöristys hylätään ja alkuperäinen kappale säilyy ehjänä.
- 200 erillistä levyä rakentuu workerissa. Virheellinen seuraava pyyntö
  hylätään ja kelvollisen geometrian käsittely jatkuu.
- Laskennan peruminen pysäyttää workerin; seuraava pyyntö käynnistää ytimen uudelleen.
- Laatikon kaikki kuusi pintaa: ulosveto ja sisääntyöntö muuttavat oikeaa mittaa,
  origon paikkaa ja tilavuutta.
- Vinon monikulmion sivupinta ja yhdistetyn osan pinta: positiivinen muutos,
  BRep-tallennus/avaaminen sekä seuraava negatiivinen muutos ovat kelvollisia.
- Pystysuuntainen kynäpinta pursottuu. Epätasomainen muoto ja väärennetyt
  tallennetun pinnan tai BRepin rajalaatikon mitat hylätään.
- Reuna-ankkuri seuraa laatikon siirtoa ja leveyden muutosta. X-ray tallentuu.
- Ympyrän jakaminen 100 × 100 × 20 mm levyyn säilyttää tilavuuden 200 000 mm³.
  Säteen 10 mm tasku vähentää π × 100 × syvyys mm³; läpileikkaus vähentää
  π × 100 × 20 mm³. BRep säilyy tiedostokierrossa.
- Suorakulmainen ja kolmiomainen alue pystypinnalla pursottuvat oikeaan
  suuntaan ja muuttavat tilavuutta pinta-ala × paksuus.
- Kaksi kohdetta ja kaksi pyöreää työstökappaletta, myös käänteinen Cut,
  verrataan laskennallisiin tilavuuksiin. Join yhdistää päällekkäiset osat.
- Irrallinen leikkuri ei muuta kohdetta; kokonaan leikatun kohteen poistuminen
  ja tasoluonnoksen hylkäys työstökappaleena varmennetaan.
- Vino ellipsi säilyttää tarkan tilavuuden ja rajalaatikon.
- Muuttumaton kulmaviite säilyy pinnan jaossa, poistettu kulma katkeaa.
  Join siirtää säilyneen työkalun ankkurin kohteeseen ja tiedostokierros säilyttää sen.
  Reunan keskiosan leikkaus katkaisee siihen viittaavan ankkurin vaikka
  molemmat päätepisteet säilyvät; jäljellä olevan reunan viite toimii.
- V3-projektit siirtyvät V4:ään oletuskäyttötarkoituksella `model`.

Selaimessa ajetut työnkulut:

1. Uusi projekti → 600 × 400 mm suorakulmio → 18 mm push/pull.
2. `2,4 m` siirto X-suunnassa ja negatiivinen siirtymä Y-suunnassa.
3. Undo/redo palauttaa oikeat sijainnit.
4. Rinnakkaisprojektio, etunäkymä ja todellinen pintavalinta näkymästä.
5. Leveys- ja korkeusmitat sekä SVG-tiedoston lataus.
6. `.nivo`-tiedoston lataus, uudelleenlatauksesta palautuminen, uusi projekti,
   tiedostotuonti ja virheellisen version turvallinen hylkäys.
7. Sormella piirtäminen, hyväksyntä sormen noustessa ja näytön suunnan vaihtaminen.
8. Kaappiesimerkin avaus, mitoitus, kappaleen poisto → rikkoutunut mittaviite
   → vienti estyy → undo korjaa viitteen.
9. Kirjoittaminen ilman kentän klikkaamista, Tab, Enter sekä vedon hyväksyntä
   täsmälleen kerran. Tarkat mitat ja aloituspiste säilyvät vapautuksessa.
10. Keskipisteen haku, Shift-lukitus ja uuteen muotoon tallentuva tarkka kohdistus.
11. Mittatyökalun kaksi tilaa, R/45°, Shift/vapaa kulma, tarkka asteluku,
    apuviivan ja vapaan mittaviivan tallennus.
12. Piirto ja siirto tarttuvat apuviivaan; viivat palautuvat uudelleenlatauksessa.
13. Kynän sulkeminen, pursotus, monivalinta, yhdistäminen ja lähteiden palautus
    undolla. Tarkat kynäsiirtymät toimivat ilman uutta hiiren liikettä;
    virheellinen mittasyöte hylätään.
14. Kosketuksen Poimi viite sekä kahden sormen navigointi: keskeneräistä
    piirtoelettä ei hyväksytä navigoinnin päätteeksi.
15. E ensin → etupinnan hover-korostus → veto 40 mm → valitun pinnan
    numerotyöntö −40 mm palauttaa alkuperäiset mitat.
16. Reunasta vedetty apuviiva säilyy rinnakkaisena ja saa 80 mm offsetin;
    R ja Shift+R toimivat luonnin jälkeen. Akselilukko ja Esc säilyttävät työkalun.
    Valmista viivaa voi valita suoraan näkymästä.
17. Kappaleen alle jäävä apuviiva peittyy, viivakohtainen x-ray näyttää sen,
    globaali x-ray säilyy uudelleenlatauksessa.
18. Kynän kolmas viiva lukittuu Shiftillä. Ensimmäisestä pisteestä poimittu
    pituus on täsmälleen 200 mm ja tuottaa oikean neljännen kulman. Shiftin
    vapautuksen jälkeen aloitusverteksiin tarttuminen sulkee muodon.
    Ctrl/Cmd+Z ja Ctrl/Cmd+Shift+Z säilyvät historiaoikoteinä myös kynän ja
    mittatyökalun aikana; Z-akselin lukko ei kaappaa niitä.
19. X/Z-lukoilla tehty pystypinta, lukon vapautus Escillä, E-pursotus 20 mm
    ja syntyneen BRep-kappaleen palautuminen uudelleenlatauksessa.
20. 80 000 × 60 000 × 18 mm levyn ja seinämän neljä kamerakulmaa sekä
    rinnakkaisprojektio renderöityvät ilman selainvirheitä. Kuvantarkistus
    täydentää automaatiota; yksittäiset kuvat eivät todista kaikkien laitteiden
    tai jokaisen animaatioruudun välkkymättömyyttä.

SVG-tarkistus varmistaa A4:n `297mm × 210mm`-koon ja vastaavan viewBoxin.
600 mm leveä kappale mittakaavassa 1:5 käyttää 120 mm paperileveyttä.
Mittatekstin koko määritellään paperiyksiköissä eikä kamerasta tai pikseleistä.

V0.4:n uudet selaintyönkulut, molemmilla profiileilla:

1. Ympyrä kappaleen pinnalle → valittu alue → E → Leikkaa läpi → undo/redo
   ja uudelleenlataus säilyttävät tarkan mallin.
2. Suorakulmion negatiivinen paksuus pystypinnalle sekä kynällä piirretty
   kolmio ja E muodostavat erimuotoiset taskut.
3. Kahden levyn leikkaaminen kahdella sylinterillä, työstökappaleiden poisto,
   undo/redo ja selaintallennuksesta palautuminen.
4. Kohteiden poiminta näkymästä, ryhmien vaihto, käänteinen Cut säilytetyllä
   työkalulla ja Join samasta valikosta.
5. Ellipsin tarkat halkaisijat ja paksuus, nimetty osa, Enter-hyväksyntä
   ominaisuuskentästä sekä säännöllinen monikulmio apumuotona.
6. Kohteeseen osumaton Cut säilyttää projektin ja kertoo virheestä;
   tasoluonnosta ei voi valita leikkuriksi.
7. Syvyyden poiminta toisesta pinnasta antaa valitulle alueelle −30 mm;
   referenssikappale säilyy muuttumattomana.
8. Vinolta CAD-tasolta aloitettu ympyrä pysyy täsmälleen pinnassa ja
   E:n negatiivinen syvyys muodostaa taskun muuttamatta osan ulkorajoja.

![SVG-mittakuvan esikatselu](images/nivo-drawing.png)

## Rajat ja avoimet tarkistukset

- Fyysinen tabletti, Safari/iPadOS, kynä ja laitteiston todellinen
  suorituskyky/muistibudjetti ovat vielä testaamatta.
- 60/30 fps ovat tavoitteita, eivät todettuja tuloksia. 200 osan koe varmentaa
  CAD-rakentamisen, ei satojen osien tabletin navigoinnin sujuvuutta.
- WASM on noin 23 Mt (gzip noin 7,3 Mt), mikä vaikuttaa ensilataukseen.
- Vite varoittaa suuresta pääpaketista ja CAD-loaderin Node-haaran
  ulkoistamisesta. Tuotantotyönkulkujen selaintestit varmentavat käytetyn
  selainhaaran toiminnan.
- Muuttumattomien verteksien apuviitteet säilyvät Cut/Join- ja pintamuutoksissa.
  Muuttuvien verteksien automaattinen uudelleenkohdistus ja pysyvät yleiset
  pintaviitteet ovat jatkotyötä.
- Piirtotaso valitaan aloittamalla kappaleen tasopinnalta. Tyhjän tilan
  suorakulmiot ja ympyrät syntyvät XY-tasolle. Kynän vapaa taso seuraa näkymää
  ja edellistä pistettä; X/Y/Z sekä geometriapisteet tukevat 3D-pisteitä.
  Suljettavan muodon on oltava tasomainen. Kappaleen vapaa kierto ei ole mukana.
- Apuviivan tartunta edellyttää samaa tasoa. Haettu 3D-viite projisoidaan
  aktiiviseen tasoon. Keskipiste on kappaleen rajalaatikon keskipiste.
- Yhdistäminen edellyttää tilavuuskappaleita. Tasopinnan push/pull toimii myös
  yhdistetylle osalle, kaareville pinnoille ei vielä. Kaarevareunainen
  tasopinta, kuten ympyrä, on tuettu.
- Nimetty osa on itsenäinen kappale. Linkitetyt komponenttimäärittelyt ja
  instanssien yhteismuokkaus ovat jatkotyötä.
- Arkilla on yksi näkymä. Useiden päällekkäisten mittaviivojen automaattinen
  sijoittelu ei ole valmis; käytä ensimmäisessä versiossa muutamaa kokonaismittaa.
- Esimerkkikaappi todentaa kuuden levyn rungon. Täydelliset hyväksymisesimerkit
  A–C odottavat linkitettyjä komponentteja, materiaaleja ja scenejä.
