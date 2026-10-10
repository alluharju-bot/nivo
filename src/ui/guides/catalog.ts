import type { Tool } from '../../viewport/Viewport';
import type { MeasureMode } from '../ToolRail';

export type GuideStep = { title: string; text: string; key?: string };
export type Guide = {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  steps: GuideStep[];
  tip: string;
};
const step = (title: string, text: string, key?: string): GuideStep => ({ title, text, key });
/** These are schematic lessons, not recordings or a second modeling implementation. */
export const toolGuides = [
  {
    id: 'select',
    title: 'Valitse',
    category: 'Perusteet',
    shortcut: 'V',
    steps: [
      step('Osoita osaa', 'Napsautus valitsee koko osan.'),
      step(
        'Valitse alue',
        'Vedä tyhjästä tilasta vasemmalta oikealle: kokonaan sisällä olevat osat valitaan.',
      ),
      step('Lisää valintaan', 'Shift-napsautus lisää tai poistaa osan valinnasta.', 'Shift'),
    ],
    tip: 'Oikealta vasemmalle vedetty alue valitsee myös osittain alueeseen osuvat. Tuplaklikkaus avaa osan muokattavaksi. H piilottaa, Shift+H palauttaa viimeksi piilotetut ja Alt+H kaikki piilotetut.',
  },
  {
    id: 'navigate',
    title: 'Navigoi',
    category: 'Perusteet',
    steps: [
      step('Osoita kiertokohtaa', 'Vie kohdistin tarkasteltavan pinnan kohdalle.'),
      step(
        'Kierrä näkymää',
        'Vedä hiiren oikealla painikkeella. Navigoi-työkalulla myös vasen painike kiertää.',
      ),
      step('Tarkenna yksityiskohtaan', 'Rulla zoomaa kohdistimeen. Kuutio vaihtaa katselusuunnan.'),
    ],
    tip: 'Kosketuksella Navigoi + yksi sormi kiertää. Kaksi sormea panoroi ja zoomaa. Yleisnäkymä sovittaa koko mallin.',
  },
  {
    id: 'rectangle',
    title: 'Suorakulmio',
    category: 'Piirtäminen',
    shortcut: 'S',
    steps: [
      step('Napsauta alkukulmaa', 'Pinta kohdistimen alla määrää piirtotason.'),
      step(
        'Osoita vastakulmaa',
        'Liikuta hiirtä. Voit kirjoittaa leveyden ja vaihtaa syvyyteen Tabilla.',
        '600 → Tab → 400',
      ),
      step('Hyväksy', 'Napsauta vastakulmaa tai paina Enter. Myös vetäminen toimii.', 'Enter'),
    ],
    tip: 'X/Y/Z vaihtaa piirtotasoa. Tavallisesti syntyy uusi osa; avatun osan Pinnan alue -tila muokkaa sen pintaa.',
  },
  {
    id: 'circle',
    title: 'Ympyrä',
    category: 'Piirtäminen',
    shortcut: 'C',
    steps: [
      step('Napsauta keskipistettä', 'Aloita tasolta, osan pinnalta tai tartuntapisteestä.'),
      step('Osoita reunaa', 'Vedä säde hiirellä tai kirjoita halkaisija.', 'Ø 100'),
      step(
        'Hyväksy ympyrä',
        'Napsautus tai Enter tekee muodon. Paksuus muuttaa sen sylinteriksi.',
        'Enter',
      ),
    ],
    tip: 'Rakentamisen apumuoto tekee pelkän kehän tartunnoille. Valmiin tavallisen ympyrän tai sylinterin halkaisijaa voi muuttaa osan asetuksista.',
  },
  {
    id: 'ellipse',
    title: 'Ellipsi',
    category: 'Piirtäminen',
    steps: [
      step('Valitse ellipsi', 'Avaa Muodot ja valitse Ellipsi. Napsauta keskipistettä.'),
      step(
        'Määritä leveys ja syvyys',
        'Osoita muoto hiirellä tai syötä mitat Tabilla.',
        '160 → Tab → 90',
      ),
      step('Hyväksy', 'Enter tai napsautus tekee ellipsin valitulle tasolle.', 'Enter'),
    ],
    tip: 'X/Y/Z vaihtaa piirtotasoa. Nollapaksuus tekee tasomuodon, jota voi käyttää myös aukon leikkurina.',
  },
  {
    id: 'polygon',
    title: 'Monikulmio',
    category: 'Piirtäminen',
    steps: [
      step('Valitse sivujen määrä', 'Valitse Muodot → Monikulmio ja anna sivujen määrä.'),
      step(
        'Aseta keskipiste ja koko',
        'Napsauta keskipiste, osoita reuna tai kirjoita halkaisija.',
        '6 sivua',
      ),
      step('Hyväksy', 'Napsautus tai Enter tekee säännöllisen monikulmion.', 'Enter'),
    ],
    tip: 'Paksuus tekee umpinaisen osan. Kynällä voit piirtää epäsäännöllisiä monikulmioita.',
  },
  {
    id: 'sphere',
    title: 'Pallo',
    category: 'Piirtäminen',
    steps: [
      step('Valitse Pallo', 'Avaa Muodot → Pallo ja napsauta keskipistettä.'),
      step('Määritä halkaisija', 'Osoita koko tai kirjoita halkaisija.', 'Ø 100'),
      step('Hyväksy pallo', 'Napsautus tai Enter luo erillisen umpinaisen osan.', 'Enter'),
    ],
    tip: 'Pallolle ei anneta erillistä paksuutta. Siirrä ja kierrä sitä tavallisilla työkaluilla.',
  },
  {
    id: 'pen',
    title: 'Kynä',
    category: 'Piirtäminen',
    shortcut: 'K',
    steps: [
      step('Napsauta alkupistettä', 'Tartu kulmaan, reunaan tai apuviivojen risteykseen.'),
      step(
        'Osoita suunta ja anna pituus',
        'Kirjoita mitta ja paina Enter. Positiivinen luku jatkaa osoittamaasi suuntaan.',
        '92 → Enter',
      ),
      step(
        'Jatka tai sulje muoto',
        'Palaa alkupisteeseen pinnan tekemiseksi. Valmis viiva säilyttää avoimen viivan.',
      ),
    ],
    tip: 'Shift pitää suunnan ja poimii viitepituuden myös toisella korkeudella olevasta pisteestä. Tyhjä X/Y/Z-kenttä tarkoittaa nollaa. Backspace poistaa viimeisen pisteen.',
  },
  {
    id: 'bezier',
    title: 'Bézier-käyrä',
    category: 'Piirtäminen',
    steps: [
      step('Valitse Muodot → Bézier-käyrä', 'Pisteiden kautta -tila on helpoin tapa aloittaa.'),
      step(
        'Napsauta käyrän pisteet',
        'Kolmas piste taivuttaa käyrää. Pisteet tarttuvat mallin viitteisiin.',
      ),
      step('Viimeistele käyrä', 'Enter tallentaa avoimen käyrän.', 'Enter'),
    ],
    tip: 'Ohjauspisteet-tilassa ensimmäinen kaari tarvitsee neljä pistettä. Valmiin käyrän tartuntapisteitä ja pisteiden mittoja voi muokata oikealta.',
  },
  {
    id: 'extrude',
    title: 'Push / pull',
    category: 'Muotoilu',
    shortcut: 'E',
    steps: [
      step('Osoita pintaa', 'Korostus näyttää muokattavan pinnan.'),
      step('Vedä pintaa', 'Vedä ulos tai sisään. Kirjoittamalla saat tarkan mitan.', '40 mm'),
      step('Hyväksy', 'Vapauta veto, napsauta tai paina Enter.', 'Enter'),
    ],
    tip: 'Shift poimii tavoitteen pisteestä, reunasta tai pinnasta. Tab vaihtaa siirtymän ja toteutuvan kokonaismitan välillä. Leikkaa läpi puhkaisee rajatun alueen.',
  },
  {
    id: 'offset',
    title: 'Offset',
    category: 'Muotoilu',
    shortcut: 'O',
    steps: [
      step(
        'Osoita pintaa ja paina O',
        'Voit myös valita työkalun ensin ja napsauttaa pintaa.',
        'O',
      ),
      step('Säädä sisennystä', 'Liikuta hiirtä tai kirjoita sisennyksen mitta.', '18 mm'),
      step(
        'Hyväksy rajaus',
        'Napsauta tai paina Enter. Sisäalueesta tulee oma muokattava pinta.',
        'Enter',
      ),
    ],
    tip: 'Jatka E:llä: työnnä sisäalue sisään esimerkiksi kaappirungoksi. Tasomuodolle Ulospäin tai miinusmitta tekee ulkokehän, jonka voi nostaa seiniksi. Alkuperäinen pinta säilyy.',
  },
  {
    id: 'move',
    title: 'Siirrä',
    category: 'Perusteet',
    shortcut: 'M',
    steps: [
      step(
        'Tartu valitun osan pisteeseen',
        'Korostus kertoo, mitä siirrät. Voit siirtää myös monivalintaa.',
      ),
      step(
        'Osoita siirtosuunta',
        'Siirto pysyy oletuksena yhdellä akselilla. X/Y/Z valitsee akselin.',
        'X',
      ),
      step(
        'Aseta kohteeseen',
        'Tartu kohteen kulmaan tai kirjoita siirtomatka ja hyväksy.',
        '150 → Enter',
      ),
    ],
    tip: 'Positiivinen mitta seuraa vedon suuntaa. Shift-napsautus muuttaa valintaa. Vapaa siirto löytyy Siirtotapa-valinnoista.',
  },
  {
    id: 'copy',
    title: 'Kopioi ja toista',
    category: 'Perusteet',
    steps: [
      step('Aloita siirto', 'Valitse osa tai ryhmä ja tartu siihen Siirrä-työkalulla.', 'M'),
      step(
        'Kytke kopiointi',
        'Napauta Ctrl kerran vedon aikana. Alkuperäinen jää paikalleen.',
        'Ctrl',
      ),
      step(
        'Hyväksy ja toista',
        'Aseta kopio. Toista-painike tai määrä tekee saman siirron uudelleen.',
      ),
    ],
    tip: 'Kosketuksella käytä Siirrä kopio -valintaa. Kopiot jakavat muodon; Tee uniikiksi irrottaa valitun kopion linkin.',
  },
  {
    id: 'scale',
    title: 'Skaalaa',
    category: 'Perusteet',
    shortcut: 'L',
    steps: [
      step(
        'Valitse osa tai kokonaisuus',
        'Valitse osat ja paina L. Kiintopiste pysyy paikallaan.',
        'L',
      ),
      step(
        'Muuta kokoa',
        'Vedä kulmakahvasta tasaisesti tai sivukahvasta yhdellä akselilla. Voit myös kirjoittaa kertoimen tai tavoitemitan.',
        '2 ×',
      ),
      step('Hyväksy', 'Vapauta veto tai paina Enter. Esc peruu esikatselun.', 'Enter'),
    ],
    tip: 'Paneelin X/Y/Z-painikkeilla voit yhdistellä akseleita: X ja Y muuttavat leveyttä ja syvyyttä, Z pois säilyttää korkeuden. Näppäin X/Y/Z valitsee yhden akselin. Reiät ja seinämät muuttuvat mukana. Linkitetyt kopiot jakavat uuden koon; Vain valitut tekee skaalattavista osista uniikkeja.',
  },
  {
    id: 'rotate',
    title: 'Kierrä',
    category: 'Perusteet',
    shortcut: 'R',
    steps: [
      step(
        'Valitse osa ja kiertopiste',
        'Poimi kiertopiste mallista tai käytä osan keskipistettä.',
      ),
      step('Vedä kiertorengasta', 'Kierto tarttuu 5° välein ja vahvemmin pääsuuntiin.', '45°'),
      step('Hyväksy', 'Vapauta veto tai kirjoita kulma ja paina Enter.', 'Enter'),
    ],
    tip: 'Ctrl-napautus kytkee kopioinnin päälle tai pois; alkuperäinen jää paikalleen. Shift vapauttaa kulmatartunnan. X/Y/Z vaihtaa akselin, jonka voi poimia myös suorasta reunasta.',
  },
  {
    id: 'fillet',
    title: 'Pyöristys',
    category: 'Muotoilu',
    shortcut: 'F',
    steps: [
      step(
        'Valitse Reunat → Pyöristys',
        'Napsauta reunat, joiden haluat pyöristyvän. Ne korostuvat.',
      ),
      step(
        'Säädä säde',
        'Vedä reunasta tai kirjoita säde. Kohtaavat reunat käsitellään yhdessä.',
        'R 10',
      ),
      step('Hyväksy käsittely', 'Enter tai vedon vapautus hyväksyy esikatselun.', 'Enter'),
    ],
    tip: 'Muodon nurkat valitsee profiilin kulmat. Puolipyöreäksi käyttää sopivalle profiilille puolta sen leveydestä. Virheellinen säde ei korvaa ehjää mallia.',
  },
  {
    id: 'chamfer',
    title: 'Viiste',
    category: 'Muotoilu',
    shortcut: 'F',
    steps: [
      step('Valitse Reunat → Viiste', 'Napsauta yksi tai useampi reuna.'),
      step(
        'Anna viisteen koko',
        'Mitta on etäisyys reunan kummallakin viereisellä pinnalla.',
        '3 mm',
      ),
      step('Hyväksy', 'Enter tai vedon vapautus hyväksyy viisteen.', 'Enter'),
    ],
    tip: 'Voit vaihtaa saman reunavalinnan viisteestä pyöristykseen. Uusi reunakäsittely säilyttää nykyisen muodon ja avaa sen muut reunat muokattaviksi. Poista käsittely palauttaa säilytetyn lähtömuodon.',
  },
  {
    id: 'erase',
    title: 'Kumita',
    category: 'Muotoilu',
    shortcut: 'U',
    steps: [
      step('Osoita jakoviivaa', 'Kumitettavan viivan viereiset tasopinnat korostuvat.'),
      step('Napsauta viivaa', 'Samassa tasossa olevat pinnat yhdistyvät.'),
      step('Jatka kumittamista', 'Työkalu pysyy aktiivisena. Esc päättää.', 'Esc'),
    ],
    tip: 'Kumitustyökalu poistaa myös apuviivoja. Se ei poista kappaleen varsinaista kulmaa tai aukon reunaa. Peru palauttaa toiminnon.',
  },
  {
    id: 'cut',
    title: 'Cut · Leikkaa',
    category: 'Muotoilu',
    shortcut: 'B',
    steps: [
      step('Valitse Kohteet', 'Poimi osat, joista poistetaan materiaalia.'),
      step(
        'Valitse Työstökappaleet',
        'Poimi kohteisiin osuvat leikkurit. Paksuuden pitää ulottua leikattavan alueen läpi.',
      ),
      step('Hyväksy Cut', 'Leikkurien tilavuus poistuu jokaisesta kohteesta.'),
    ],
    tip: 'Säilytä työstökappaleet jättää leikkurit malliin. Vaihda keskenään kääntää leikkaussuunnan.',
  },
  {
    id: 'join',
    title: 'Join · Yhdistä',
    category: 'Muotoilu',
    shortcut: 'B',
    steps: [
      step('Valitse Join', 'Avaa Muotoile ja vaihda toiminnoksi Join.'),
      step(
        'Valitse yhdistettävät osat',
        'Napsauta osat mallissa tai Yhdistettävät osat -listassa.',
      ),
      step('Hyväksy Join', 'Osat yhdistyvät yhdeksi muokattavaksi kappaleeksi.'),
    ],
    tip: 'Join yhdistää myös samalla tasolla olevat täytetyt muodot. Ryhmä tai kokoonpano säilyttää osat erillisinä. Peru palauttaa lähtöosat.',
  },
  {
    id: 'knife',
    title: 'Veitsi',
    category: 'Muotoilu',
    shortcut: 'N',
    steps: [
      step('Valitse leikattavat osat', 'Ilman valintaa käsitellään näkyvät muokattavat osat.'),
      step('Vedä leikkausviiva', 'Viilto kulkee nykyisen kameran näkymän läpi.'),
      step('Vapauta veto', 'Molemmat puolet säilyvät erillisinä osina.'),
    ],
    tip: 'Reitti voi olla myös taitettu, Bézier-kaari tai vapaa viilto. Enter viimeistelee pisteistä piirretyn reitin. Hold suojaa leikkaukselta.',
  },
  {
    id: 'guide',
    title: 'Apuviiva',
    category: 'Mittaaminen',
    shortcut: 'T',
    steps: [
      step('Tartu reunaan tai pisteeseen', 'Reunasta aloitettu apuviiva pysyy reunan suuntaisena.'),
      step('Vie viiva sivulle', 'Kirjoita haluttu etäisyys lähtöreunasta.', '100 mm'),
      step(
        'Hyväksy apuviiva',
        'Napsauta tai paina Enter. Muut työkalut tarttuvat viivaan ja risteyksiin.',
        'Enter',
      ),
    ],
    tip: 'X/Y/Z lukitsee siirtosuunnan. R käynnistää kierron 22,5° välein; Shift+R vapaasti. X-ray näyttää viivan myös osien läpi.',
  },
  {
    id: 'free',
    title: 'Vapaa mittaviiva',
    category: 'Mittaaminen',
    shortcut: 'T',
    steps: [
      step('Napsauta alkupistettä', 'Valitse Mittatyökalu → Vapaa mittaviiva.'),
      step(
        'Jatka pisteestä pisteeseen',
        'Pisteet ja viivat jäävät tartuntakohteiksi. Shift pitää suunnan ja poimii viitepituuden.',
        'Shift',
      ),
      step('Päätä ketju', 'Enter tai Esc katkaisee nykyisen mittaketjun.', 'Enter'),
    ],
    tip: 'R käynnistää hiirellä kierron 22,5° välein. Päällekkäiset saman suoran mittaosuudet yhdistyvät. Viivan päätä voi siirtää tuplaklikkaamalla.',
  },
  {
    id: 'dimension',
    title: 'Dimensio',
    category: 'Mittaaminen',
    shortcut: 'T',
    steps: [
      step('Napsauta ensimmäistä pistettä', 'Valitse Mittatyökalu → Dimensio.'),
      step('Napsauta toista pistettä', 'Mitta muodostuu pisteiden välille.'),
      step(
        'Sijoita mittaviiva sivulle',
        'Liikuta osoitinta ja napsauta. Myös Enter hyväksyy.',
        '600 mm',
      ),
    ],
    tip: 'X/Y/Z mittaa akselin suuntaan. Valitse-tilassa voit vetää mittatekstiä ja muokata tekstiä tuplaklikkauksella. H piilottaa valitun mitan.',
  },
  {
    id: 'area',
    title: 'Pinta-ala',
    category: 'Mittaaminen',
    shortcut: 'T',
    steps: [
      step('Piirrä ensimmäinen suorakulmio', 'Osoitettu lattia tai seinä määrää tason.'),
      step('Lisää suorakulmioita', 'Piirrä samalle tasolle niin monta aluetta kuin tarvitset.'),
      step(
        'Yhdistä alue',
        'Enter laskee yhteisen pinta-alan. Päällekkäisyys lasketaan vain kerran.',
        'Enter',
      ),
    ],
    tip: 'X/Y/Z vaihtaa keskeneräisen alueen tasoa. Pinta-alue on nimettävä ja piilotettava mittamerkintä; se ei muuta mallin geometriaa.',
  },
  {
    id: 'note',
    title: 'Huomautus',
    category: 'Mittaaminen',
    shortcut: 'T',
    steps: [
      step('Napsauta kohdepistettä', 'Valitse Mittatyökalu → Huomautus ja tartu mallin kohtaan.'),
      step('Sijoita tekstilaatikko', 'Napsauta laatikon paikka tai vedä se kohdepisteestä.'),
      step('Kirjoita teksti', 'Tekstikenttä avautuu heti. Enter tallentaa.', 'Enter'),
    ],
    tip: 'Valitse-tilassa voit vetää laatikkoa uudelleen. Kohdistusviivan saa pois valinnalla Näytä kohdistusviiva. Shift+Enter lisää tekstirivin.',
  },
  {
    id: 'paint',
    title: 'Maalaa',
    category: 'Pinnat',
    shortcut: 'P',
    steps: [
      step('Valitse materiaali', 'Valitse paletista pinta, väri ja kiilto.'),
      step('Napsauta maalattavaa osaa', 'Monivalinnassa Kohde kertoo, maalataanko koko valinta.'),
      step(
        'Jatka seuraavaan osaan',
        'Pensseli pysyy käytössä, kunnes vaihdat työkalua tai painat Esc.',
        'Esc',
      ),
    ],
    tip: 'Väri sävyttää myös tekstuuria. Valkoinen säilyttää tekstuurikuvan värit. Tarkista Myös linkitetyt kopiot / Vain maalattavat esiintymät.',
  },
  {
    id: 'texture',
    title: 'Tekstuurin asettelu',
    category: 'Pinnat',
    shortcut: 'P',
    steps: [
      step(
        'Valitse Tekstuurin asettelu',
        'Maalaustyökalun toinen välilehti. Napsauta teksturoitua osaa.',
      ),
      step(
        'Vedä kuviota tai kahvaa',
        'Pinnasta vetäminen siirtää kuviota. Kahvoista muutat kokoa ja kiertoa.',
      ),
      step('Vapauta veto', 'Muutos tallentuu. Työkalu pysyy aktiivisena seuraavaa osaa varten.'),
    ],
    tip: 'Suuntaa puunsyyt pituussuuntaan tekee kohdistuksen kerralla. Vaihtele tekstuuria antaa monivalinnan osille eri lähtökohdat.',
  },
  {
    id: 'loft',
    title: 'Muotojen läpi',
    category: 'Muotoilu',
    steps: [
      step('Piirrä lähtömuodot', 'Tee esimerkiksi kaksi erikokoista ympyrää eri korkeuksille.'),
      step(
        'Valitse profiilit järjestyksessä',
        'Avaa Muodot → Muotojen läpi. Valitse profiilit alhaalta ylöspäin.',
      ),
      step('Tarkista ja luo pinta', 'Esikatselu yhdistää muodot. Luo pinta hyväksyy.'),
    ],
    tip: 'Sivukäyrät-tila yhdistää vierekkäiset käyrät. Päätä kärkeen tekee kartion. Sulje päädyt tekee suljetuista profiileista umpinaisen osan.',
  },
  {
    id: 'opening',
    title: 'Leikkaa aukko',
    category: 'Muotoilu',
    steps: [
      step('Piirrä aukon muoto', 'Tee suorakulmio, ympyrä tai suljettu kynämuoto osan pinnalle.'),
      step('Valitse Leikkaa aukko', 'Toiminto löytyy myös jo hyväksytyn tasomuodon valinnasta.'),
      step(
        'Tarkista kohteet ja hyväksy',
        'Leikkaus poistaa muodon kohdalta materiaalia kohteiden läpi.',
      ),
    ],
    tip: 'Toisto → Ympyrä jakaa aukot kiertoakselin ympärille. Rajaa syvyys, jos vastapuoli pitää säilyttää. Cut sopii kolmiulotteisille leikkureille; Jaa pinta rajaa alueen poistamatta materiaalia.',
  },
  {
    id: 'section',
    title: 'Poikkileikkaus',
    category: 'Näkymät',
    steps: [
      step('Avaa Leikkaus', 'Näkymän yläpalkin leikkauspainike avaa asetukset.'),
      step('Aseta leikkaustaso', 'Valitse suunta ja siirrä taso tarkasteltavaan kohtaan.'),
      step(
        'Tarkastele sisärakennetta',
        'Leikkaus näyttää sisäpuolen muuttamatta osien geometriaa.',
      ),
    ],
    tip: 'Leikkaustason suuntaa ja paikkaa voi säätää. Poista leikkaus käytöstä nähdäksesi taas koko mallin.',
  },
  {
    id: 'cabinet',
    title: 'Levyrunko',
    category: 'Piirtäminen',
    steps: [
      step('Avaa Muodot → Levyrunko', 'Anna kaapin ulkomitat ja levyn paksuus.'),
      step('Valitse osat', 'Säädä pohja, katto, selkä, hyllyt ja ovet. Esikatselu päivittyy.'),
      step('Luo runko', 'Hyväksy: levyt syntyvät erillisiksi osiksi yhteiseen ryhmään.'),
    ],
    tip: 'Levyrunko soveltuu suorakulmaiselle kalusteelle. Osat säilyvät erikseen muokattavina ja näkyvät osaluettelossa.',
  },
  {
    id: 'reference',
    title: 'Pohjakuva',
    category: 'Näkymät',
    steps: [
      step(
        'Lisää pohja- tai julkisivukuva',
        'Avaa yläpalkin Pohjakuva ja valitse kuva omalta laitteeltasi.',
      ),
      step(
        'Kalibroi kahdella pisteellä',
        'Napsauta kuvasta tunnetun mitan päätepisteet ja kirjoita oikea pituus.',
        '2000 mm',
      ),
      step(
        'Mallinna kuvan päälle',
        'Kuva skaalautuu mallin millimetreihin. Valitse sen taso ja aloita piirtäminen.',
      ),
    ],
    tip: 'Voit säätää kuvan läpinäkyvyyttä, piilottaa sen tai lukita sen paikoilleen. Kuva toimii viitteenä, ei valmiina geometriana.',
  },
  {
    id: 'capture',
    title: 'Tallenna näkymä',
    category: 'Näkymät',
    steps: [
      step('Rajaa näkymä', 'Kierrä ja zoomaa malli haluttuun asentoon.'),
      step('Paina kamerakuvaketta', 'Tallenna näkymä PNG ottaa kuvan ilman käyttöliittymää.'),
      step('Kuva latautuu', 'Nykyinen näkymä ja näkyvät mittamerkinnät tulevat mukaan.'),
    ],
    tip: 'Piilota turhat merkinnät ennen kuvaa. Näkymän tallennus ei korvaa .nivo-projektin tallentamista.',
  },
] satisfies Guide[];
export type GuideId = (typeof toolGuides)[number]['id'];
export function guideForTool(
  tool: Tool,
  mode: {
    shape: string;
    pen: string;
    measure: MeasureMode;
    paint: string;
    detail: string;
    operation: string;
    loft?: boolean;
  },
): GuideId {
  if (mode.loft) return 'loft';
  if (tool === 'circle') return mode.shape;
  if (tool === 'pen') return mode.pen === 'bezier' ? 'bezier' : 'pen';
  if (tool === 'measure') return mode.measure;
  if (tool === 'paint') return mode.paint === 'texture' ? 'texture' : 'paint';
  if (tool === 'detail') return mode.detail;
  if (tool === 'boolean') return mode.operation;
  return tool;
}
