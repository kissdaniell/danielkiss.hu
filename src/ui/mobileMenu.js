import { ScrollSmoother } from 'gsap/ScrollSmoother';

import { isPortrait, onLayoutMode } from '../utils/layout.js';
import { onViewportResize } from '../utils/viewport.js';

// The way into the sidebar when there is no sidebar.
//
// Below 4:3 the panel stops being a column and becomes a sheet that arrives
// from the top. The arrival itself is CSS — a transform and a transition, so
// it costs the compositor and nothing else (see the portrait block at the
// foot of styles/sidebar.css). This is the part that cannot be: what the
// button says, what is reachable while the sheet is shut, and the fact that
// the page underneath must not scroll out from under it.
//
// Nothing here runs above the boundary. The button is not rendered there and
// the panel is a column again, so the whole module is inert — but it stays
// subscribed, because a window dragged across the boundary with the sheet
// open has to put everything back.

// How long the sheet takes to leave, matching the transition in the
// stylesheet. Only the closing needs a number in JavaScript: the class that
// carries the transition has to outlive the class that carries the state, or
// the panel would blink out of existence on the first frame instead of
// sliding.
const CLOSE_MS = 600;

// The flattest a portrait may be drawn before it is withdrawn instead.
//
// The box is a share of the sheet's width by whatever vertical room the
// column has left, so a short window flattens it — and a face cropped to a
// letterbox is not a photograph of anyone, it is a band. Five to three is the
// point where it stops reading as a portrait at all.
const PORTRAIT_FLATTEST = 5 / 3;

export function initMobileMenu() {
  const toggle = document.querySelector('.topbar-toggle');
  const menu = document.querySelector('.site-sidebar');
  if (!toggle || !menu) return;

  const label = toggle.querySelector('.topbar-toggle-label');
  const photo = document.querySelector('.sidebar-photo-wrap');
  let open = false;
  let closeTimer = null;

  function setOpen(next) {
    if (next === open) return;
    open = next;

    clearTimeout(closeTimer);
    if (open) {
      menu.classList.remove('is-closing');
      menu.classList.add('is-open');
    } else {
      menu.classList.add('is-closing');
      menu.classList.remove('is-open');
      closeTimer = setTimeout(() => menu.classList.remove('is-closing'), CLOSE_MS);
    }

    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (label) label.textContent = open ? 'CLOSE' : 'MENU';

    // The sheet covers the page, so the page should not answer the wheel
    // behind it. ScrollSmoother owns the scroll here; asking it to pause is
    // the only way to stop it that does not also move it.
    const smoother = ScrollSmoother.get();
    if (smoother) smoother.paused(open);

    applyReach();
    // Asked again here, and this is the call that actually decides it. The
    // photograph's box is whatever the column has left over once the name has
    // been fitted to the sheet's width — and that fitting waits on the display
    // face, which arrives well after this module has finished starting up. A
    // measurement taken at init is therefore a measurement of a layout that no
    // longer exists by the time anyone opens the sheet; only a resize used to
    // put it right, which is why the first opening always showed a portrait
    // the second one knew better than to.
    applyPhotoShape();
  }

  // Out of the tab order and off the accessibility tree whenever it is a
  // closed sheet — the same treatment ui/sidebarWpkoi.js gives the face of
  // the panel that is not showing, and for the same reason: a link at
  // visibility:hidden is still a link a keyboard can land on.
  //
  // Above the boundary it is a column that is always on screen, so it is
  // never inert there, whatever the sheet's own flag happens to say.
  function applyReach() {
    menu.inert = isPortrait() && !open;
  }

  // ---- Whether the photograph has a shape to be in.
  //
  // Measured rather than asked of a media query, because the answer is not
  // about the window: it is about what the column had left over once
  // everything above and below the photograph had taken its share, which is
  // the sort of thing only the box itself knows. See .sidebar-photo-wrap in
  // the portrait block of the stylesheet for what the class does.
  //
  // The class is left alone above the boundary — nothing up there reads it,
  // and the wide layout's own box is never this shape.
  function applyPhotoShape() {
    if (!photo) return;
    if (!isPortrait()) {
      photo.classList.remove('is-letterboxed');
      return;
    }
    // Its own box, not the rect: the rect is what the wide layout's assembly
    // tweens, and there is no assembly here — but offsetWidth/Height are the
    // laid-out box either way, and free of whatever transform an interrupted
    // one might have left behind.
    const { offsetWidth: width, offsetHeight: height } = photo;
    photo.classList.toggle('is-letterboxed', height > 0 && width / height > PORTRAIT_FLATTEST);
  }

  toggle.addEventListener('click', () => setOpen(!open));

  // Every link in the panel is a scroll to somewhere on the page behind it
  // (ui/sidebarNav.js does the scrolling), so the sheet has said its piece by
  // the time the movement starts.
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a[href^="#"]')) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) setOpen(false);
  });

  onLayoutMode((portrait) => {
    if (portrait) {
      applyReach();
      applyPhotoShape();
      return;
    }

    // Back to the wide layout: the panel is a column again and none of the
    // sheet's state means anything up there. Cleared outright rather than
    // through setOpen, because a closing *animation* is exactly what must not
    // happen — the element the classes describe has already stopped being a
    // sheet.
    open = false;
    clearTimeout(closeTimer);
    menu.classList.remove('is-open', 'is-closing');
    // Removing the classes takes the transition away, which is enough for a
    // sheet that has finished moving. One caught mid-slide is a running
    // animation with a resolved end value of its own, and it would go on
    // sliding a column that is no longer a sheet — so it is cancelled
    // outright rather than left to land.
    menu.getAnimations().forEach((animation) => animation.cancel());
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    if (label) label.textContent = 'MENU';
    const smoother = ScrollSmoother.get();
    if (smoother) smoother.paused(false);
    applyReach();
    applyPhotoShape();
  });

  applyReach();
  applyPhotoShape();
  onViewportResize(applyPhotoShape);
  // ...and once the face has landed and the name has been refitted around it.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(applyPhotoShape);
}
