// The WPKoi themes behind the photography, in one place: the portfolio
// marquee paints them onto a canvas (captioned and linked), the contact field
// tiles the same shots across a draggable grid. Order is the order they run in
// the strip, and the number each one is captioned with is its position here —
// so reordering this list reorders both consumers and their numbering at once.
//
// The `-300` sources are the small square exports: the marquee draws each
// slide at roughly 180–250 CSS px and the contact field at ~208, so anything
// larger was being downloaded at several times the size it is ever painted.
const THEMES = [
  { name: 'Kalpita', href: 'https://wpkoi.com/demos/kalpita-premium/' },
  { name: 'Hrasva', href: 'https://wpkoi.com/demos/hrasva-premium/' },
  { name: 'Madhura', href: 'https://wpkoi.com/demos3/madhura-premium/' },
  { name: 'Pluta', href: 'https://wpkoi.com/demos2/pluta-premium/' },
  { name: 'Prakata', href: 'https://wpkoi.com/demos/prakata-premium/' },
  { name: 'Tripti', href: 'https://wpkoi.com/demos2/tripti-premium/' },
  { name: 'Sugupta', href: 'https://wpkoi.com/demos/sugupta-premium/' },
  { name: 'Kripa', href: 'https://wpkoi.com/demos/kripa-premium/' },
  { name: 'Ekantika', href: 'https://wpkoi.com/demos/ekantika-premium/' },
  { name: 'Kamana', href: 'https://wpkoi.com/demos2/kamana-premium/' },
];

// The three exported widths, smallest first. Both DOM consumers paint these
// at about 95 CSS px — the opening plate's fan of cards and the closing
// field's tiles — so 300 was between three and nine times the pixels either
// of them could show, on eight files that land during the opening frame.
//
// 190 is here for the 2x case specifically: with only 95 and 300 to choose
// from, every screen denser than 1x jumps straight back to 300 and the small
// export never gets used by the devices that actually load this page.
const WIDTHS = [95, 190, 300];

const srcsetFor = (n) => WIDTHS.map((w) => `/img/gallery/${n}-${w}.webp ${w}w`).join(', ');

export const GALLERY_ITEMS = THEMES.map((theme, i) => ({
  ...theme,
  // The canvas marquee samples this one directly and does its own scaling, so
  // it stays a single URL: 300 is the right source to draw from.
  src: `/img/gallery/${i + 1}-300.webp`,
  // ...and this is for the two consumers that put a real <img> in the DOM.
  srcset: srcsetFor(i + 1),
  // Two digits, so the captions all measure the same and the strip doesn't
  // visibly reflow as it cycles past 09.
  label: `${theme.name} / ${String(i + 1).padStart(2, '0')}`,
}));

export const GALLERY_IMAGES = GALLERY_ITEMS.map((item) => item.src);

// Keyed by the same URL GALLERY_IMAGES hands out, so a consumer that already
// has a src can attach the matching srcset without re-deriving the index.
export const GALLERY_SRCSET = new Map(GALLERY_ITEMS.map((item) => [item.src, item.srcset]));

export const GALLERY_IMAGE_COUNT = GALLERY_ITEMS.length;
