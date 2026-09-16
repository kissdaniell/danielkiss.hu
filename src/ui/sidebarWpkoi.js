import { gsap } from 'gsap';

import { wpkoiPinDistance } from '../sections/wpkoi.js';
import { isPortrait, onLayoutMode } from '../utils/layout.js';
import { fx } from '../utils/filters.js';

// The sidebar's second change of face, one section after the first.
//
// #portfolio swapped the portrait for a grid of screens. This swaps the block
// under it: the five social icons return to the word marks they were in the
// opening frame, the two lines of description below them dissolve, and the
// two sites the section is about take their place.
//
// Same timing discipline as ui/sidebarPortfolio.js and for the same reason —
// it waits for the pin. Arriving at #wpkoi is expensive (the strip's entrance
// is scrubbed across the whole approach, five media fade up from a blur, two
// clips start buffering), and none of that wants company. Once the pin has
// engaged, the section is holding still and the strip is only translating.
//
// Nothing here animates a layout property, and nothing needs to: the two
// faces are stacked in one box that holds the height of the first (see
// .sidebar-links), so the swap cannot move the column even in principle.

// Where inside the pin the change happens, as a fraction of its length.
const START = 0.05;
const END = 0.32;
// The point at which the new face is far enough in to own the pointer.
const HANDOVER = 0.6;

export function initSidebarWpkoi() {
  const section = document.querySelector('#wpkoi');
  const stage = document.querySelector('.sidebar-links');
  const next = document.querySelector('.sidebar-links-next');
  if (!section || !stage || !next) return;

  const now = document.querySelector('.sidebar-links-now');
  const icons = Array.from(document.querySelectorAll('.sidebar-social .social-link'));
  // The slots around them, not the elements themselves. Both carry a fade of
  // their own from the sidebar assembling (ui/heroTransition.js), and one
  // opacity cannot answer to two timelines — see the note in the markup.
  const bio = document.querySelector('.sidebar-bio').closest('.sidebar-fade-slot');
  const locale = document.querySelector('.sidebar-locale').closest('.sidebar-fade-slot');
  const words = Array.from(next.querySelectorAll('.sidebar-word-link'));

  const span = END - START;

  // The resting state, stated here rather than left to the tween below to
  // apply when it gets round to it.
  //
  // A staggered tween is a set of per-target tweens with their own delays,
  // and a target whose delay has not elapsed is not merely at its from-state
  // — it has not been touched at all. Rendering the tween immediately does
  // not help: that reaches the first target and no others. So every word
  // after the first sat at its plain CSS state while the container above it
  // faded up, which is to say it appeared fully formed in the position it was
  // supposed to arrive at, blinked out when its own turn came, and then slid
  // in properly. The last two socials and the two site links showed it worst,
  // because they wait the longest.
  //
  // Writing it up front costs nothing: these live inside a container the
  // stylesheet holds at opacity 0 until this timeline raises it.
  gsap.set(words, { x: 34, opacity: 0 });

  // The replacement starts out of reach; the swap below hands it over.
  next.inert = true;

  let swapped = false;

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      // The strip's own pin length — imported rather than repeated, since it
      // is measured from the strip's travel and is not a round number.
      end: () => `+=${wpkoiPinDistance()}`,
      scrub: 0.6,
      invalidateOnRefresh: true,
      // Which of the two faces is the real one, switched at the point they
      // cross over. `inert` rather than only pointer-events, because these are
      // ten links between them and the inactive five should be out of the tab
      // order and off the accessibility tree as well as out of the pointer's
      // reach — a keyboard reader should never land on a link that is sitting
      // at opacity 0. Toggled rather than tweened: none of this has a
      // meaningful in-between.
      onUpdate: (self) => {
        const past = self.progress > START + span * HANDOVER;
        if (past === swapped) return;
        swapped = past;
        stage.classList.toggle('is-wpkoi', past);
        next.inert = !past;
        next.setAttribute('aria-hidden', past ? 'false' : 'true');
        if (now) now.inert = past;
      },
    },
  });

  // Filler tween so the timeline's natural duration is the full 0..1 the
  // scrub maps onto — the same reason every other scrubbed timeline on the
  // page opens with one.
  tl.to({}, { duration: 1 }, 0);

  // ---- The icons go first, and they go the way the words will arrive: out
  // to the right. Staggered from the left so the row empties in reading
  // order rather than all at once.
  //
  // fromTo rather than to, with both ends written out. A `to` infers its
  // start from whatever the element happens to be wearing when the tween
  // first initialises — and this trigger carries invalidateOnRefresh, so a
  // refresh landing while the swap is complete would have it record `already
  // gone` as the starting point and quietly become a tween that does nothing.
  // Scrolling back up would then never bring the icons back.
  if (icons.length) {
    tl.fromTo(
      icons,
      { '--exit-fade': 1, x: 0 },
      {
        // Not `opacity`: the last two of these five are also being faded *in*
        // by the sidebar assembling, and one property cannot belong to both
        // timelines. See .social-link in the stylesheet.
        '--exit-fade': 0,
        x: 18,
        ease: 'none',
        duration: span * 0.35,
        stagger: (span * 0.2) / icons.length,
      },
      START,
    );
  }

  // ---- The two lines under them dissolve.
  //
  // fromTo off a literal `none` with immediateRender off, so that for the
  // three sections above this point neither element carries a filter at all.
  // Past the range both sit at opacity 0 and are not painted, so whatever the
  // blur is left at costs nothing.
  [bio, locale].forEach((el, i) => {
    if (!el) return;
    tl.fromTo(
      el,
      { filter: 'none' },
      {
        filter: fx(9),
        opacity: 0,
        ease: 'none',
        duration: span * 0.4,
        immediateRender: false,
      },
      START + span * (0.08 + i * 0.08),
    );
  });

  // ---- ...and the words come in off the right edge, one after another.
  //
  // Still fromTo rather than to, even with the set above: both ends written
  // out is what makes these immune to the invalidate that this trigger's
  // invalidateOnRefresh performs.
  tl.fromTo(
    next,
    { opacity: 0 },
    { opacity: 1, ease: 'none', duration: span * 0.5 },
    START + span * 0.4,
  );

  if (words.length) {
    tl.fromTo(
      words,
      { x: 34, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        ease: 'none',
        duration: span * 0.4,
        stagger: (span * 0.3) / words.length,
      },
      START + span * 0.4,
    );
  }

  // ---- ...and none of it below 4:3, where the panel is a sheet behind a
  // button and shows the sidebar as it stands from the second section on.
  // The trigger's revert puts the tweened properties back; the two things it
  // toggles rather than tweens — the class and which face owns the pointer —
  // are not part of that, so they are stated here.
  function applyMode(portrait) {
    const st = tl.scrollTrigger;
    if (st) {
      if (portrait) st.disable(true);
      else st.enable();
    }
    if (!portrait) return;
    swapped = false;
    stage.classList.remove('is-wpkoi');
    next.inert = true;
    next.setAttribute('aria-hidden', 'true');
    if (now) now.inert = false;
  }

  applyMode(isPortrait());
  onLayoutMode(applyMode);
}
