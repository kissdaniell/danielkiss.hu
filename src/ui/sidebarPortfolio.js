import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { onViewportResize, requestViewportPass } from '../utils/viewport.js';
import { isPortrait, onLayoutMode } from '../utils/layout.js';
import { portfolioPinDistance } from '../sections/portfolio.js';
import { fx } from '../utils/filters.js';

// The sidebar's one change of mind.
//
// It assembles out of the hero at the top of the page and comes apart again
// at the bottom, and between those two it has been the same panel for four
// sections. This is the beat in the middle: as the works section takes hold,
// the portrait blurs away and a grid of screens slides in off the right edge
// in its place, and the badge beside it stops counting years and starts
// saying where the work ended up.
//
// It rides the portfolio pin rather than the section's approach, and that is
// deliberate. The approach is the most expensive stretch of scrolling on the
// page: the canvas marquee starts drawing, a heading's worth of characters
// come in from a scatter, and the strip itself fades up. Arriving with a
// second animation running through the sidebar at the same time is how a
// section starts badly. By the time the pin has engaged, all of that has
// finished and the pin is holding still — so this has the frame to itself.

// The shape of the screenshots the grid is made of. Everything about the row
// count is decided against this.
const TILE_ASPECT = 150 / 113;

// Where inside the pin the change happens, as a fraction of its length. It
// starts a little way in — far enough that the section has visibly docked
// first — and finishes before scene one begins breaking apart at 0.2, so the
// two never compete for the same frames.
//
// Exported because the backdrop leaves on the same beat: the liquid layer
// fades out exactly as the portrait does (see ui/liquidRetire.js), and the
// two reading as one gesture depends on them sharing the range rather than
// each holding its own copy of it.
export const SWAP_START = 0.04;
export const SWAP_END = 0.3;

const START = SWAP_START;
const END = SWAP_END;

export function initSidebarPortfolio() {
  const section = document.querySelector('#portfolio');
  const photo = document.querySelector('.sidebar-photo-wrap');
  const grid = document.querySelector('.sidebar-grid');
  const badgeFrom = document.querySelector('.badge-text:not(.badge-text--alt)');
  const badgeTo = document.querySelector('.badge-text--alt');
  if (!section || !photo || !grid) return;

  const tiles = Array.from(grid.children);

  // The resting state, stated here rather than left to the tween below to
  // apply when it gets round to it.
  //
  // A staggered tween is a set of per-target tweens with their own delays,
  // and a target whose delay has not elapsed is not merely at its from-state
  // — it has not been touched at all. Rendering the tween immediately does
  // not help: that reaches the first target and no others. So every tile
  // after the first sat at its plain CSS state while the container above it
  // faded up, which is to say it appeared fully formed in the position it was
  // supposed to arrive at, blinked out when its own turn came, and then slid
  // in properly. The last two socials and the two site links showed it worst,
  // because they wait the longest.
  //
  // Writing it up front costs nothing: these live inside a container the
  // stylesheet holds at opacity 0 until this timeline raises it.
  gsap.set(tiles, { xPercent: 55, opacity: 0 });

  // Two rows or three, decided from the shape of the box rather than from the
  // viewport's width — what matters is how much vertical room the column had
  // left over for the portrait, and that is not something a media query can
  // see.
  //
  // Two columns either way, so the only question is how tall the cells come
  // out. Whichever row count lands closer to the screenshots' own proportions
  // crops them least — two rows on the reference viewport, three on every
  // taller one. The gaps are in the arithmetic rather than waved away,
  // because they come out of the cells and the reference shape sits close
  // enough to the boundary between the two answers for a few pixels to
  // decide it.
  function chooseRows() {
    // Nothing to choose for: the grid never arrives below 4:3, and the box it
    // would be measured against is published by an assembly that does not run
    // there either.
    if (isPortrait()) return;

    // The finished portrait box, published by heroTransition.js — not the
    // grid's own current one. They are the same rectangle in the end, but for
    // the whole of the hero this box is wearing the opening frame's size, and
    // a row count chosen against that would be chosen against a shape the
    // reader never sees the grid in. Falls back to measuring while that value
    // has yet to be published, which the refresh below then corrects.
    const width = parseFloat(photo.dataset.endWidth);
    const height = parseFloat(photo.dataset.endHeight);
    const rect = width && height ? { width, height } : grid.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const cellAspect = (rows) => ((rect.width - gap) / 2) / ((rect.height - gap * (rows - 1)) / rows);
    const rows = Math.abs(cellAspect(3) - TILE_ASPECT) < Math.abs(cellAspect(2) - TILE_ASPECT) ? 3 : 2;
    if (grid.dataset.rows === String(rows)) return;
    grid.dataset.rows = String(rows);
    grid.style.setProperty('--sidebar-grid-rows', String(rows));

    // Changing the row count changes this block's height, and this block is
    // in the column ui/heroTransition.js measures its whole opening frame
    // against — the portrait's box, the social row's right edge, where the
    // name's own box sits. That module re-measures on the shared pass, and on
    // the pass where this changes its answer it has either already run (it is
    // registered after this one) or is about to run against a column that is
    // about to move. Either way its numbers are a layout old by the time the
    // reader sees them, which is the sidebar arriving at the top of the page
    // in pieces. Asking for the pass again settles it: by the second one
    // nothing here changes, so it converges after exactly one repeat.
    requestViewportPass();
  }

  chooseRows();
  onViewportResize(chooseRows);

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      // The same distance the pin itself holds for — imported rather than
      // repeated, so lengthening the pin lengthens this with it.
      end: () => `+=${portfolioPinDistance()}`,
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });

  // Filler tween so the timeline's natural duration is the full 0..1 the
  // scrub maps onto — without it the positions below would fire early, scaled
  // by 1/(end of the last real tween). Same reason every other scrubbed
  // timeline on the page opens with one.
  tl.to({}, { duration: 1 }, 0);

  const span = END - START;

  // ---- The portrait takes its leave.
  //
  // fromTo from a literal `none` with immediateRender off, so that for the
  // whole page above this point the portrait carries no filter at all — an
  // element with even a zero-radius blur on it keeps a filtered render
  // surface, and this one is on screen for four sections. Past the range it
  // is at opacity 0 and not painted, so what the filter is left at costs
  // nothing.
  tl.fromTo(
    photo,
    { filter: 'none' },
    { filter: fx(14), opacity: 0, ease: 'none', duration: span * 0.75, immediateRender: false },
    START,
  );

  // ---- ...and the grid arrives in its place, off the right edge.
  //
  // The container carries the travel and the tiles carry the stagger, so the
  // grid reads as one thing coming in rather than six things arriving
  // separately. Transforms and opacity only: this lands in the middle of the
  // most GPU-bound section on the page, and none of it should cost a repaint.
  tl.fromTo(
    grid,
    { xPercent: 22, opacity: 0 },
    { xPercent: 0, opacity: 1, ease: 'none', duration: span * 0.8 },
    START + span * 0.2,
  );

  if (tiles.length) {
    tl.fromTo(
      tiles,
      { xPercent: 55, opacity: 0 },
      {
        xPercent: 0,
        opacity: 1,
        ease: 'none',
        duration: span * 0.45,
        stagger: (span * 0.35) / tiles.length,
      },
      START + span * 0.2,
    );
  }

  // ---- The badge changes what it is counting.
  if (badgeFrom && badgeTo) {
    tl.to(badgeFrom, { opacity: 0, ease: 'none', duration: span * 0.3 }, START + span * 0.35)
      .to(badgeTo, { opacity: 1, ease: 'none', duration: span * 0.3 }, START + span * 0.6);
  }

  // The grid's row count depends on the portrait box, which heroTransition.js
  // only settles once the display face has landed and the shared viewport
  // pass has run. That pass calls chooseRows above; this catches the refresh
  // that follows it.
  ScrollTrigger.addEventListener('refresh', chooseRows);

  // ---- ...and none of it below 4:3.
  //
  // The panel there is a sheet behind a button, and what the reader is asked
  // to see in it is the sidebar as it stands from the second section on —
  // photograph, years badge, no swap. Disabled with a revert so the trigger
  // puts back everything it had written before it stops listening; enabled
  // again on the way back, with the refresh that follows in the same pass
  // giving it its measurements.
  applyMode(isPortrait());
  onLayoutMode(applyMode);

  function applyMode(portrait) {
    const st = tl.scrollTrigger;
    if (!st) return;
    if (portrait) st.disable(true);
    else st.enable();
  }
}
