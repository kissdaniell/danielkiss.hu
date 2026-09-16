import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';

import { refreshLayoutMode } from './layout.js';

// One place that decides "the viewport changed, everything re-measures now".
//
// Before this, five modules each kept their own resize listener on their own
// debounce (150ms in the canvas marquee, 200ms in the ruler, 200ms in the
// hero transition, ScrollTrigger's own immediate one, ...). They fired in
// arbitrary order and refreshed ScrollTrigger at different moments, so the
// page settled through several intermediate states — a pin could be measured
// against a canvas that had not resized yet, and whichever module ran last
// decided what the layout ended up as. Everything now subscribes here
// instead: one listener, one debounce, one ordered pass (refresh, re-measure,
// refresh, restore the reading position) — so a resize lands on the same
// state the page would have loaded into at that size, with the reader still
// at the same point in it.
//
// ScrollTrigger's own resize refresh is switched off in main.js
// (autoRefreshEvents) so it can't run ahead of that pass.

const listeners = new Set();

// Long enough that a drag-resize coalesces into a single pass rather than
// re-running the whole (expensive: canvas reallocation, ruler rebuild, FLIP
// re-measure) pipeline for every intermediate width.
const SETTLE_MS = 180;

let timer = null;
let running = false;
let rerun = false;
let lastWidth = window.innerWidth;
let lastHeight = window.innerHeight;

// px per "design px" — 1 at the 1520x703 reference the CSS is scaled from
// (see the scale note at the top of main.css). Cached rather than read per
// call: getComputedStyle on the root forces a style recalc, and the scatter
// offsets below would otherwise ask for it once per animated element.
let scale = 1;

function readScale() {
  const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  scale = rootSize > 0 ? rootSize / 16 : 1;
}

readScale();

function scrollTop() {
  const smoother = ScrollSmoother.get();
  return smoother ? smoother.scrollTop() : window.scrollY;
}

function scrollTo(value) {
  const smoother = ScrollSmoother.get();
  if (smoother) smoother.scrollTop(value);
  else window.scrollTo(0, value);
}

// Where the reader is, in terms that survive the page being re-measured.
//
// Every pin length on the page is derived from the viewport, so the document
// gets taller or shorter on resize and a raw scroll offset stops meaning the
// same thing: resize halfway through the WPKoi strip and that same offset
// lands somewhere before the section entirely. Anchoring to the active pin's
// own progress keeps the reader at the same point in the story instead —
// halfway through the strip stays halfway through the strip. Between pinned
// sections there is nothing that precise to hold onto, so it falls back to
// the document-wide ratio.
function captureAnchor() {
  // Asked by position rather than by `isActive`, for the reason holdsScroll
  // in sections/hero.js spells out: a trigger sitting exactly on its own
  // start reports `isActive` as undefined, and one that has been refreshed
  // but not updated since can still be carrying the last pass's answer.
  // Both of those are wrong here in the same expensive way — anchoring to a
  // pin the reader is nowhere near restores them to a scroll position the
  // reader is nowhere near, which for a pin that starts at 0 means the top
  // of the page.
  const at = scrollTop();
  const pinned = ScrollTrigger.getAll().find(
    (st) => st.pin && st.end > st.start && at >= st.start && at < st.end,
  );
  if (pinned) {
    return { trigger: pinned, progress: (at - pinned.start) / (pinned.end - pinned.start) };
  }

  const max = ScrollTrigger.maxScroll(window);
  return { ratio: max > 0 ? at / max : 0 };
}

function restoreAnchor(anchor) {
  if (anchor.trigger) {
    const { start, end } = anchor.trigger;
    scrollTo(start + (end - start) * anchor.progress);
  } else {
    scrollTo(anchor.ratio * ScrollTrigger.maxScroll(window));
  }
  ScrollTrigger.update();
}

function flush() {
  timer = null;
  running = true;
  readScale();

  // First, because it decides what the rest of the pass is for. Crossing
  // between the wide layout and the portrait one is not a resize the reading
  // position survives: one has a fixed column down the side and an opening
  // frame that assembles into it, the other has neither, and the document is
  // a different length for it. There is no offset in one that means the same
  // thing in the other, so the reader is put back at the top — which is what
  // the anchor below is skipped for. Everything that has to be switched on or
  // off for the new mode has already been told by the time this returns.
  const modeChanged = refreshLayoutMode();
  const anchor = modeChanged ? null : captureAnchor();
  if (modeChanged) scrollTo(0);

  try {
    // Refresh first, then re-measure, then refresh again.
    //
    // The first one matters more than it looks: while a pin is set up,
    // ScrollTrigger holds an explicit pixel width on the pin-spacer wrapping
    // the section. Until it re-runs, that width is still the *previous*
    // viewport's, so anything measuring its own box inside a pinned section
    // (the gallery marquee canvas, most obviously) reads the old layout and
    // sizes itself to a window that no longer exists. Refreshing up front
    // puts every spacer back on the current viewport before a single
    // listener measures anything.
    //
    // The second one catches whatever the listeners themselves changed —
    // heroTransition rebuilds its timeline (and with it its ScrollTrigger)
    // from scratch in there.
    ScrollTrigger.refresh();

    // Each listener in its own try, and that is not defensive habit.
    //
    // They run in registration order, and the order is decided by how long
    // each module took to start: everything synchronous registers first, and
    // the two that wait on the display face (ui/heroName.js, then
    // ui/heroTransition.js) register last. So an exception anywhere in the
    // list takes out everything behind it in the list, and what is behind it
    // is always the hero — along with the second refresh and the anchor
    // restore below. Its entire opening frame is concrete pixel offsets
    // measured against one particular window, so a rebuild it never got is
    // not a mildly stale layout: it is the sidebar wearing another window's
    // coordinates, scattered across the screen, until something else
    // happens to rebuild it.
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        console.error('[viewport] resize listener failed', error);
      }
    });

    ScrollTrigger.refresh();
    if (anchor) {
      restoreAnchor(anchor);
    } else {
      scrollTo(0);
      ScrollTrigger.update();
    }
  } finally {
    // In a finally so nothing above can leave the flag latched on: with it
    // stuck, requestViewportPass would never schedule again, and the late
    // arrivals that depend on it — the display face landing, the name
    // refitting itself to its column — would go unanswered for the session.
    running = false;
  }

  // A listener that changed the layout out from under the listeners after it
  // asks for another pass rather than getting one immediately (see
  // requestViewportPass). That is what this is: one more ordered pass, on the
  // usual debounce, now that the column is the shape it is going to be.
  if (rerun) {
    rerun = false;
    clearTimeout(timer);
    timer = setTimeout(flush, SETTLE_MS);
  }
}

// Whether the address bar is a thing that happens here.
//
// Read once: a device does not stop being a touch device mid-session, and
// this is consulted from a listener that fires during scroll.
const barCanMove =
  typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;

window.addEventListener('resize', () => {
  const widthChanged = window.innerWidth !== lastWidth;
  const heightChanged = window.innerHeight !== lastHeight;

  // Nothing actually moved. Some desktop cases fire resize for a
  // devicePixelRatio change alone.
  if (!widthChanged && !heightChanged) return;

  // A height-only change on a phone, which is almost always the address bar
  // sliding away as the reader scrolls — and this pass is the most expensive
  // thing on the page. It refreshes ScrollTrigger twice, re-measures every
  // module, and then *moves the scroll position* to restore the anchor.
  // Running that 180ms into a scroll is what made every pinned section shake
  // and jump: the reader scrolls, the bar retracts, the page re-measures
  // underneath them and puts them back somewhere slightly different.
  //
  // The bar changes height, never width, so width is the honest signal that
  // the viewport really is a different shape. An orientation change moves
  // both and still gets its pass. A soft keyboard moves height alone and is
  // correctly ignored for the same reason the bar is.
  //
  // The new height is still recorded, so that a later genuine change is
  // measured against what is actually on screen now.
  if (barCanMove && !widthChanged) {
    lastHeight = window.innerHeight;
    return;
  }

  lastWidth = window.innerWidth;
  lastHeight = window.innerHeight;

  clearTimeout(timer);
  timer = setTimeout(flush, SETTLE_MS);
});

// Register a re-measure callback. Called in registration order, between the
// two ScrollTrigger refreshes of the pass (see flush) — so it both measures
// a correct layout and gets anything it changes picked up afterwards.
export function onViewportResize(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Run the same pass without a resize having happened.
//
// For the cases where something other than the window decides the layout was
// wrong: the hero name (ui/heroName.js) fits itself to its column and
// republishes the ink metrics the portrait lines up against, and it can only
// do that once the page actually has a layout and the display face has
// arrived — both of which can land after every module has already measured
// against a page that had neither. Rather than each of those growing its own
// private way of telling the others, they ask for the one ordered pass that
// already exists. Shares the debounce, so several late arrivals in quick
// succession still cost one pass.
export function requestViewportPass() {
  // Asked from inside a pass, it is deferred to the end of that pass rather
  // than scheduled on top of it — and it is a real case, not a defensive one.
  // The listeners run in one order, and a listener can change the column's
  // shape for the ones behind it: ui/sidebarPortfolio.js decides how many
  // rows the screen grid takes from a box ui/heroTransition.js publishes on
  // the pass before, so the pass where that answer changes is a pass where
  // the sidebar's layout moves after the hero has already measured against
  // it. What that needs is the same ordered pass run once more, which is what
  // flush does with this at the end. Scheduling it as a fresh debounce from
  // inside would instead restart the timer the pass is standing in.
  if (running) {
    rerun = true;
    return;
  }
  clearTimeout(timer);
  timer = setTimeout(flush, SETTLE_MS);
}

// Converts a length authored against the 1520x703 reference into the current
// scale. For JS-side numbers that need to match the CSS's proportions —
// animation offsets, pin distances — the way `rem` does in the stylesheets.
export function dpx(value) {
  return value * scale;
}

export function designScale() {
  return scale;
}
