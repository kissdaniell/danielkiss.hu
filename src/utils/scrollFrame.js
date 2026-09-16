import { ScrollTrigger } from 'gsap/ScrollTrigger';

// One scroll listener for the whole page, batched into one rAF.
//
// Three modules wanted to know "the page moved": the ruler's readout, the
// corner marks' cycle, and (indirectly) the deferred media loader. Each kept
// its own passive listener with its own rAF guard, so a single scroll gesture
// woke three callbacks on three separate frames' worth of bookkeeping. They
// all subscribe here instead: one listener, one rAF, one ordered pass.
//
// It also caches the one number that made the old ruler pass expensive.
// updateScrollLabels() read document.documentElement.scrollHeight on every
// scrolled frame, immediately after writing textContent into a dozen ruler
// marks — which is a forced synchronous layout of the whole document, once
// per frame, right after having invalidated it. The height only changes when
// the document does, and ScrollTrigger already announces exactly that.

const listeners = new Set();
let frame = null;
let maxScroll = 0;
// Captured in the scroll event, not in the frame callback. See below.
let scrollY = window.scrollY;

function measureMaxScroll() {
  maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}

function flush() {
  frame = null;
  listeners.forEach((fn) => fn(scrollY, maxScroll));
}

window.addEventListener(
  'scroll',
  () => {
    // The scroll offset is read *here* rather than inside flush(), and that
    // one line was measurably the most expensive thing on the page.
    //
    // window.scrollY is only free while the layout is clean. Inside the frame
    // callback it is not: GSAP's own ticker has already run by then and
    // written a frame's worth of inline styles — including, during the hero,
    // several that change the sidebar's layout — so asking for the scroll
    // offset there made the browser stop and lay the document out on the
    // spot. A long-animation-frame recording put that single read at over
    // half a second of forced layout across a few seconds of scrolling, more
    // than any other script on the page.
    //
    // Scroll events are dispatched before the frame's callbacks, at a point
    // where the last frame's layout is still settled, so the same read costs
    // nothing here. Everything downstream gets the captured number.
    scrollY = window.scrollY;
    if (frame) return;
    frame = requestAnimationFrame(flush);
  },
  { passive: true },
);

// Every pin on the page changes the document's height when it is set up or
// re-measured, and a refresh is the only moment that can happen.
ScrollTrigger.addEventListener('refresh', measureMaxScroll);
measureMaxScroll();

// Called with (scrollY, maxScroll) at most once per frame, in registration
// order. Returns an unsubscribe.
export function onScrollFrame(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function documentScrollRange() {
  return maxScroll;
}
