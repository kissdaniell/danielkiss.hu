# A magyar oldal

`index.html` az **angol** oldal, és ez az egyetlen, amit kézzel szerkesztünk.
A `hu/index.html` és a `src/i18n-hu.js` **generált** fájlok: `build-hu.mjs`
készíti őket belőle, a `hu.json` fordításaival. Magától lefut az
`npm run dev` és az `npm run build` előtt (külön: `npm run hu`).

- **Egy fordítás változik:** a `hu.json` megfelelő sorának `hu` mezőjét kell
  átírni, majd `npm run hu`.
- **Az angol oldalon változik vagy új szöveg kerül bele:** a `hu.json`-ba is
  kell hozzá sor (az `en` mező pontosan az legyen, ami a lapon áll, sortörés
  `\n`-nel). A `build-hu.mjs` kiírja minden olyan sor angol szövegét, amit már
  nem talál meg — a sor nélküli szöveg egyszerűen angolul marad a magyar
  oldalon is.
- **Mindkét oszlop úgy van írva, ahogy a markupban áll**, az entitásokkal
  együtt (`&hellip;`, `&mdash;`, `&amp;`). Ami a `hu` mezőben van, az szó
  szerint kerül a lapra.
- **Ugyanaz a szöveg máshol mást jelent:** ilyenkor a szűkebb helyre külön sor
  jön, `in` mezővel (`tag.class`), és az fut előbb. Jelenleg kettő ilyen van: a
  „Themes" a hero statisztikájában „Téma", a készségek címkéi közt „Témák"; a
  „WordPress" a portfólió statisztikájában „WordPressre", máshol marad.
- **A név** (`"source": "name"`) a kivétel, amit nem lehet szavanként
  cserélni: két `<span>`-ben áll, és magyarul megfordul a sorrendje, úgyhogy a
  script egy menetben cseréli mindkettőt. Hogy melyik szó a piros, azt a sor
  `accent` mezője mondja meg (`"accent": "Kiss"`) — a szín a szóhoz tartozik,
  nem a helyéhez, úgyhogy mindkét nyelven a Kiss piros, akkor is, ha magyarul
  az áll elöl. Ha nincs `accent`, a második szó kapja, mint angolul.
- **A szkriptek szövegei** a `src/i18n.js` `t()` függvényén mennek át; ezek a
  `hu.json`-ban azok a sorok, amiknek a `source`-ában `.js` van. Belőlük
  készül a `src/i18n-hu.js` szótára.
- **Az oldalszintű dolgok** (`lang`, canonical, `og:url`, `og:locale`, a
  JSON-LD `url`-je és a menü nyelvváltója) a `build-hu.mjs` végén, a `must()`
  hívásokban állnak. Ha ezek közül valamelyik nem található meg az
  `index.html`-ben, a build hibával leáll — egy olyan magyar oldal, ami
  csendben az angol canonicalt viszi tovább, rosszabb, mint egy elszállt
  build.

A `/i18n/hu-texts.md` a szövegek olvasható, szekciónkénti táblázata —
átnézésre és egyeztetésre. A build nem azt olvassa, hanem a `hu.json`-t.
