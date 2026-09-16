// Making SplitText's own accessibility fix a legal one.
//
// GSAP's SplitText defaults to aria: "auto", which is the right instinct: it
// puts an aria-label carrying the original sentence on the element it is
// about to shred, and aria-hidden on every piece it shreds it into. Without
// that, a heading split into characters is read out one letter at a time.
//
// The trouble is where it puts the label. aria-label is prohibited on roles
// that have no accessible name of their own to override — `generic` (a bare
// <span> or <div>) and `paragraph` (a <p>) among them — so the attribute is
// ignored by some assistive technology and flagged by every auditor. The
// sentence is preserved in the markup and announced by nobody.
//
// role="img" is the standard way out: it makes the element a single opaque
// node, which is exactly what a line of type scattered into fifty animated
// boxes has become, and it is a role that takes a name. The label GSAP
// already wrote then means something.
//
// Done here, in one pass, rather than authored into index.html: the role has
// to arrive with the label, not before it. An element carrying role="img"
// while it is still plain text — the window between first paint and the
// section initialising — is an image with no accessible name, which is worse
// than what we started with.

// The tags whose implicit role cannot take a name. Anything else that comes
// back from the query — a <a>, a <button>, an <img> — either has a real role
// already or was labelled deliberately by hand, and is left alone.
const NAMELESS = new Set(['SPAN', 'DIV', 'P']);

export function fixSplitAria(root = document) {
  root.querySelectorAll('[aria-label]:not([role])').forEach((el) => {
    if (!NAMELESS.has(el.tagName)) return;
    // SplitText's fingerprint: it hides the pieces it just created. Without
    // this an element that was labelled by hand, and reads correctly as it
    // is, would be turned into an image for no reason.
    if (!el.querySelector('[aria-hidden="true"]')) return;
    el.setAttribute('role', 'img');
  });
}
