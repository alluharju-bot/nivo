# Pilvisynkronoinnin ensimmäinen versio

Nivo tallentaa ensin selaimeen. Käyttäjä ottaa synkronoinnin käyttöön projektikirjaston kohdasta **Synkronoi tämä projekti**. Kirjautuminen ei lähetä muita selaimessa olevia projekteja. Avoimen projektin muutokset siirtyvät kolmen sekunnin työskentelytauon jälkeen; yhteyden paluu, ikkunaan palaaminen ja 30 sekunnin tarkistus jatkavat kesken jäänyttä synkronointia. Suljetut paikalliset projektit synkronoidaan, kun ne avataan.

Toisella laitteella kirjaudutaan samalla sähköpostilla ja avataan projekti pilvilistasta. Avaaminen tekee oman paikallisen tallenteen: aiempi malli ja sen toimintohistoria säilyvät kirjastossa. Pilvessä muuttunutta mallia ei vaihdeta kesken työskentelyn automaattisesti. Jos molemmat laitteet muokkaavat yhteisen version jälkeen, näkymä tarjoaa pilviversion avaamista tai oman version säilyttämistä erillisenä pilviprojektina. Osien automaattista yhdistämistä ei tehdä.

## Käyttöönotto

Tietokantarakenne ja selainasiakas ovat repositoriossa. Tuotantopalvelua ei ole vielä yhdistetty: siihen tarvitaan pääsy Nivolle perustettavaan Supabase-projektiin sekä sen julkiset selainasetukset.

### Valmisteltu käyttöönottokomento

`npm run cloud:setup -- --help` näyttää vaihtoehdot. Komento käyttää Supabasen hallinta-API:a. Se ei luo projektia tai muuta muiden sovellusten tietokantoja: kohteen nimen pitää olla `Nivo` tai alkaa esimerkiksi `Nivo-`.

1. Luo Nivolle oma projekti Supabasessa tai tee käyttöönotto yhdistetyn Supabase-lisäosan kautta.
2. Aseta paikalliseen, gitin ohittamaan `.env.supabase-setup.local`-tiedostoon `SUPABASE_ACCESS_TOKEN` (hallinta-API:n käyttöavain) ja `NIVO_SUPABASE_PROJECT_REF` (20-merkkinen projektitunniste). Älä käytä toisen sovelluksen `service_role`-avainta. Avainta ei tarvitse lähettää keskusteluun.
3. Tarkista suunnitelma:

   ```sh
   node --experimental-strip-types --env-file=.env.supabase-setup.local scripts/setup-supabase.ts
   ```

4. Ota asetukset käyttöön; `--github` edellyttää kirjautunutta `gh`-työkalua:

   ```sh
   node --experimental-strip-types --env-file=.env.supabase-setup.local scripts/setup-supabase.ts --apply --github
   ```

Komento ajaa puuttuvat migraatiot, asettaa kirjautumisen paluuosoitteet ja suomenkieliset sähköpostipohjat (linkki ja vahvistuskoodi). Se tarkistaa kirjautumisasetukset uudelleen ja kirjoittaa vain julkisen URL:n ja publishable-avaimen `.env.local`-tiedostoon ja valinnaisesti GitHub Actions Variables -asetuksiin. Hallinta-avainta tai palvelimen salaisia vastauksia ei tulosteta. Migraatiohistoria estää saman migraation uusinnan seuraavalla ajolla. Komento säilyttää olemassa olevan SMTP-palvelun ja muut sallitut paluuosoitteet.

Ilman omaa SMTP-palvelua Supabasen oletuslähetys on rajattu projektin tiimin osoitteisiin ja sillä on tiukat lähetysrajat. Yleiselle käyttäjäjoukolle tarvitaan oma lähetyspalvelu. Katso [Supabasen SMTP-ohje](https://supabase.com/docs/guides/auth/auth-smtp). Käyttöönotto ei hanki maksullista palvelua tai muuta olemassa olevia sähköpostitunnuksia.

Käynnistä paikallinen palvelin uudelleen ja julkaise uusi Pages-build asetusten tallentamisen jälkeen. Testaa oikea kirjautuminen, kahden laitteen synkronointi ja eri käyttäjien eristys pienillä testiprojekteilla ennen asiakasmalleja. Poista väliaikainen hallinta-avain käytön jälkeen.

### Vaihtoehtoinen käsikäyttöönotto

1. Luo Nivolle oma Supabase-projekti. Näin muiden sovellusten tallennuskäytännöt ja kirjautumisasetukset eivät vaikuta Nivoon.
2. Suorita `supabase/migrations/202610130001_nivo_cloud.sql` SQL Editorissa tai Supabase CLI:n migraationa. Se luo vain Nivon taulun, yksityisen tiedostosäiliön, käyttöoikeudet ja version tarkistavan tallennusfunktion.
3. Aseta Auth → URL Configuration: Site URL `https://alluharju-bot.github.io/nivo/` ja sama osoite sallittuihin redirect-osoitteisiin. Lisää paikallista testausta varten `http://127.0.0.1:5173/`. Ota sähköpostikirjautuminen käyttöön ja määritä tuotannossa oma SMTP-palvelu sekä tarkoitukseen sopivat kirjautumisen rajoitukset.
4. Lisää GitHub-repositorion Actions **Variables** -asetuksiin `VITE_SUPABASE_URL` ja `VITE_SUPABASE_PUBLISHABLE_KEY`. Molemmat ovat selaimeen tarkoitettuja julkisia arvoja. Älä käytä ylläpitoavainta, `service_role`-avainta, tietokannan salasanaa tai `sb_secret_`-avainta. Paikallisesti arvot voi asettaa gitin ohittamaan `.env.local`-tiedostoon.
5. Julkaise uusi Pages-build. Ilman asetuksia käyttöliittymä kertoo, ettei pilveä ole vielä yhdistetty; paikalliset toiminnot toimivat edelleen.
6. Testaa omalla pienellä testiprojektilla kahdella laitteella ennen varsinaisten asiakasprojektien siirtämistä. Sähköpostilinkki avataan samassa selaimessa, josta kirjautuminen aloitettiin (PKCE). Aseta `supabase/templates/sign-in.html` sekä Magic Link- että Confirm Signup -pohjaksi. Siinä on myös `{{ .Token }}`-koodi: jos luet sähköpostin toisella laitteella, syötä koodi alkuperäiseen Nivo-ikkunaan.

Build ja paikallinen käynnistys hylkäävät puutteellisen konfiguraation sekä ylläpito- ja `service_role`-avaimet ennen selainpaketin rakentamista. Jos molemmat julkiset asetukset puuttuvat, Nivo toimii paikallisesti.

## Tallennuksen suojaus

- Tiedostot ovat yksityisessä `nivo-projects`-säiliössä käyttäjän UUID-hakemistossa. Uusi tallennus saa uuden osoitteen, eikä selaimella ole oikeutta muuttaa tai poistaa aiempaa tiedostoa.
- `nivo_projects`-taulun listaus on rajattu kirjautuneen käyttäjän riveihin RLS:llä. Selain ei saa kirjoittaa taulua suoraan.
- `nivo_commit_project` tarkistaa kirjautuneen käyttäjän, tiedoston omistajahakemiston ja olemassaolon sekä edellisen version numeron. Samanaikaisista tallennuksista vain yhteiseen lähtöversioon ensimmäisenä ehtivä hyväksytään.
- SHA-256 tarkistaa ladatun projektin sisällön. Tallennusaikaleiman muutos ei yksin tuota uutta versiota. Pilven projektitunniste säilyy laitteiden välillä, vaikka paikallinen kirjastotunniste vaihtuu.
- Paikallinen synkronointitieto erotellaan Supabase-osoitteen, käyttäjän ja projektin mukaan. Tilin vaihto ei aloita vanhan käyttäjän projektien lähettämistä. Uloskirjautuminen säilyttää selaimen paikalliset tiedostot; selainta ei tule pitää jaetun koneen salattuna käyttäjäkohtaisena säilönä.
- Epäonnistunut lähetys ei siirrä yhteisen version osoitinta eteenpäin. Myös palvelimelle ehtinyt tallennus, jonka vastaus katkesi, tunnistetaan seuraavalla yrityksellä.

## Ensimmäisen version rajat

Synkronointi siirtää kokonaisen projektin (sisältäen projektin omat tekstuurit ja merkinnät), enintään 50 Mt/tallenne. Selaimen Peru-historia ja paikalliset nimetyt vertailuversiot eivät vielä synkronoidu. Pilvitallennuksen aiempia tiedostoja ei tässä versiossa poisteta automaattisesti, joten tilankäyttöä on seurattava. Tuotantokäyttöönoton seuraava vaihe on versioiden säilytysraja ja palvelinpuolinen siivous, käyttäjäkohtainen tilakiintiö ja pilviprojektin hallittu poistaminen. Pilvi ei vielä tarjoa yhteismuokkausta tai kutsuttavia projektijakoja.

## Testaus

`npm test` ajaa synkronointiskenaariot sekä migraation PostgreSQL-yhteensopivassa PGlite-testitietokannassa. Testi luo Supabasen auth/storage-rakenteiden vähimmäisvastineet, tarkistaa käyttäjäeristyksen, anonyymin eston, muuttumattomat tiedostot ja versioristiriidat. Tämä ei korvaa oikean Supabase-palvelun käyttöönottotestiä.

`npx playwright test --config=playwright.cloud.config.ts --headed` käynnistää erillisen paikallisen sovelluksen porttiin 5183 ja jäljittelee Supabase HTTP -palvelun testiselaimissa. Se testaa koodikirjautumisen, virheellisen koodin, uloskirjautumisen, kahden laitteen, offline-muutosten, rinnakkaisten versioiden, listan päivittymisen, uudelleenlatauksen ja toisen käyttäjän eristyksen käyttöliittymän läpi. Asiakasprojekteja ei lähetetä verkkoon.

`npx vitest run src/cloud` sisältää lisäksi julkisten asetusten tarkistuksen sekä käyttöönottokomennon kuiva-ajon, migraatioiden uusinnan eston, muiden sovellusten suojaamisen ja virhetilanteiden testit. Hallinta-API jäljitellään näissä testeissä; ne eivät todista tuotantotilin käyttöoikeuksia tai sähköpostin toimitusta.

Viralliset lähteet: [sähköpostikirjautuminen](https://supabase.com/docs/guides/auth/auth-email-passwordless), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [tallennuksen käyttöoikeudet](https://supabase.com/docs/guides/storage/security/access-control), [tietokantafunktiot](https://supabase.com/docs/guides/database/functions).
