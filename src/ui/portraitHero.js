import { gsap } from 'gsap';

import { onViewportResize } from '../utils/viewport.js';
import { isPortrait, onLayoutMode } from '../utils/layout.js';
import { heroScrollDistance } from '../sections/hero.js';

// The upright opening frame: the two things about it that a stylesheet cannot
// state.
//
// The frame itself is CSS (see the portrait block in styles/hero.css) and its
// markup is its own — above 4:3 none of this is rendered, because up there
// the frame is the sidebar's children wearing a FLIP.

// How much of the hero's scroll the frame takes to leave.
//
// The skills panel is pinned behind it and starts revealing at 0.23 of that
// same range, so this has to be gone by roughly then — otherwise the two are
// both on screen asking to be read, one sliding up and one settling in place.
// A little under, so the frame has finished before the panel begins.
const LEAVE = 0.2;

export function initPortraitHero() {
  const block = document.querySelector('.hero-portrait');
  const box = block ? block.querySelector('.hero-portrait-name') : null;
  const line = block ? block.querySelector('.hero-portrait-name-line') : null;
  const heroSpacer = document.querySelector('.hero');
  if (!block || !box || !line || !heroSpacer) return;

  // ---- The name spans the frame exactly.
  //
  // Measured rather than tuned to a constant, and for the reason
  // ui/heroName.js gives for doing the same to its own: what a run of type
  // comes to at a given size is the display face's business, so a number
  // written here would be right for Anton and wrong for the fallback that
  // stands in until it arrives — which is precisely the moment the line would
  // be too wide for the screen.
  function fit() {
    if (!isPortrait()) return;
    line.style.fontSize = '';
    const boxWidth = box.clientWidth;
    const natural = line.getBoundingClientRect().width;
    if (!boxWidth || !natural) return;
    const authored = parseFloat(getComputedStyle(line).fontSize);
    line.style.fontSize = `${((authored * boxWidth) / natural).toFixed(3)}px`;
  }

  fit();
  onViewportResize(fit);
  onLayoutMode(fit);
  // The face is loaded for the wide layout's name too, so this is usually
  // already resolved by the time anyone asks — but the fallback's metrics are
  // not Anton's, and a line fitted to them is a line that overruns the screen
  // the moment the real one lands.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  // ---- ...and it leaves as the panel behind it arrives.
  //
  // It scrolls away on its own — it is in the flow of the page, not pinned —
  // but the panel it scrolls away from is pinned and holds still, so for half
  // a screen the two overlap. Fading across the same stretch is what turns
  // that into a hand-off. Opacity only: nothing here is laid out by it.
  gsap.timeline({
    scrollTrigger: {
      trigger: heroSpacer,
      start: 'top top',
      end: () => `+=${heroScrollDistance() * LEAVE}`,
      scrub: 0.4,
      invalidateOnRefresh: true,
    },
  }).to(block, { opacity: 0, ease: 'none', duration: 1 }, 0);
}
