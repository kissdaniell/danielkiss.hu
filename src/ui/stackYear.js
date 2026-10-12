// The year on the brand stack — "INDEX - PORTFOLIO / 2026" — put right at
// run time rather than at build time.
//
// A portfolio that is not redeployed for a while is the normal case, not the
// exception, and a dateline that has quietly gone a year stale says something
// about the site that nothing else on the page does. The markup carries the
// year it was built with, which is what a reader without JavaScript and a
// crawler both get; this corrects it in the reader's own clock.
//
// Written before anything measures the line: the stack is one of the pieces
// ui/heroTransition.js flips from the opening frame's header into the
// sidebar, and it measures the element's width to do it. Four digits are four
// digits, so the two years are the same width in any case — but the write
// costs nothing and the ordering is one less thing to be true by luck.
export function initStackYear() {
  const slot = document.querySelector('.sidebar-stack-year');
  if (!slot) return;

  const year = String(new Date().getFullYear());
  // Only when it has actually moved on: an unconditional write would dirty
  // the text node on every load for the eleven months of the year when the
  // markup is already right.
  if (slot.textContent.trim() !== year) slot.textContent = year;
}
