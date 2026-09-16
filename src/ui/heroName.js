import { gsap } from 'gsap';

import { onViewportResize, requestViewportPass } from '../utils/viewport.js';
import { debugOff } from '../utils/debug.js';

// The name in the sidebar: sizing, the ink metrics the portrait lines up
// against, and the glitch.
//
// This replaces a WebGL plane (a three.js module, since removed along with
// the dependency) that drew the same name into a canvas texture and ran a
// fragment shader over it. The shader
// looked right, but it sampled the texture three dozen times per fragment
// across the whole plane, thirty times a second, for the life of the page —
// and it did it while sitting inside the one element the hero transition
// scales from four times its size down to one. That put the most expensive
// thing on the page directly underneath the smoothest thing on the page.
//
// What it bought was a faint aura and four kinds of rare, local, brief
// glitch. All four are geometry, not pixel maths, so the DOM can do them:
// the aura is a text-shadow, and each glitch is a copy of the line clipped to
// a small rectangle. Nothing is painted while nothing is happening.

// The name, as two runs of ink. Kept here only to be measured — the words
// themselves live in the markup.
const RUN = 'DANIEL KISS';

// If the ink metrics can't be measured, these are the fractions the canvas
// version published (24px of padding above and below 268px of letterform, in
// a 316px box). heroTransition.js reads them off the dataset to sit the
// portrait exactly between the name's cap line and its baseline.
const FALLBACK_INK = { top: 0.076, bottom: 0.924 };

// How often something happens, in seconds. The shader's four effects ran on
// four separate clocks at 2.7-5.1 ticks a second with a 4-10% chance each,
// which works out at roughly one event a second across all of them.
const GAP = [0.7, 2.4];
// How long one lasts. Stepped on and off with no easing, matching the
// steps(1, jump-end) language the underlines elsewhere on the page glitch in.
const HOLD = [0.08, 0.26];

const rand = (min, max) => min + Math.random() * (max - min);

// A short horizontal window, a couple of letters wide, somewhere across the
// line — the DOM version of the shader's withinSpan(). Returned as left/right
// percentages of the line's own width.
function span(halfMin = 4, halfMax = 12) {
  const half = rand(halfMin, halfMax);
  const centre = rand(0, 100);
  return [Math.max(0, centre - half), Math.min(100, centre + half)];
}

// The whole line minus one rectangle — what the base layer wears while a
// torn piece of it is being drawn somewhere else by the ghost.
//
// A rectangle cut out of the middle of a shape needs two contours, which
// clip-path: polygon() cannot express. It doesn't have to here: a tear always
// takes either the top half or the bottom half of the line, so the missing
// rectangle always reaches one edge and the remainder is a single notched
// outline that a polygon traces in one pass.
function notch(x0, x1, y0, y1) {
  const p = y0 === 0
    // Bitten out of the top edge.
    ? [[0, 0], [x0, 0], [x0, y1], [x1, y1], [x1, 0], [100, 0], [100, 100], [0, 100]]
    // Bitten out of the bottom edge.
    : [[0, 0], [100, 0], [100, 100], [x1, 100], [x1, y0], [x0, y0], [x0, 100], [0, 100]];
  return `polygon(${p.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;
}

export function initHeroName() {
  const container = document.querySelector('.sidebar-name');
  const text = container ? container.querySelector('.sidebar-name-text') : null;
  const base = text ? text.querySelector('.sidebar-name-line') : null;
  if (!container || !text || !base) return;

  // Two hidden copies of the line, cloned rather than written out in the
  // markup: they carry no meaning, and three identical copies of the name in
  // the document is three things to keep in step by hand.
  //
  // `tear` is the one that moves — it also does the soft patch, which is the
  // same clip with no displacement and a blur. `flash` is the one that
  // brightens, either solid or through a scanline mask.
  const tear = base.cloneNode(true);
  tear.classList.add('sidebar-name-ghost');
  const flash = base.cloneNode(true);
  flash.classList.add('sidebar-name-ghost', 'sidebar-name-ghost--flash');
  text.append(tear, flash);

  // ---- Fit.
  //
  // The name spans the sidebar's content width exactly, the way the canvas
  // did by being `width: 100%`. Type can't be told to do that, so it is
  // measured: reset to the authored rem size, read what the run naturally
  // comes to, and scale the size by the ratio. Measured rather than tuned to
  // a constant because the answer depends on the display face's own metrics —
  // a hardcoded rem value would be right for Anton and wrong for whatever
  // steps in when Anton hasn't arrived.
  // Both widths are read the same way on purpose. heroTransition.js scales
  // this element's ancestor by around four for the opening frame, so a
  // getBoundingClientRect() here reports the *scaled* width while clientWidth
  // reports the laid-out one; taking one of each got a ratio of the scale
  // factor rather than of the two widths, and shrank the name to a fifth of
  // its size the moment the page was reloaded anywhere but the very top.
  // Measured as two rects the scale is in both terms and divides straight
  // back out, whatever the transition happens to be doing at the time.
  function fit() {
    text.style.fontSize = '';
    const boxWidth = text.getBoundingClientRect().width;
    const natural = base.getBoundingClientRect().width;
    if (!boxWidth || !natural) return;
    const authored = parseFloat(getComputedStyle(text).fontSize);
    text.style.fontSize = `${((authored * boxWidth) / natural).toFixed(3)}px`;
  }

  // ---- Ink metrics.
  //
  // Where the letterforms actually start and stop inside the element's box,
  // as fractions of its height. heroTransition.js sits the portrait between
  // exactly these two, so that in the opening frame its top and bottom edges
  // are level with the name's cap line and baseline rather than with the
  // box's own (taller) edges.
  //
  // actualBoundingBox* is the ink; fontBoundingBox* is the content area the
  // line box is built around, which is what places the baseline inside a box
  // whose height comes from line-height.
  function publishInk() {
    let { top, bottom } = FALLBACK_INK;
    const style = getComputedStyle(text);
    // The line box, not a measured rect: this is a single line, so the box
    // height *is* the used line-height — and unlike a rect it is in the same
    // (unscaled) units as the font-size the metrics below are measured at.
    // Both of these are fractions, so which of the two spaces they are
    // computed in only matters in that it has to be one of them.
    const boxHeight = parseFloat(style.lineHeight) || container.offsetHeight;

    if (boxHeight > 0) {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${style.fontWeight} ${parseFloat(style.fontSize)}px ${style.fontFamily}`;
      const m = ctx.measureText(RUN);
      if (m.fontBoundingBoxAscent != null && m.actualBoundingBoxAscent != null) {
        const content = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
        const baseline = (boxHeight - content) / 2 + m.fontBoundingBoxAscent;
        top = (baseline - m.actualBoundingBoxAscent) / boxHeight;
        bottom = (baseline + m.actualBoundingBoxDescent) / boxHeight;
      }
    }

    container.dataset.inkTop = top.toFixed(4);
    container.dataset.inkBottom = bottom.toFixed(4);
  }

  // ---- When to measure.
  //
  // Not simply "once, when initHero says so". initHero starts this off
  // document.fonts.load('Anton') resolving, and that is a weaker signal than
  // it looks: Anton comes from a stylesheet on another origin, and until that
  // stylesheet arrives there is no Anton for fonts.load to find — so it
  // resolves immediately, reporting nothing loaded, while the document is
  // still render-blocked on that same stylesheet and has no layout at all.
  // Measured then, the box is zero wide, the fit silently does nothing, and
  // the ink metrics fall back to constants. (The canvas version had the same
  // hole; it just hid it, because it measured a texture of its own instead of
  // the page and so was never obviously wrong — only wrong in the face.)
  //
  // So there are four cues, and the pass is idempotent under all of them:
  // now, when the fonts settle, when the box changes width, and on the shared
  // viewport pass. Whenever one of the first three actually changes the
  // answer, it asks for that shared pass, because heroTransition.js's whole
  // FLIP is measured against the name's box and reads its ink metrics — and
  // rebuilding it is exactly what that pass does.
  let signature = '';

  function remeasure(notify) {
    fit();
    publishInk();
    const next = `${text.clientWidth}|${text.style.fontSize}|${container.dataset.inkTop}`;
    if (next === signature) return;
    signature = next;
    if (notify) requestViewportPass();
  }

  // Registered before heroTransition.js registers its own rebuild (initHero
  // resolves before initHeroTransition runs), so the name is already resized
  // and has republished its ink metrics by the time that pass re-measures the
  // layout it flips against.
  onViewportResize(() => remeasure(false));

  remeasure(false);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => remeasure(true));
  }

  // Catches the render-blocked case above: the first time this box gets a
  // real width is the first time any of this can be measured. No feedback
  // loop — fit() changes this element's font-size and so its height, but
  // never its width, which comes from the sidebar column it is stretched
  // into.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => remeasure(true)).observe(text);
  }

  // ---- Glitch.

  let visible = true;
  new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
    },
    { rootMargin: '15% 0px' },
  ).observe(container);

  function clear() {
    base.style.clipPath = '';
    tear.style.cssText = '';
    flash.style.cssText = '';
    flash.classList.remove('is-static');
  }

  // A couple of letters split along a line through their body, with one of
  // the two halves slid sideways. The base loses exactly the piece the ghost
  // is drawing, so the letterform is displaced rather than doubled.
  function doTear(soft) {
    const [x0, x1] = span();
    const splitY = rand(25, 75);
    const upper = Math.random() < 0.5;
    const y0 = upper ? 0 : splitY;
    const y1 = upper ? splitY : 100;

    base.style.clipPath = notch(x0, x1, y0, y1);
    tear.style.clipPath = `inset(${y0.toFixed(2)}% ${(100 - x1).toFixed(2)}% ${(100 - y1).toFixed(2)}% ${x0.toFixed(2)}%)`;
    // A soft patch is the same cut without the displacement: the piece stays
    // where it belongs and goes out of focus instead. (The shader did this as
    // a three-tap average across one column.)
    if (soft) {
      tear.style.filter = 'blur(0.018em)';
    } else {
      const shift = rand(1.2, 3.2) * (Math.random() < 0.5 ? -1 : 1);
      tear.style.transform = `translateX(${shift.toFixed(2)}%)`;
    }
    tear.style.visibility = 'visible';
  }

  // One band of one short span nudged toward white — over the base rather
  // than instead of it, which is how the shader mixed it. `static` puts the
  // same thing through a scanline mask so it reads as interference rather
  // than as a clean highlight.
  function doFlash(isStatic) {
    const [x0, x1] = span();
    const bands = 12;
    const y0 = Math.floor(rand(0, bands)) * (100 / bands);
    const y1 = y0 + 100 / bands;

    flash.style.clipPath = `inset(${y0.toFixed(2)}% ${(100 - x1).toFixed(2)}% ${(100 - y1).toFixed(2)}% ${x0.toFixed(2)}%)`;
    flash.classList.toggle('is-static', isStatic);
    if (isStatic) flash.style.transform = `translateX(${rand(-0.6, 0.6).toFixed(2)}%)`;
    flash.style.visibility = 'visible';
  }

  function fire() {
    const roll = Math.random();
    if (roll < 0.4) doTear(false);
    else if (roll < 0.6) doTear(true);
    else if (roll < 0.85) doFlash(false);
    else doFlash(true);
  }

  function next() {
    if (visible) {
      fire();
      gsap.delayedCall(rand(...HOLD), clear);
    }
    gsap.delayedCall(rand(...GAP), next);
  }

  if (!debugOff('glitch')) gsap.delayedCall(rand(0.6, 1.8), next);
}
