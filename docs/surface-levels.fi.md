# Pinnan korkeudet

Työkalu tekee liittyvät pinnat eri korkeuksille asetettujen sisäkkäisten
rajausten välille. Se sopii kaatolattioihin, kalteviin pintoihin ja muihin
vastaaviin muotoihin. Tavallinen Siirrä käsittelee edelleen koko osaa.

1. Piirrä paksuudettomat tasomuodot erillisiksi osiksi: ulkoraja, sen sisään
   pienempi rajaus ja tarvittaessa sisin ympyrä. Myös suljetut rakennusviivat käyvät.
2. Avaa **Muodot → Pinnan korkeudet** tai hae toimintoa nimellä/haulla _kaato_.
3. Valitse rajaukset ulkoa sisään napsauttamalla niitä mallissa tai mallilistassa.
   Myös paneelin **Lisää rajaus** toimii. Nuolilla voi muuttaa järjestystä.
4. Anna korkeudet. Lattiaesimerkissä ulkoraja on **0**, suihkualue **−10** ja
   kaivon kehä **−20 mm**. Korkeus mitataan ensimmäisen rajauksen piirtotasosta,
   ei jokaisen rajauksen omasta lähtökorkeudesta. Vaakatasossa plus on ylöspäin.
5. **Jätä sisin rajaus aukoksi** säilyttää kaivon avoimena. **Pohjan syvyys 60 mm**
   tekee tasaisen pohjan korkeuteen −60 mm. Arvo 0 tekee pelkän pinnan.
6. Tarkista esikatselu ja kaltevuudet, sitten **Luo pinta**. Esc tai toinen työkalu
   peruu esikatselun. Lähtömuodot säilyvät oletuksena piilotettuina.

Valitse valmis osa ja paina **Muokkaa pinnan korkeuksia** muuttaaksesi tasoja.
Peru/Palauta ja projektin tallennus säilyttävät reseptin. Rajauksien nurkkiin ja
suoriin reunoihin kiinnitetyt mittapisteet seuraavat korkeuden muutosta. Siirto, kierto,
tasaskaalaus sekä linkitettyjen kopioiden päivitys säilyttävät sen myös.
Cut/Join, reunatyöstöt, akselikohtainen skaalaus ja muut geometrian muutokset
viimeistelevät osan tavalliseksi CAD-kappaleeksi; Peru palauttaa reseptin.

[Valmis esimerkki](../public/examples/korkeuspinta.nivo): 2110 × 2750 mm lattia,
900 × 900 mm sisärajaus 100 mm etäisyydellä kahdesta ulkosivusta ja Ø100 mm kaivo
suihkualueen keskellä. Rajauksien korkeudet ovat 0 / −10 / −20 mm, pohja −60 mm.
Avaa tiedosto Nivossa, valitse lattia ja avaa korkeuksien muokkaus.

Rajauksien tulee olla suljettuja, tasomaisia, samansuuntaisia ja aidosti
sisäkkäisiä. Ne eivät voi koskettaa toisiaan. Nouseva ja tasainen vyöhyke
ovat sallittuja, ja ne merkitään paneeliin. Kaltevuudet ovat pinnan paikallisten
kaltevuuksien likimääräinen vaihteluväli, eivät rakennusmääräysten tarkastus
tai veden virtaussimulaatio. Pyöreä kaivo säilyy tarkkana CAD-ympyränä.

Ensimmäinen versio ei siirrä minkä tahansa olemassa olevan umpimuodon yksittäisiä
reunoja eikä muodosta usean kaivon valuma-alueita. Monimutkainen rajaus, jonka
siirtymäpinta kiertyy tai leikkaa itsensä, hylätään alkuperäistä muuttamatta.
