# danielkiss.hu

The source of my portfolio site.

**Live:** [danielkiss.hu](https://danielkiss.hu/) · **Hungarian:** [danielkiss.hu/hu/](https://danielkiss.hu/hu/)

One page, seven scenes, scrolled through: an opening frame that takes itself
apart into the sidebar you keep for the rest of the page, a skills panel, the
WPKoi work, a wall of certificates on an orbit, and a closing field you can
drag around. Two languages, built from one source.

## Built with

- **No framework.** Hand-written ES modules, one concern per file — about
  8,000 lines of JavaScript across 34 of them, and 12 stylesheets.
- **[Vite](https://vite.dev/) 8** for the dev server and the build.
- **[GSAP](https://gsap.com/) 3** — ScrollTrigger, ScrollSmoother, SplitText,
  Draggable and InertiaPlugin. The only runtime dependency.
- **WebGL, by hand.** The liquid reveal behind the opening frame is a
  double-FBO fluid solver written against the raw WebGL API — no 3D library.
  The portfolio's theme strip is a 2D canvas that paints and captions its own
  slides.
- **CSS as written**, no preprocessor and no utility framework. The whole page
  is sized off one root `font-size` that is a share of the viewport, so the
  wide composition scales rather than breaking into breakpoints; below a 4:3
  aspect ratio a portrait layout takes over.
- Self-hosted fonts, WebP imagery with explicit `srcset`/`sizes`, and the
  HTML comments stripped from the build by a small Vite plugin.

## Laid out like this

```
index.html            the English page — the only one edited by hand
hu/index.html         the Hungarian page — GENERATED, never edit
src/
  main.js             registers the plugins and starts everything, in order
  sections/           one module per scene: hero, skills, portfolio, wpkoi,
                      awards, transition, contact
  ui/                 the furniture: preloader, rulers, corner marks, the
                      sidebar's two faces, the mobile menu, the name's glitch
  webgl/              the fluid-sim reveal
  canvas/             the 2D gallery marquee
  utils/              viewport, layout mode, scroll frame, motion helpers
  styles/             one stylesheet per section, plus main.css
  i18n.js             the few strings the scripts write, at run time
tools/i18n/           the Hungarian page's generator and its language file
i18n/hu-texts.md      every text on the site with its translation, to read
public/               fonts, images, sitemap, robots
```

Most of the explanation lives in the code: the files carry long comments
about why a thing is shaped the way it is, which is usually more interesting
than what it does.

## Running it

Needs Node 20.19+ or 22.12+ (what Vite 8 asks for).

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | generates the Hungarian page, then serves the site at `localhost:5173` |
| `npm run build` | the same, then writes the deployable site to `dist/` |
| `npm run preview` | serves `dist/` as it will be served live |
| `npm run hu` | regenerates the Hungarian page on its own |

`dist/` is the whole site: static files, uploaded as they are.

## The two languages

English is the source. `index.html` is the only page edited by hand;
`hu/index.html` and `src/i18n-hu.js` are generated from it by
`tools/i18n/build-hu.mjs`, which puts in the translations from
`tools/i18n/hu.json`. It runs by itself before `dev` and `build`.

So a Hungarian text is changed in `hu.json`, never in `hu/index.html`. An
English text changed in `index.html` needs its row in `hu.json` updated too —
the generator prints every row whose English it can no longer find.
`tools/i18n/README.md` has the details.

---

© Daniel Kiss. The code is here to be read; it is not licensed for reuse.
