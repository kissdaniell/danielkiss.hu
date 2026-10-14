# danielkiss.hu — magyar szövegek (átnézésre)

Az oldalon szereplő **összes** olvasható szöveg, a képernyőolvasóknak szóló rejtett
feliratokkal és `aria-label`-ekkel együtt. A sorszámok az `index.html` sorai, a
`JS` jelölésűek a JavaScriptből kerülnek a DOM-ba.

A fordítások igyekeznek a hosszt is tartani: a tipográfia nagy része Anton
poszterbetű, ahol egy-két karakternyi eltérés is látszik a tördelésen.

> **Ez a táblázat olvasásra van.** A build nem ezt olvassa, hanem a
> `tools/i18n/hu.json`-t — ott kell átírni egy fordítást, aztán `npm run hu`.
> A működésről a `tools/i18n/README.md` szól.

---

## Előbb ezt a négyet érdemes eldönteni

| # | Kérdés | Javaslatom |
|---|---|---|
| 1 | **Névsorrend.** A logó, a hero és a preloader két külön szóként animálja: `Daniel` (világos) + `Kiss` (piros). | **Eldöntve:** magyarul `Kiss` (piros) + `Dániel` (világos) — a sorrend magyaros, a piros pedig a `Kiss`-en marad, ahogy angolul is. |
| 2 | **„Theme" vs „Template".** Az oldalon mindkettő szerepel, és külön jelentésük van. | `Theme` → **téma** (WordPress), `Template` → **sablon** (Elementor). Így a két statisztika sem mosódik össze. Alternatíva: a téma helyett végig „sablon", de akkor az Elementor-soron más kell. |
| 3 | **Menüpontok.** Az `Introduce` magyarul hosszú lenne (`Bemutatkozás`). | `Rólam` — rövid, és a többi menüponttal (Tudás / Munkák / Díjak / Kapcsolat) egy ritmusban van. A `Bemutatkozás` is belefér, csak szélesebb. |
| 4 | **Angolul hagyott szakszavak.** `WebGL`, `Motion`, `UI / UX`, `Performance`… | A technológianeveket meghagynám (GSAP, WebGL, Three.js…), a köznyelvi szakszavakat lefordítanám (Motion → Animáció, Performance → Teljesítmény). A táblázatban mindkettőt jelzem. |

---

## A. Fejléc, SEO, megosztás

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 2 | `<html lang>` | `en` | `hu` | technikai |
| 7 | `<title>` | Daniel Kiss - Frontend Developer \| Creative Web Development \| JavaScript, WordPress, GSAP, Three.js | Kiss Dániel – Frontend Fejlesztő \| Kreatív Webfejlesztés \| JavaScript, WordPress, GSAP, Three.js | |
| 8 | meta description | Daniel Kiss is a frontend developer crafting animation-driven web experiences with JavaScript, GSAP, Three.js and WordPress. View selected work, skills and awards. | Kiss Dániel frontend fejlesztő, animációvezérelt webes élményeket épít JavaScripttel, GSAP-pel, Three.js-szel és WordPresszel. Nézd meg a munkáit, tudását és díjait. | 164 vs 160 karakter |
| 12 | meta author | Daniel Kiss | Kiss Dániel | lásd 1. döntés |
| 18 | og:title | Daniel Kiss - Frontend Developer \| Creative Web Development | Kiss Dániel – Frontend Fejlesztő \| Kreatív Webfejlesztés | |
| 19 | og:description | Frontend developer crafting animation-driven web experiences with JavaScript, GSAP, Three.js and WordPress. | Frontend fejlesztő, aki animációvezérelt webes élményeket épít JavaScripttel, GSAP-pel, Three.js-szel és WordPresszel. | |
| 24 | og:site_name | Daniel Kiss | Kiss Dániel | |
| 31 | og:image:alt | Daniel Kiss, frontend developer | Kiss Dániel, frontend fejlesztő | |
| 32 | og:locale | en_US | hu_HU | technikai |
| 36 | twitter:title | Daniel Kiss - Frontend Developer \| Creative Web Development | Kiss Dániel – Frontend Fejlesztő \| Kreatív Webfejlesztés | |
| 37 | twitter:description | *(azonos az og:description-nel)* | *(azonos)* | |
| 42 | twitter:image:alt | Daniel Kiss, frontend developer | Kiss Dániel, frontend fejlesztő | |
| 110 | JSON-LD `jobTitle` | Frontend Developer | Frontend fejlesztő | strukturált adat |
| 113 | JSON-LD `description` | Frontend developer crafting animation-driven web experiences with JavaScript, GSAP, WebGL and WordPress. | Frontend fejlesztő, aki animációvezérelt webes élményeket épít JavaScripttel, GSAP-pel, WebGL-lel és WordPresszel. | |

## B. Betöltő képernyő, vonalzó, fix adatsor

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 137 | preloader `aria-label` | Loading | Betöltés | |
| 141 | preloader név | Daniel Kiss | Kiss Dániel | betűnként animálva |
| 157 | számláló | `000` | — | szám, marad |
| 164–165 | vonalzó kurzor | ▲ | — | jel, marad |
| 169 | fix adatsor | `x:0000` `y:0000` `p:001%` | — | marad |
| 169 | fix adatsor, szekciónév | `s:Introduce` | `s:Rólam` | induláskor ez áll a lapon, utána a menüpont nevéből írja át a szkript |

## C. Felső sáv és mobilmenü

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 237 / 302 | tagline (felül + oldalsávban) | CODE / MOTION / | KÓD / MOZGÁS / | 2 helyen ugyanaz |
| 238–241 / 303–306 | váltakozó szó 1 | WEBGL | WEBGL | marad |
| | váltakozó szó 2 | WEIRD | FURA | |
| | váltakozó szó 3 | CHAOS | KÁOSZ | |
| | váltakozó szó 4 | UNUSUAL | SZOKATLAN | 2 karakterrel hosszabb |
| 244 | menügomb `aria-label` | Open menu | Menü megnyitása | |
| JS | menügomb `aria-label` (nyitva) | Close menu | Menü bezárása | `ui/mobileMenu.js` |
| 245 | menügomb felirat | MENU | MENÜ | |
| JS | menügomb felirat (nyitva) | CLOSE | BEZÁR | `ui/mobileMenu.js`, 5 karakter mindkettő |

## D. Oldalsáv

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 259 | rejtett `<h1>` | Daniel Kiss — Frontend Developer | Kiss Dániel — Frontend Fejlesztő | |
| 270 / 538 | név (oldalsáv + hero) | Daniel \| Kiss | Kiss \| Dániel | a piros mindkét nyelven a `Kiss`-en van, így magyarul az első szóra kerül |
| 288 / 534 | kézírásos jel 1 | I MAKE THE WEB MISBEHAVE | FORGASSUK FEL A NETET | pontosan 24 karakter mindkettő |
| 293 / 552 | kézírásos jel 2 | KEEP DIGGING | ÁSS LEJJEBB | alt: `KUTASS TOVÁBB` |
| 315 | stack-felirat | INDEX - PORTFOLIO / 2026 | INDEX - PORTFÓLIÓ / 2026 | az évszám nem fordítandó: a `ui/stackYear.js` írja be az aktuális évet, a lapon álló szám csak tartalék |
| 319–334 | közösségi linkek `aria-label` | LinkedIn / WordPress / Behance / Dribbble / Pinterest | — | márkanevek, maradnak |
| 345 | bio 1. sor | Frontend Developer \| WordPress Developer | Frontend Fejlesztő \| WordPress Fejlesztő | |
| 345 | bio 2. sor | JavaScript, PHP, WebGL, GSAP, Three.js | — | marad |
| 351 | helyzet 1 | Based in Hungary | Magyarországon élek | |
| 355 | helyzet 2 | Working Worldwide | Világszerte dolgozom | a kettő párba van állítva |
| 374–375 | saját oldalak | WPKoi / Wwwows | — | márkanevek, maradnak |
| 381 | `<nav> aria-label` | Primary | Fő navigáció | |
| 382 | menü 01 | Introduce | Rólam | alt: `Bemutatkozás` |
| 383 | menü 02 | Skills | Készségek | alt: `Szaktudás` |
| 384 | menü 03 | Works | Munkák | |
| 385 | menü 04 | Awards | Díjak | |
| 386 | menü 05 | Contact | Kapcsolat | |
| 387 | menü – nyelvváltó | HU | EN | **új elem**: az angol lapon `HU` és a `/hu/`-ra visz, a magyaron `EN` és a `/`-ra; keretes dobozként, szám nélkül |
| 397 | portréfotó `alt` | Daniel Kiss | Kiss Dániel | |
| 428 | fotó felirata | Portrait / 01 | Portré / 01 | |
| 449 | jelvény 1 | 14+ YEARS / WEB | 14+ ÉV / WEB | |
| 450 | jelvény 2 | USED WORLDWIDE | Világszerte használják | a piros a 2. szón marad |
| 465 | e-mail gomb | info@danielkiss.hu | — | marad |
| 470 | másolás-visszajelzés | Copied | Másolva | |

## E. Hero — a nyitó panel

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 480 | főcím 1. sor | Make It Work, | Előbb Működjön, | |
| 482 | főcím 2. sor (piros) | Then Make It Weird… | Aztán rúgjunk bele… | 20 vs 19 karakter |
| 488 | alcím | Themes on wordpress.org since 2015 — the source is public. | Témák a wordpress.org-on 2015 óta — a forráskód nyilvános. | |
| 492–495 | statisztika 1 | 14+ / Years / Web | 14+ / Év / Web | |
| 500–503 | statisztika 2 | 500+ / Templates / Elementor | 500+ / Sablon / Elementor | lásd 2. döntés |
| 507–510 | statisztika 3 | 200+ / Themes / WordPress | 200+ / Téma / WordPress | |
| 545–547 | hero közösségi linkek | LinkedIn / WordPress / Behance | — | maradnak |

## F. Skills szekció

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 562 | kategória 01 címe | Creative & Motion | Kreativitás & animáció | alt: `Kreatív & Motion` |
| 565–570 | 01 címkéi | GSAP, Three.js, WebGL, **Motion**, HTML, CSS | GSAP, Three.js, WebGL, **Animáció**, HTML, CSS | csak a Motion változik |
| 577 | kategória 02 címe | WordPress Development | WordPress Fejlesztés | |
| 580–585 | 02 címkéi | WordPress, **Themes**, **Plugins**, Elementor, Gutenberg, WooCommerce | WordPress, **Témák**, **Bővítmények**, Elementor, Gutenberg, WooCommerce | |
| 592 | kategória 03 címe | Web Development | Webfejlesztés | |
| 595–600 | 03 címkéi | PHP, Javascript, NPM, **Performance**, **Responsive Design**, **Accessibility** | PHP, Javascript, NPM, **Teljesítmény**, **Reszponzív design**, **Akadálymentesség** | az Akadálymentesség hosszú — ha szétesik a sor, maradhat `A11y` |
| 606 | kézírásos jegyzet | This is the fun part! | Na, ez a jó rész! | alt: `Ez a jó rész!` |
| 611 | kategória 04 címe | Design & Product | Design & Termék | |
| 614–617 | 04 címkéi | UI / UX, **Web Design**, **Motion**, **Product Development** | UI / UX, **Webdesign**, **Animáció**, **Termékfejlesztés** | |

## G. Portfólió

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 626 | főcím 1. sor | Made Some. | Csináltam Párat. | alt: `Építettem.` |
| 628 | főcím 2. sor (piros) | Broke Some… | Hibáztam Párat… | a szójáték az ismétlésen áll |
| 643 | rejtett galérianav `aria-label` | Themes in the gallery | Témák a galériában | |
| JS | rejtett galérialinkek | `{Név} — WordPress theme demo` | `{Név} — WordPress téma demó` | `sections/portfolio.js`, 10 db |
| 654 | alcím 1. sor | And somehow, | És valahogy, | |
| 656 | alcím 2. sor (piros) | 1M+ downloads | 1M+ letöltés | |
| 662 | állítás | Designed. Coded. Shipped. By me. | Design. Kód. Kiadás. Egyedül. | alt: `Terveztem. Kódoltam. Kiadtam. Egyedül.` |
| 666 | graffiti | WPKOI | — | márkanév |
| 672–674 | tapasztalat-sor | Experience / 2012 → Now | Tapasztalat / 2012 → Most | |
| 683 | márkanév | WPKoi | — | marad |
| 690 | márka alcíme | This one got serious. | Ez komolyra fordult. | |
| 691 | márka jegyzete | Built solo. Used worldwide. | Egyedül épült. Világszerte fut. | alt: `Egyedül építve. Világszerte használják.` |
| 698–699 | statisztika 1 | Founded / Aug 2018 | Alapítva / 2018. aug. | |
| 708–709 | statisztika 2 | Customers / Worldwide | Ügyfelek / Világszerte | |
| 717–718 | statisztika 3 | Built for / WordPress | Készült / WordPressre | |
| 723 | jelölés | Showcase | Bemutató | alt: `Válogatás` |

## H. WPKoi szekció

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 730 | szekció `aria-label` | WPKoi — selected screens from the site | WPKoi — válogatott képernyők az oldalról | |
| 734–737 | fejléc-sor | WPKoi / 2018 → Now | WPKoi / 2018 → Most | |
| 746 | cím 1. sor | It Took | Ráment | 7 karakter mindkettő |
| 747 | cím 2. sor (piros) | My Time. | Az életem. | |
| 755 | gomb | Enter WPKoi | Irány a WPKoi | alt: `Belépés a WPKoi-ba` |
| 773–775 | számláló | 01 / 05 | — | marad |
| 779 | görgetés-jelzés | Scroll | Görgess | |
| 787 | kép 1 `alt` | WPKoi home page — WebGL hero with the theme wall behind it | A WPKoi főoldala — WebGL hero, mögötte a témafal | |
| 809 | kép 2 `alt` | WPKoi themes catalog — Martanda, Lalita, Prakata and more | WPKoi témakatalógus — Martanda, Lalita, Prakata és a többi | |
| 834 | videó 1 rejtett felirat | — WPKoi site in motion | — a WPKoi oldal mozgásban | |
| 838 | kép 3 `alt` | WPKoi themes browsed by color category | WPKoi témák színkategória szerint böngészve | |
| 863 | videó 2 rejtett felirat | — WPKoi site interactions | — a WPKoi oldal interakciói | |
| 873–875 | idővonal 1 | 2022 → Now / wwwows.com / WordPress Block Theme Developer | 2022 → Most / wwwows.com / WordPress block téma fejlesztő | |
| 878–880 | idővonal 2 | 2015 → 2017 / Webzakt / WordPress Theme Developer | 2015 → 2017 / Webzakt / WordPress téma fejlesztő | |
| 883–885 | idővonal 3 | 2012 → 2019 / Freelance Works / Web Development & Client Projects | 2012 → 2019 / Szabadúszó munkák / Webfejlesztés & ügyfélprojektek | |
| 888–890 | idővonal 4 | 2009 → 2012 / Filmmaker / Video Editing | 2009 → 2012 / Filmkészítő / Videóvágás | |
| 900 | gomb | View Full Experience | Teljes Tapasztalat | alt: `Teljes Szakmai Út` — LinkedIn-re visz |

## I. Díjak

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 936 | főcím 1. sor | I Wanted To Know | Kíváncsi voltam, | |
| 938 | főcím 2. sor (piros) | How Far… | Mit érek… | |
| 946 | kézírásos alcím | Worth the try | Megérte megpróbálni | alt: `Megérte` |
| 952 | lista címe | Selected Recognitions | Válogatott Elismerések | |
| 959 | lista `aria-label` | Awards and nominations | Díjak és jelölések | |
| 960–1021 | a 11 díj neve | Awwwards Honorable Mention (danielkiss.hu) … CSS Nectar SOTD (WPKoi) | — | a díjak hivatalos nevei, maradnak; a stíluslap két oszlopba töri őket (6 + 5), portré módban egybe |
| 1024 | oklevél 1 `aria-label` | Awwwards — Honorable Mention, danielkiss.hu | *(marad)* | a díj saját neve |
| 1051 | oklevél 2 `aria-label` | CSS Design Awards — Special Kudos for WPKoi WordPress Themes | CSS Design Awards — Special Kudos a WPKoi WordPress témákért | |
| 1078 | oklevél 3 `aria-label` | CSS Design Awards — Innovation Public Award for WPKoi WordPress Themes | CSS Design Awards — Innovation Public Award a WPKoi WordPress témákért | |
| 1105 | oklevél 4 `aria-label` | CSS Design Awards — UI Public Award for WPKoi WordPress Themes | CSS Design Awards — UI Public Award a WPKoi WordPress témákért | |
| 1132 | oklevél 5 `aria-label` | CSS Design Awards — UX Public Award for WPKoi WordPress Themes | CSS Design Awards — UX Public Award a WPKoi WordPress témákért | |
| 1159 | oklevél 6 `aria-label` | CSSWinner — Site of the Day, danielkiss.hu | CSSWinner — A nap oldala, danielkiss.hu | |
| 1187 | oklevél 7 `aria-label` | CSSWinner — Star, tiralechat.hu | *(marad)* | a díj saját neve |
| 1214 | oklevél 8 `aria-label` | Design Nominees — Site of the Day, danielkiss.hu | Design Nominees — A nap oldala, danielkiss.hu | |
| 1241 | oklevél 9 `aria-label` | Design Nominees — Theme of the Day for the Hrasva WordPress theme | Design Nominees — A nap témája, Hrasva WordPress téma | |
| 1268 | oklevél 10 `aria-label` | Design Nominees — Theme of the Day for the Lovebird WordPress theme | Design Nominees — A nap témája, Lovebird WordPress téma | |
| 1295 | oklevél 11 `aria-label` | CSS Nectar — Site of the Day, WPKoi WordPress Themes | CSS Nectar — A nap oldala, WPKoi WordPress témák | |
| 1319 | kézírásos jelvény | Awards | Díjak | |

## J. Átvezető

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 1237 | 1. sor | So… Would You Make | Na... Összerakunk | |
| 1238 | 2. sor (piros) | Something Weird Together? | Valami szokatlant együtt? | 22 vs 25 karakter |

## K. Kapcsolat

| Sor | Hol | Angol | Magyar | Megjegyzés |
|---|---|---|---|---|
| 1246 | főcím 1. sor (piros) | Bug Me | Zaklass | a „bug" szójáték magyarul nem jön át; a `Zaklass` tartja a hangnemet |
| 1251 | főcím 2. sor | With Your Idea | Az ötleteddel | alt a párosra: `Dobj Rám` / `Egy Ötletet` |
| 1260 | e-mail gomb | info@danielkiss.hu | — | marad |
| 1261 | másolás-visszajelzés | Copied | Másolva | |
| 1263 | elérhetőség | Available for selected projects | Válogatott projektekre elérhető | |
| 1268 | kézírásos jel | Drag me | Ragadd meg | alt: `Húzz meg` |
| 1276 | gomb | Scroll to top | Vissza a tetejére | |

---

## Amit nem kell fordítani

- **Márka- és terméknevek:** Daniel Kiss / Kiss Dániel, WPKoi, Wwwows, Webzakt, LinkedIn, WordPress, Behance, Dribbble, Pinterest, Elementor, Gutenberg, WooCommerce.
- **A 10 WPKoi téma neve** a galériában (Kalpita, Hrasva, Madhura, Pluta, Prakata, Tripti, Sugupta, Kripa, Ekantika, Kamana) — `src/utils/galleryImages.js`.
- **Technológianevek:** GSAP, Three.js, WebGL, JavaScript, PHP, NPM, HTML, CSS, UI / UX.
- **Díjnevek és rövidítéseik:** CSSDA, CSSWinner, CSS Nectar, Design Nominees, SOTD, TOTD.
- **Számok, dátumok, számlálók,** az e-mail cím és a nyíl/háromszög jelek.

## Ami a technikai részből elkészült

A magyar oldal a `danielkiss.hu/hu/` címre épül, a `tools/i18n/build-hu.mjs`
generálja az `index.html`-ből. Ezek mind benne vannak:

1. `<html lang="hu">`, `og:locale` → `hu_HU`.
2. `hreflang` hármas (`en`, `hu`, `x-default`) **mindkét** lapon, és
   mindkettőnek saját `canonical`je és `og:url`-je.
3. A `sitemap.xml` mindkét URL-t felsorolja, a `hreflang` párokkal.
4. A JSON-LD-ben a `description`, a `jobTitle`, a `name` és az `url` a magyar
   lapon magyar, illetve a magyar URL-re mutat; a `sameAs` változatlan.
5. A `Témák a wordpress.org-on…` sor linkje marad az angol profilra.
