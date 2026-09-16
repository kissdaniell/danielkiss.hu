import { gsap } from 'gsap';

import { onScrollFrame } from '../utils/scrollFrame.js';
import { isPortrait, onLayoutMode } from '../utils/layout.js';

// The "+" marks take turns doing a quick spin as the user scrolls, cycling
// clockwise one at a time — a small ambient flourish rather than a busy or
// frequent one, so it's paced by scroll distance rather than by scroll
// events.
//
// Clockwise from the top-left, and the bottom-right is in the list even
// though the wide layout does not draw it: up there that corner belongs to
// the fixed readout and the sidebar's own edge, so it is left bare (see
// .corner-mark--br in main.css). Below 4:3 neither of those is there and the
// frame closes, so the round trip is four rather than three. The cycle reads
// its length off whichever corners are actually being drawn, so a corner
// dropping out shortens the trip instead of leaving a dead beat where its
// turn used to be.
const ORDER = ['tl', 'tr', 'br', 'bl'];
const STEP_PX = 400;

export function initCornerMarks() {
  const all = ORDER.map((pos) => document.querySelector(`.corner-mark--${pos}`));
  if (all.some((mark) => !mark)) return;

  // The bottom-right one is the only conditional corner, and it is the last
  // thing this module should be asking the stylesheet about on every step —
  // so the list is rebuilt when the layout mode changes and not before.
  let marks = all;

  function collect() {
    marks = isPortrait() ? all : all.filter((_, i) => ORDER[i] !== 'br');
    current = 0;
  }

  let current = 0;
  let lastStep = 0;

  collect();
  onLayoutMode(collect);

  // Shares the page's one batched scroll pass (see utils/scrollFrame.js)
  // rather than keeping a listener and a rAF guard of its own — all this
  // needs out of a scroll is a number it compares against a threshold.
  onScrollFrame((scrollY) => {
    const step = Math.floor(scrollY / STEP_PX);
    if (step === lastStep) return;
    lastStep = step;

    const mark = marks[current % marks.length];
    current += 1;
    // Absolute 0 -> 720 with the transform handed back to the stylesheet at
    // the end, rather than a relative '+=720'. A relative target is resolved
    // from whatever the mark's angle happens to be at the moment the tween
    // starts — and a fast scroll can start a mark's next spin while its
    // previous one is still running, so that starting angle is a partial
    // rotation, not a whole one. The mark then settles at that leftover angle
    // forever, which is how a "+" ends up resting as an "x". Dropping a
    // corner made this more likely, not less: with three marks instead of
    // four, each one's turn comes round sooner.
    gsap.fromTo(
      mark,
      { rotate: 0 },
      {
        rotate: 720,
        duration: 0.6,
        ease: 'power2.inOut',
        overwrite: 'auto',
        clearProps: 'transform',
      },
    );
  });
}
