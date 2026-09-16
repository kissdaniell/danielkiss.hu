import { ScrollTrigger } from 'gsap/ScrollTrigger';

import '../styles/hero.css';
import { initLiquidReveal } from '../webgl/liquidReveal.js';
import { initHeroName } from '../ui/heroName.js';
import { debugOff } from '../utils/debug.js';
import { isPortrait, onLayoutMode } from '../utils/layout.js';

// Gap between the liquid layer's own ambient drops, in milliseconds — a range
// rather than an interval, so they never settle into a countable rhythm. The
// hero is the one place anybody is actually watching this layer, so it gets
// one every few seconds; below it the same cadence would read as fidgeting in
// the corner of the eye, and it thins out to roughly one every five seconds.
const HERO_DROP_GAP = [2200, 4200];
const PAGE_DROP_GAP = [4000, 6500];

// ...and the same range for a window with no pointer over it.
//
// Above 4:3 the layer is mostly answering a mouse: the drops are the second
// voice, filling in around a surface that is already being disturbed. Below
// it there is no mouse, the reader touches the page rather than moving across
// it, and the ambient drops are the only thing happening on the layer at all
// — so they come closer together. Not by much: this is still a background,
// and a countable rhythm is what it must never acquire.
const HERO_DROP_GAP_PORTRAIT = [1200, 2400];

// The same boundary decides how often the simulation itself steps. In the
// hero it answers a pointer and is the thing being looked at, so it runs on
// every frame; below it the layer is a slow background texture at 0.3 opacity
// and half the steps buy exactly the same picture for half the GPU.
const HERO_FPS = 0;
const PAGE_FPS = 30;

// How far the opening frame lasts, in scroll.
//
// Four things measure their own progress against this: the sidebar assembling
// (heroTransition.js), the skills panel's pin and its reveal (skills.js), the
// header's own restlessness (ui/heroHeader.js) and the liquid layer's cadence
// below. They have to agree exactly — the pin releasing and "the sidebar has
// arrived" are supposed to be the same moment — and until now they agreed by
// three files each writing 2.4 down and a comment in each asking the next
// person not to change it alone.
export function heroScrollDistance() {
  return 2.4 * window.innerHeight;
}

// Whether a trigger's range currently contains the scroll position.
//
// Not `self.isActive`, and this is not a preference. At the exact moment a
// trigger sits on its own start, `isActive` is `undefined` — not false, not
// true — and it stays that way until something toggles it. Every trigger
// scoped to the opening frame starts at 0, which is precisely where the page
// loads, so `isActive` is undefined for all of them until the reader scrolls
// a single pixel.
//
// That cost the header its life at rest: the line and the nav only woke up
// once the sidebar had started assembling. It was quietly wrong in two more
// places too — the liquid layer opened the page at its background frame rate
// and its sparse drop cadence rather than the hero's, and the name's
// composited layer was being switched on by a classList.toggle whose second
// argument was undefined, which means "flip it" rather than "set it", so the
// state it landed in depended on how many times it had been called.
//
// Asking the position instead is unambiguous at every scroll offset,
// boundaries included. Nothing about it is specific to the hero.
export function holdsScroll(self) {
  const scroll = self.scroll();
  return scroll >= self.start && scroll < self.end;
}

// How far up the second video comes once #skills has it. Not 1: at full
// strength a video that never fades again reads as too much to carry behind
// the rest of the page. It lives beside the layer's other controls rather
// than inside the section that happens to animate it — skills.js is the only
// caller, but this is a property of the backdrop, not of that section.
export const LIQUID_ALT_OPACITY = 0.3;

// The liquid layer's controls, for the modules that decide what it should be
// doing further down the page. Null when the layer is absent or switched off.
let revealHandle = null;

export function liquidLayer() {
  return revealHandle;
}

export function initHero() {
  const liquid = document.querySelector('.hero-liquid');
  const heroSpacer = document.querySelector('.hero');
  const heroGap = () => (isPortrait() ? HERO_DROP_GAP_PORTRAIT : HERO_DROP_GAP);
  const reveal = liquid && !debugOff('liquid')
    ? initLiquidReveal(liquid, { dropGap: heroGap() })
    : null;
  revealHandle = reveal || null;

  // 2.4 is the same hero scroll distance heroTransition.js and skills.js both
  // measure their own progress against — it has to stay equal to those two.
  // onRefresh as well as onToggle, so a reload part-way down the page starts
  // on the right cadence instead of waiting for a boundary to be crossed.
  //
  // ...and onUpdate for the case neither of those two covers: a reader who
  // is below the opening frame and returns to the very top of the page in
  // one movement is inactive on both sides of it, so `isActive` never
  // changes and onToggle never fires. The layer would then open the frame it
  // is the backdrop of at the page's own half rate and its sparse drops.
  if (reveal && heroSpacer) {
    let inHeroNow = true;
    const applyRate = (self) => {
      inHeroNow = holdsScroll(self);
      reveal.setDropRate(...(inHeroNow ? heroGap() : PAGE_DROP_GAP));
      reveal.setFrameRate(inHeroNow ? HERO_FPS : PAGE_FPS);
    };
    // The cadence is a property of the shape of the window as much as of
    // where the reader is in the page, so a window crossing the boundary has
    // to re-ask without waiting for a scroll to tell it.
    onLayoutMode(() => reveal.setDropRate(...(inHeroNow ? heroGap() : PAGE_DROP_GAP)));
    ScrollTrigger.create({
      trigger: heroSpacer,
      start: 'top top',
      end: () => `+=${heroScrollDistance()}`,
      invalidateOnRefresh: true,
      onToggle: applyRate,
      onRefresh: applyRate,
      onUpdate: applyRate,
    });
  }

  // TODO: hero copy reveal (SplitText)
  //
  // Still gated on the display face: heroName.js sizes the run to the box by
  // measuring what it actually comes to, and measuring it in the fallback
  // face would fit the wrong metrics and then never re-fit.
  return document.fonts.load('400 100px "Anton"').then(() => initHeroName());
}
