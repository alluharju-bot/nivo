# 3D Design

Selaimessa toimiva avoimen lähdekoodin 3D-suunnitteluohjelma kalusteiden,
rakennusosien ja tilojen mallintamiseen sekä mittakuvien tuottamiseen.

**Ideasta mitoitettuun malliin ja esitettävään kuvaan mahdollisimman vähillä työvaiheilla.**

## Projektin tila

Projektin nimi valitaan ennen toteutuksen aloittamista. Tämä repository sisältää
toistaiseksi alkuperäisen vaatimusmäärittelyn. Sovellusta ei vielä voi käynnistää.

## Ensimmäinen toteutuskokonaisuus

1. Varmista CAD-ytimen toiminta selaimessa ja Web Workerissa, tarkat
   geometriaoperaatiot, tallennus ja teknisen piirustuksen toteutustapa.
2. Toteuta kokonainen työnkulku: uusi projekti → mittatarkka suorakulmio →
   push/pull → valinta ja siirto tartunnoilla → etukuva ja mitoitus → SVG-vienti.
3. Huolehdi alusta lähtien kosketuskäytöstä, undo/redo-toiminnoista,
   automaattitallennuksesta sekä projektitiedoston tuonnista ja viennistä.

Tarkka geometria, renderöintiverkko ja projektin tietomalli pidetään erillään.
Mahdolliset TypeScript-, Three.js- ja OpenCascade.js/Replicad-riippuvuudet
arvioidaan ennen teknisiä valintoja.

## Määrittely

[Alkuperäinen suomenkielinen vaatimusmäärittely](docs/requirements.fi.md)
on muunnettu tiedostosta `Prompt 3d ohjelmalle.rtf`.

Määrittely sisältää vaiheet 0–7 sekä kaapin, työtason ja seinärakenteen
hyväksymisesimerkit. Ensimmäinen toteutus keskittyy vaiheisiin 0–1.
