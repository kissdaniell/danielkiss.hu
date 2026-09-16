import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { heroScrollDistance, holdsScroll } from '../sections/hero.js';
import { isPortrait, onLayoutMode } from '../utils/layout.js';

// Two small restlessnesses in the opening frame's header, and both of them
// stop when it does.
//
// The line under the name cycles its last word — CODE / MOTION / WEBGL turns
// over to WEIRD, CHAOS, UNUSUAL and back — and the nav below it has one of its
// five items break up every few seconds. Neither survives into the assembled
// sidebar: that panel sits alongside the reader for four sections and a word
// changing under their eye there would be a distraction rather than a sign of
// life, so when the hero's range ends the line settles back on WEBGL and the
// nav goes quiet.
//
// Both effects are stepped rather than eased, which is the language the rest
// of the page glitches in (see the underline keyframes and the name's own
// tear), and both are transform-and-visibility only. They run a handful of
// times a minute on elements a few characters wide, so nothing here is worth
// a repaint.

// How often the last word turns over.
const WORD_EVERY = 2;
// The gap between one nav item breaking up and the next.
const NAV_EVERY = [2, 4];

const rand = (min, max) => min + Math.random() * (max - min);

// A short stepped break: a few hard displacements with a band of the element
// clipped away at each one, then everything handed back. Written as `set`s at
// fixed times rather than a tween, because a glitch that eases is a wobble.
function breakUp(target, { reach = 6, steps = 3, step = 0.055 } = {}) {
  const tl = gsap.timeline();
  for (let i = 0; i < steps; i++) {
    const top = rand(0, 45);
    const bottom = rand(0, 40);
    tl.set(target, {
      x: rand(-reach, reach),
      clipPath: `inset(${top.toFixed(0)}% 0 ${bottom.toFixed(0)}% 0)`,
    }, i * step);
  }
  tl.set(target, { x: 0, clipPath: 'none' }, steps * step);
  return tl;
}

export function initHeroHeader() {
  const heroSpacer = document.querySelector('.hero');
  // Per stack, not one flat list of words. There are two copies of the line
  // now — the panel's own and the portrait bar's (see .site-topbar in the
  // markup) — and only ever one of them is on screen, but a single list would
  // have the eighth word be index 7 of a cycle that only counts to three. The
  // stacks turn over together and cost nothing for it: four class toggles on
  // a line nobody is looking at.
  const stacks = Array.from(document.querySelectorAll('.tagline-swap'))
    .map((swap) => Array.from(swap.querySelectorAll('.tagline-word')))
    .filter((group) => group.length);
  const words = stacks.flat();
  const navInners = Array.from(document.querySelectorAll('.sidebar-nav .nav-inner'));
  if (!heroSpacer || (!stacks.length && !navInners.length)) return;

  const wordCount = stacks[0] ? stacks[0].length : 0;

  let live = false;
  let index = 0;
  let wordCall = null;
  let navCall = null;

  function show(i) {
    stacks.forEach((group) => group.forEach((w, n) => w.classList.toggle('is-on', n === i)));
  }

  // The turnover: the outgoing word tears, the incoming one takes its place
  // mid-tear and finishes settling. Cutting between them while both are still
  // broken is what makes it read as one word becoming another rather than as
  // two separate animations.
  function cycle() {
    if (!wordCount) return;
    const from = stacks.map((group) => group[index]);
    index = (index + 1) % wordCount;
    const to = stacks.map((group) => group[index]);

    gsap.timeline()
      .add(breakUp(from, { reach: 7, steps: 2 }))
      .call(() => {
        show(index);
        gsap.set(from, { x: 0, clipPath: 'none' });
      })
      .add(breakUp(to, { reach: 8, steps: 3 }));
  }

  function scheduleWord() {
    wordCall = gsap.delayedCall(WORD_EVERY, () => {
      if (live) cycle();
      scheduleWord();
    });
  }

  function scheduleNav() {
    navCall = gsap.delayedCall(rand(...NAV_EVERY), () => {
      if (live && navInners.length) {
        breakUp(gsap.utils.random(navInners), { reach: 5, steps: 3, step: 0.05 });
      }
      scheduleNav();
    });
  }

  function setLive(active) {
    if (active === live) return;
    live = active;
    if (active) return;

    // Back to rest: the line reads WEBGL again and nothing carries a leftover
    // displacement or a half-applied clip from whichever step it was on when
    // the reader scrolled out of range.
    index = 0;
    show(0);
    gsap.set([...words, ...navInners], { x: 0, clipPath: 'none' });
  }

  // Above 4:3 the restlessness belongs to the opening frame and stops with
  // it: the line settles on WEBGL for the four sections the panel spends
  // alongside the reader, where a word turning over would be a distraction.
  // Below it the line has moved to the bar at the top of the screen, which is
  // on show for the whole page and is the only thing up there — so it keeps
  // its life throughout, and the range stops deciding.
  ScrollTrigger.create({
    trigger: heroSpacer,
    start: 'top top',
    end: () => `+=${heroScrollDistance()}`,
    invalidateOnRefresh: true,
    onToggle: (self) => setLive(isPortrait() || holdsScroll(self)),
    onRefresh: (self) => setLive(isPortrait() || holdsScroll(self)),
    onUpdate: (self) => setLive(isPortrait() || holdsScroll(self)),
  });

  onLayoutMode((portrait) => {
    if (portrait) setLive(true);
  });

  if (isPortrait()) setLive(true);

  scheduleWord();
  scheduleNav();

  return () => {
    if (wordCall) wordCall.kill();
    if (navCall) navCall.kill();
  };
}
