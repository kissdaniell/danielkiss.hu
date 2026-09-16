// Which of the page's two layouts is in force, and one place that says so.
//
// Everything above 4:3 is the composition this page was drawn for: a fixed
// column down the right-hand side that the opening frame assembles into, and
// a content column beside it. Below 4:3 there is no room for a column beside
// anything — the sidebar stops being a sidebar, the assembly that produces it
// stops running, and what it holds is put behind a hamburger instead (see
// ui/mobileMenu.js and the portrait block at the foot of styles/sidebar.css).
//
// The boundary is a media query rather than a ratio worked out from
// innerWidth and innerHeight, and that is deliberate: the stylesheet asks the
// same question, and the two have to give the same answer at the moment they
// are both asked. A media query and a hand-rolled ratio disagree by exactly
// the scrollbar's width, which is the difference between the sidebar being
// laid out and its content sitting behind a menu button.
//
// 4:3 itself belongs to the wide side, matching the 4:3-to-5:3 band in
// styles/wpkoi.css that treats it as the last of the landscape shapes.
const PORTRAIT = '(aspect-ratio < 4/3)';

const query = window.matchMedia(PORTRAIT);
const listeners = new Set();

let portrait = query.matches;

// On the root element from the first style resolution, so a stylesheet or a
// selector that wants to ask in a place a media query cannot reach — inside
// another query, or as part of a compound selector — has an answer that is
// never a frame behind the one above.
document.documentElement.classList.toggle('is-portrait', portrait);

export function isPortrait() {
  return portrait;
}

// Called when the page crosses between the two, before anything re-measures.
export function onLayoutMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Re-read the boundary and, if it moved, tell everyone who asked.
//
// Driven from the shared viewport pass (utils/viewport.js) rather than from
// this module's own matchMedia listener, for the same reason every other
// re-measure on this page is: a change of layout mode is the largest
// re-measure there is, and it has to happen inside the one ordered pass, not
// beside it. Returns whether it changed, which is what tells that pass to put
// the reader back at the top rather than trying to hold their place — the two
// layouts have no scroll positions in common.
export function refreshLayoutMode() {
  const next = query.matches;
  if (next === portrait) return false;

  portrait = next;
  document.documentElement.classList.toggle('is-portrait', portrait);
  listeners.forEach((fn) => {
    try {
      fn(portrait);
    } catch (error) {
      console.error('[layout] mode listener failed', error);
    }
  });
  return true;
}
