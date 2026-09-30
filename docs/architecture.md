# Arkkitehtuuri — v0.2

Tarkistettu 30.9.2026 npm-rekisteristä, pakettien rajapinnoista ja ajettavilla kokeilla.

## Tekninen valinta

| Osa                    | Versio  | Perustelu / lisenssi                                                            |
| ---------------------- | ------- | ------------------------------------------------------------------------------- |
| TypeScript             | 7.0.2   | Tiukka tyypitys projektirajalla ja workerissa. Apache-2.0.                      |
| React                  | 19.3.0  | Paneelit ja työkalutila, erillään 3D-renderöinnistä. MIT.                       |
| Vite                   | 8.3.1   | ESM-worker, WASM erillisenä resurssina. MIT.                                    |
| Three.js               | 0.186.1 | WebGL2, raycasting, kamerat ja kosketusnavigointi. MIT. npm-muokkaus 24.9.2026. |
| Replicad               | 1.1.0   | BRep-operaatiot, serialisointi ja HLR-projektio. MIT. npm-muokkaus 4.9.2026.    |
| replicad-opencascadejs | 1.1.0   | Single-threaded CAD-WASM omassa workerissa. LGPL-2.1-only.                      |
| Zod                    | 4.6.5   | Tiedostotuonnin ja transaktiorajan validointi. MIT.                             |

Lockfile lukitsee versiot. Kirjastot olivat tuoreesti päivitettyjä tarkistushetkellä;
ylläpidon jatkumista ei oleteta taatuksi. CAD-rajapinta on eristetty vaihtamista varten.

Ensisijaiset lähteet:

- [Replicadin integrointi ja worker-suositus](https://github.com/sgenoud/replicad/blob/main/packages/replicad-docs/docs/use-as-a-library.md)
- [Replicadin lähde ja lisenssi](https://github.com/sgenoud/replicad)
- [CAD-WASM-buildin lähde](https://github.com/sgenoud/replicad/tree/main/packages/replicad-opencascadejs)
- [Serialisoinnin rajapinta](https://replicad.pages.dev/docs/examples/serialization/)
- [Three.js](https://github.com/mrdoob/three.js)
- [OpenCascade.js](https://github.com/donalffons/opencascade.js)
- [OCCT-lisenssi](https://github.com/Open-Cascade-SAS/OCCT/blob/master/LICENSE_LGPL_21.txt)
- [OCCT-poikkeus](https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt)

## Vastuut

```text
src/model      tarkka lähdemalli, UUID:t, mitat, historia, yksiköt, tartunnat
src/cad        worker-protokolla, BRep, kelvollisuustarkistus, mesh ja HLR
src/viewport   Three.js, kamerat, pintavalinta ja osoitineleet, esikatselu
src/drawing    ortografisen CAD-projektion sijoitus fyysiselle SVG-arkille
src/storage    IndexedDB, projektitiedostot ja lataus
src/useEditor  atominen muutos, vanhojen vastausten hylkäys, historia, tallennus
src/App        työkalutila, paneelit, käyttöohjeet
```

V2:n auktoritatiivinen geometria on suorakulmion tai monikulmion pursotuksen
tarkka resepti ja sijainti, tai yhdistämisen litistetty lähdejoukko.
Worker rakentaa siitä aidon BRep-kappaleen. Näyttöverkkoa ei käytetä
geometrian ainoana lähteenä. Vapaan mallinnuksen BRep/operaatiohistoria tulee
lisätä projektiformaatin migraation kautta.

## Atominen laskenta ja resurssit

Validointi → ehdokasprojekti → worker → geometrian kelvollisuus → projektin ja
meshien yhteinen commit → historia → automaattitallennus.
Virhe säilyttää edellisen projektin. Undo/redo vaihtaa historiaa vasta ehjän
geometrian valmistuttua.

Worker käsittelee pyynnöt jonossa. Pääsäie hyväksyy vain nykyisen revision
vastauksen. Peruminen kasvattaa revisiota ja pysäyttää workerin. Uusi toiminto
käynnistää uuden ytimen. 45 sekunnin aikaraja katkaisee jumittuneen laskennan.

Geometria välimuistitetaan UUID:n, reseptin ja sijainnin perusteella.
Jokainen objekti tuottaa yhden Three.Meshin sekä erillisen reunaviivaesityksen.
Yhdistäminen korvaa valitut lähteet uudella UUID:llä ja yhdellä CAD-tuloksella;
undo palauttaa lähteet. Erilliset solidit voivat olla saman objektin compoundissa.
Muuttumattomia kappaleita ei lasketa uudelleen. Korvatut BRep- ja GPU-resurssit
vapautetaan. Replicadin compound- ja boolean-operaatioille annetaan kopiot:
ne voivat ottaa syöteolioiden omistajuuden. Näkymää renderöidään muutoksissa,
ei jatkuvana animaationa paikallaan ollessa.

Tallennusvirhe näkyy käyttäjälle ja malli säilyy muistissa. Ladattava tiedosto
ei vaadi File System Access API:a. Automaattitallennus ei ole varmuuskopio.

## Topologia

Kappaleella on UUID. Nykyisen suorakulmaisen pursotuksen pinnat ovat `x:min`,
`x:max`, `y:min`, `y:max`, `z:min`, `z:max`. CAD-meshin faceGroup liitetään
semanttiseen pintaan normaalista, ei pysyvänä pidettävästä kolmionumerosta.
Tämä menetelmä koskee vain nykyisiä akselien suuntaisia levyjä.

Mittaus viittaa UUID:hen, akseliin ja min/max-rajoihin. Uudelleenkolmiointi tai
mitan muuttuminen ei katkaise viitettä. Poistettu kappale jättää näkyvän
rikkoutuneen mittaviitteen ja estää viennin, kunnes viite on korjattu/peruttu
tai mitta poistettu. Viitettä ei siirretä hiljaisesti toiseen kappaleeseen.

Apuviiva viittaa kappaleen UUID:hen ja verteksiin. Laatikossa käytetään
semanttista kulmaa, monikulmiossa pisteindeksiä ja pohja/kansi-tietoa.
Yhdistetyssä osassa ankkuri on paikallinen CAD-verteksi; nykyiset siirrot
säilyttävät sen. Yhdistäminen antaa uuden UUID:n eikä arvaa vanhojen viitteiden
kohteita. Viivat-lista näyttää puuttuvan viitteen. Kynän ja yhdistelmän
`surface:n`-tunnisteet ovat vain hetkellistä pintavalintaa.
Tartuntapisteet otetaan CAD-reunoista, eivät rajalaatikon kuvitteellisista kulmista.
Kappaleen keskipiste tarkoittaa rajalaatikon keskipistettä.

Vaiheen 3 leikkaukset ja jaetut pinnat tarvitsevat operaatiokohtaisen
topologian muunnoskartan. Mesh-tuonti saa oman tyypin ja toimintovalikoiman.

## Piirustus ja kosketus

OpenCascaden hidden-line-removal käsittelee koko kappalejoukon. Näkyvät ja
piilossa olevat viivat erotetaan; renderöintikolmiot eivät siirry piirustukseen.
Kukin piirustus käyttää erikseen määriteltyä ortografista kameraa.

SVG:n 297 × 210 mm ja vastaava viewBox tekevät yhdestä SVG-yksiköstä yhden
paperimillimetrin. Mallipolut skaalataan `1/mittakaava`. Mittateksti (3,2 mm)
ja mittaviiva (0,18 mm) ovat paperiyksiköissä mallimuunnoksen ulkopuolella.
600 mm → 1:5 → 120 mm paperilla tarkistetaan automaattisesti.

Pointer Events kattaa hiiren, kosketuksen ja kynän. Napautus valitsee.
Yksi sormi käyttää työkalua; toinen sormi keskeyttää muokkausvedon ja vaihtaa
panorointiin/zoomaukseen. Navigoi-tila tarjoaa orbitoinnin yhdellä sormella.
Keskeiset painikkeet ovat kosketuksella vähintään 44 CSS-pikseliä.
Tartunnat suosivat todellisia verteksiä ja reunojen keskipisteitä ennen
apuviivoja, viitteen suuntia ja 45° ennakointia. Hystereesi vähentää värähtelyä.
Shift poimii juuri haetun pisteen ja vapautus poistaa viitteen; kosketuksella
viite poimitaan painikkeella. Mittatyökalussa Shift tarkoittaa vapaata kulmaa.

Numerosyöttö lukitsee kirjoitetut kentät, Tab kiertää kenttiä.
Osoittimen vapautus ja Enter käyttävät samaa atomista hyväksyntää;
synkroniset luonnosviitteet estävät vanhan React-tilan tallentumisen.
Kynän itsensä leikkaava tai degeneroitunut ääriviiva hylätään ennen CAD-laskentaa.
Päällekkäisten kohteiden kierrätys ja mielivaltaiset piirtotasot ovat jatkotyötä.

## Tuotantopaketti ja kirjaston vaihto

WASM on erillinen resurssi (`replicad-opencascadejs/wasm?url`). Single-threaded-
build ei vaadi cross-origin-isolation-otsakkeita. Paketti on noin 23 Mt,
gzip noin 7,3 Mt: ensilataus hitaalla yhteydellä on todellinen rajoite.
Tuotantopalvelimella kannattaa käyttää gzip/Brotli-pakkausta ja versioitujen
assetien pitkäikäistä välimuistia.

Vite ulkoistaa CAD-loaderin Node-haaran `node:module`-tuonnin. Selain ei suorita
sitä haaraa; tuotantopaketin selaintesti tarkistaa tämän käytännössä.

WASM:n lisenssit, lähdeversio ja build-konfiguraatio ovat
`public/licenses/NOTICE.txt`-tiedostossa. Muokatun kirjaston voi rakentaa
upstreamin Docker/ytt-konfiguraatiolla, korvata npm-paketin omalla buildilla tai
vaihtaa workerin init/WASM-tuonnit ja ajaa `npm run build` uudelleen.
Sovelluksen lisenssi sallii kirjaston vaihtamisen ja muokkaamisen.

## Mitattavat suorituskykytavoitteet

Referenssit: M1 Pro / 16 Gt / macOS 26.2 / Chromium; fyysinen iPad/Safari on
vielä sovittava ja testattava. Testimallit ovat kuuden levyn kaappi ja 200
600 × 400 × 18 mm levyä.

Tavoite on noin 60 fps tietokoneella ja vähintään 30 fps tabletilla navigoitaessa.
Näitä ei ole vielä mitattu saavutetuiksi. Nyt mitataan 200 osan worker-laskenta.
Komponenttien jaettu geometria, GPU-instanssitus, tekstuuribudjetit ja fyysisen
tabletin muisti-/fps-profiilit kuuluvat myöhempiin vaiheisiin.
