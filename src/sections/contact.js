import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { SplitText } from 'gsap/SplitText';
import { ScrollSmoother } from 'gsap/ScrollSmoother';

import '../styles/contact.css';
import { dpx, onViewportResize } from '../utils/viewport.js';
import { isPortrait, onLayoutMode } from '../utils/layout.js';
import { liveGlitchLoop, liveJitter } from '../utils/motion.js';
import { onScrollFrame } from '../utils/scrollFrame.js';
import { GALLERY_IMAGES, GALLERY_SRCSET } from '../utils/galleryImages.js';
import { fx } from '../utils/filters.js';

// The closing frame: a field of photographs bigger than the viewport that
// the reader can shove around, with the address and the drag hint sitting on
// opaque panels over it.
//
// The grid is built to fit the viewport rather than declared at a fixed size
// — enough columns and rows to overrun the frame by OVERSCAN in both
// directions, so there is always somewhere left to drag no matter the window.
// Which photograph lands in which cell is drawn from a shuffled bag that
// refills as it empties, so the same handful of images reads as a random
// field rather than a repeating wallpaper; adding more to
// utils/galleryImages.js needs no change here.

// How far past the viewport the field extends, per axis.
const OVERSCAN = 1.6;
// Tile size and gap at the 1520x703 reference; dpx() puts them on the
// page's scale (see utils/viewport.js), the way a rem would in the CSS.
const TILE_SIZE = 208;
// Roughly a tenth of the tile, which is the air the reference demo gives
// its grid — tighter than that and the field reads as one sheet rather than
// as a wall of separate pictures.
const TILE_GAP = 20;

function shuffled(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function initContact() {
  const section = document.querySelector('#contact');
  const field = document.querySelector('.contact-field');
  const grid = document.querySelector('.contact-grid');
  if (!section || !field || !grid || !GALLERY_IMAGES.length) return;

  // The passage above this section. Everything that has to happen *before*
  // the closing frame lands — the sidebar leaving, the field assembling — is
  // scrubbed against it rather than against #contact, which by definition
  // arrives too late to be an entrance.
  const transition = document.querySelector('#transition');

  const card = document.querySelector('.contact-card');
  const headingAccent = document.querySelector('.contact-heading-line--accent');
  const headingLight = document.querySelector('.contact-heading-line--light');
  const underline = document.querySelector('.contact-heading-underline-stroke');
  const underlineSvg = document.querySelector('.contact-heading-underline');
  const email = document.querySelector('.contact-email');
  const dragHint = document.querySelector('.contact-drag');
  const dragArrow = document.querySelector('.contact-drag-arrow');

  let draggable = null;
  let assembly = null;
  // Kept from the last build so the assembly can tell which side of the
  // field a tile belongs to.
  let gridCols = 0;

  // The photographs fall into place across the passage above rather than
  // simply being there when the closing frame arrives: each tile drops in
  // from above its own slot, tilted and turned away, and squares up as it
  // lands. Row by row, because the stagger follows DOM order and the grid is
  // laid out row-major — so it reads as a curtain coming down.
  //
  // Rebuilt with the grid, since a resize throws away every tile it targets.
  function buildAssembly() {
    if (assembly) {
      if (assembly.scrollTrigger) assembly.scrollTrigger.kill();
      assembly.kill();
    }
    if (!transition) return;

    const tiles = Array.from(grid.children);
    if (!tiles.length) return;

    assembly = gsap.fromTo(
      tiles,
      {
        // Function-based, so every tile gets its own approach rather than the
        // whole grid moving as one sheet. Mostly inward from the sides —
        // each tile comes from whichever edge of the field it belongs to —
        // with only a little height on it, so the wall closes in rather than
        // dropping.
        x: (i) => {
          const fromLeft = gridCols ? (i % gridCols) < gridCols / 2 : Math.random() < 0.5;
          const distance = dpx(gsap.utils.random(320, 820));
          return fromLeft ? -distance : distance;
        },
        y: () => -dpx(gsap.utils.random(120, 320)),
        rotate: () => gsap.utils.random(-24, 24),
        rotationY: (i) => (gridCols && (i % gridCols) < gridCols / 2 ? 45 : -45),
        rotationX: () => gsap.utils.random(-30, -10),
        transformPerspective: 900,
        scale: 0.82,
        opacity: 0,
      },
      {
        x: 0,
        y: 0,
        rotate: 0,
        rotationX: 0,
        rotationY: 0,
        scale: 1,
        opacity: 1,
        ease: 'none',
        stagger: { amount: 0.55, from: 'start' },
        scrollTrigger: {
          trigger: transition,
          start: 'top 30%',
          // The passage's bottom edge reaching the top of the screen is the
          // moment the closing frame fills it — the field finishes assembling
          // exactly as it becomes the whole picture.
          end: 'bottom top',
          scrub: 0.6,
        },
      },
    );
  }


  // Pulls from a shuffled bag rather than picking at random per cell: a bag
  // guarantees every image appears about equally often, and skipping a draw
  // that matches the cell to the left or above keeps identical shots from
  // touching — which is what makes ten images read as a field rather than a
  // pattern.
  function fillGrid(cols, rows) {
    const total = cols * rows;
    const chosen = new Array(total);
    let bag = [];

    for (let i = 0; i < total; i++) {
      const left = i % cols === 0 ? null : chosen[i - 1];
      const above = i < cols ? null : chosen[i - cols];

      if (!bag.length) bag = shuffled(GALLERY_IMAGES);
      let pick = bag.findIndex((src) => src !== left && src !== above);
      if (pick === -1) pick = 0;
      chosen[i] = bag.splice(pick, 1)[0];
    }
    return chosen;
  }

  function build() {
    const viewWidth = field.clientWidth;
    const viewHeight = field.clientHeight;

    // Tile geometry is settled here rather than in the stylesheet, and handed
    // to it as custom properties. The column count has to be worked out
    // against real pixels, and a rem authored in CSS reads back from
    // getComputedStyle as "13rem" rather than a length — so the two would
    // have had to agree on the same number in two places. dpx() keeps these
    // on the page's scale exactly as a rem would.
    const tile = dpx(TILE_SIZE);
    const gap = dpx(TILE_GAP);
    const step = tile + gap;

    const cols = Math.max(2, Math.ceil((viewWidth * OVERSCAN) / step));
    const rows = Math.max(2, Math.ceil((viewHeight * OVERSCAN) / step));
    gridCols = cols;

    grid.style.setProperty('--contact-cols', String(cols));
    grid.style.setProperty('--contact-tile', `${tile}px`);
    grid.style.setProperty('--contact-gap', `${gap}px`);
    grid.innerHTML = '';

    const sources = fillGrid(cols, rows);
    const fragment = document.createDocumentFragment();
    // `tile` is already this grid's cell in real pixels — the same number the
    // columns are laid out with — so the tiles can say exactly what box they
    // are filling and take the 95 or 190 export instead of the 300 every one
    // of them was pulling. No measuring: the figure is in hand.
    const tileSizes = `${Math.round(tile)}px`;

    sources.forEach((src) => {
      const tileEl = document.createElement('div');
      tileEl.className = 'contact-tile';
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.loading = 'lazy';
      // srcset before src, so the candidate is picked once.
      const srcset = GALLERY_SRCSET.get(src);
      if (srcset) {
        img.srcset = srcset;
        img.sizes = tileSizes;
      }
      img.src = src;
      tileEl.appendChild(img);
      fragment.appendChild(tileEl);
    });
    grid.appendChild(fragment);

    const gridWidth = cols * step - gap;
    const gridHeight = rows * step - gap;

    // Starts centred, so the first thing seen is the middle of the field
    // rather than its corner, and there is room to drag every way.
    gsap.set(grid, { x: (viewWidth - gridWidth) / 2, y: (viewHeight - gridHeight) / 2 });

    buildAssembly();

    if (draggable) draggable.kill();
    draggable = Draggable.create(grid, {
      type: 'x,y',
      // The grid moves, but the press happens on the closing section: the
      // field the grid lives in is fixed behind #smooth-wrapper, and a
      // pointer never reaches behind that — whatever is in the wrapper is
      // always hit first. Draggable is built for exactly this split.
      trigger: section,
      // Bounds as an object rather than an element: the grid is bigger than
      // the field, so what is being constrained is how far its edges may
      // come inside the frame — never far enough to show the page behind it.
      bounds: { minX: viewWidth - gridWidth, maxX: 0, minY: viewHeight - gridHeight, maxY: 0 },
      edgeResistance: 0.85,
      inertia: true,
      // Draggable lifts its target to z-index 1000 on press by default and
      // never puts it back. The grid lives inside the field, and the field's
      // vignette is a pseudo-element on top of it — so one press pushed the
      // grid over the vignette and the edges stayed bright for good.
      zIndexBoost: false,
      // The panels over the field are pointer-events:none so a drag can
      // start on top of them; the email button inside opts back in, and
      // this keeps its click from being swallowed as a drag.
      dragClickables: false,
      onPress: () => section.classList.add('is-dragging'),
      onRelease: () => section.classList.remove('is-dragging'),
    })[0];

    applyTouchGate();
  }

  // ---- The field, and the last screen of the page it is standing on.
  //
  // A finger and a mouse are asking for different things here. The field
  // fills the closing frame and the press that moves it is a drag in both
  // directions at once, so Draggable takes the browser's own touch handling
  // away from this section entirely — which on a handset means a reader who
  // has not yet reached the foot of the page cannot get there: every swipe
  // over the closing frame moves the photographs instead. A mouse has a wheel
  // and never had the problem.
  //
  // So where the pointer is coarse, the field is not draggable at all until
  // there is nothing left to scroll. Switched off outright rather than
  // refused press by press: a Draggable that is listening has already claimed
  // the gesture by the time it could decide it did not want it — it has
  // called preventDefault on the touch that started it, and the browser has
  // stopped offering that touch to the page. Handing the press back after
  // that leaves the reader with a swipe that did nothing at all, which is
  // exactly the stretch near the bottom where scrolling seemed to stick.
  //
  // Nothing is gated where the pointer is fine. There is a wheel there, the
  // field has never been in its way, and a laptop with a touchscreen still
  // reports a fine pointer as its primary one.
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  let atBottom = false;

  function applyTouchGate() {
    const gated = coarsePointer.matches && !atBottom;
    if (draggable) draggable.enabled(!gated);
    // Stated either way rather than left to whatever Draggable's own enable
    // and disable happen to write: `pan-y` gives the vertical gesture back to
    // the browser and takes nothing else away, and `none` is what a two-axis
    // drag needs once the field really is the thing being touched.
    section.style.touchAction = gated ? 'pan-y' : 'none';
  }

  // Two pixels rather than zero: the smoothed scroll settles onto its own
  // maximum asymptotically, and a reader who is at the bottom by every
  // measure that matters can sit a fraction of a pixel short of it forever.
  const BOTTOM_SLACK = 2;

  onScrollFrame((scrollY, maxScroll) => {
    const next = maxScroll - scrollY <= BOTTOM_SLACK;
    if (next === atBottom) return;
    atBottom = next;
    applyTouchGate();
  });

  // A tablet docked to a mouse, or the reverse. Rare, and cheap to answer.
  if (coarsePointer.addEventListener) coarsePointer.addEventListener('change', applyTouchGate);

  build();
  onViewportResize(build);

  // ---- ...and the way back up.
  const toTop = document.querySelector('.contact-top');
  if (toTop) {
    toTop.addEventListener('click', () => {
      const smoother = ScrollSmoother.get();
      // Through the smoother, for the reason ui/sidebarNav.js gives about its
      // own links: it owns the page's scroll, and a native scroll past it
      // arrives without the transform it applies.
      if (smoother) smoother.scrollTo(0, true);
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Whatever is outside the frame is dimmed, and lifts as it is dragged into
  // view — the reference demo's one really good idea, and what gives the
  // field its depth while it is being pushed around. It rides the image
  // rather than the tile on purpose: the tile's own opacity belongs to the
  // assembly above, and two things easing the same property would fight.
  const frameObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const image = entry.target.querySelector('img');
        if (!image) return;
        gsap.to(image, {
          opacity: entry.isIntersecting ? 1 : 0.12,
          duration: 0.6,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      });
    },
    { threshold: 0.12 },
  );

  function observeTiles() {
    frameObserver.disconnect();
    Array.from(grid.children).forEach((tile) => frameObserver.observe(tile));
  }

  observeTiles();
  onViewportResize(observeTiles);


  // Same belt-and-suspenders as the other headings: hide the underline via
  // the SVG wrapper's opacity (the path's own glitch keyframes cycle
  // opacity, so an inline style on the path itself would lose to them) and
  // drive the dash offset so it draws itself on.
  if (underline && underlineSvg) {
    gsap.set(underlineSvg, { opacity: 0 });
    const length = underline.getTotalLength() + 8;
    gsap.set(underline, { strokeDasharray: length, strokeDashoffset: length });
  }

  // ---- The sidebar takes its leave.
  //
  // It assembled out of the hero at the top of the page (heroTransition.js);
  // here it comes apart again and drifts off the right edge, one piece at a
  // time. Scrubbed rather than played once, like everything else on the
  // page: scrolling back up reassembles it, which is the only sane thing for
  // a reader who leaves and returns — a one-way exit would strand the page
  // without a sidebar for the rest of the session.
  //
  // ---- Sharing the column with the assembly.
  //
  // heroTransition.js's timeline writes on four of these same elements, and
  // for a long time the two got along by accident: its range ends a whole
  // page above this one and it holds its own values steady from there, so
  // whichever of the two rendered last happened to be writing the same
  // numbers anyway.
  //
  // It stops being an accident the moment a reader crosses both ranges in one
  // movement — the nav's Introduce link from the bottom of the page, End then
  // Home, or the scroll restore that follows a resize. Both timelines are
  // then scrubbing at once, both are writing, and whichever settles last owns
  // the properties they share. When that was this one, the opening frame came
  // back with the name at four times its size sitting at the sidebar's own
  // corner, half off the screen, and stayed there: the assembly had already
  // finished and had no reason to write again.
  //
  // So the overlap is removed rather than arbitrated. GSAP keeps x, xPercent,
  // y, yPercent, rotation and scale as separate entries in one transform
  // cache and composes them at render, so a translate expressed as a
  // percentage is a channel of its own — this drifts in percentages, the
  // assembly flips in pixels, and the two add up instead of overwriting each
  // other. The brand stack drops out of the list (the assembly has already
  // collapsed it to nothing and faded it out by the time this runs — there is
  // no piece there to fly away, only a fade to fight over), and the address
  // is drifted by the slot around it rather than by the button the assembly
  // fades. Nothing here writes a property the assembly also writes.
  //
  // Percentages are also the resize-proof form of the same distances, which
  // this timeline — built once, never rebuilt — quietly needed: dpx() was
  // read at page load and never again.
  const sidebar = document.querySelector('.site-sidebar');
  const sidebarParts = Array.from(document.querySelectorAll('.site-sidebar > *'))
    .filter((el) => el.tagName !== 'H1' && !el.classList.contains('sidebar-stack'));

  if (sidebarParts.length) {
    const exit = gsap.timeline({
      scrollTrigger: {
        // Starts on the passage above and finishes on this section, so the
        // sidebar has the whole transition to come apart in rather than the
        // sliver of scroll between the two frames.
        trigger: transition || section,
        start: transition ? 'top 75%' : 'top bottom',
        endTrigger: section,
        end: 'top 30%',
        scrub: 0.6,
        // Gone means gone, including to the pointer.
        //
        // These pieces leave by drifting off the right of the frame at
        // opacity 0 — and a transparent element is still an element the
        // pointer lands on. The column they belong to is fixed, sits above
        // everything in the smooth wrapper, and by the end of the drift they
        // are lying across the corner of the closing frame where the way back
        // up is: the right-hand end of that button was being pressed by a
        // photograph nobody can see. Withdrawn as a class rather than tweened,
        // because pointer-events has no in-between worth animating.
        onUpdate: (self) => sidebar && sidebar.classList.toggle('is-gone', self.progress > 0.8),
        onToggle: (self) => sidebar && sidebar.classList.toggle('is-gone', self.progress > 0.8),
        onRefresh: (self) => sidebar && sidebar.classList.toggle('is-gone', self.progress > 0.8),
      },
    });
    exit.to({}, { duration: 1 }, 0);

    sidebarParts.forEach((el, i) => {
      // The same travel the pixel version asked for, restated against each
      // piece's own box. Guarded because a percentage of nothing is nothing:
      // an element that measures zero keeps its authored offset rather than
      // silently not moving.
      const width = el.offsetWidth || 1;
      const height = el.offsetHeight || 1;
      exit.to(el, {
        xPercent: (dpx(gsap.utils.random(140, 340)) / width) * 100,
        yPercent: (dpx(gsap.utils.random(-170, 170)) / height) * 100,
        rotate: gsap.utils.random(-16, 16),
        opacity: 0,
        filter: fx(12),
        ease: 'none',
        duration: 0.45,
      }, 0.1 + i * 0.055);
    });

    // ---- ...and it stays put below 4:3.
    //
    // There is nothing to come apart: the panel is a sheet behind a button
    // there, and a reader who opens it at the foot of the page should find it
    // whole rather than scattered off the right edge of a screen it no longer
    // has one of. Disabled with a revert, so the trigger hands back
    // everything it had written.
    const applyMode = (portrait) => {
      const st = exit.scrollTrigger;
      if (!st) return;
      if (portrait) {
        st.disable(true);
        // A revert hands back the properties the trigger tweened; the class it
        // toggles is not one of them.
        if (sidebar) sidebar.classList.remove('is-gone');
      } else {
        st.enable();
      }
    };
    applyMode(isPortrait());
    onLayoutMode(applyMode);
  }

  document.fonts.load('400 64px "Anton"').then(() => {
    const splitAccent = headingAccent ? new SplitText(headingAccent, { type: 'chars' }) : null;
    const splitLight = headingLight ? new SplitText(headingLight, { type: 'chars' }) : null;

    const scatter = (split) => {
      if (!split) return;
      split.chars.forEach((char) => {
        gsap.set(char, {
          x: dpx(gsap.utils.random(-46, 46)),
          y: dpx(gsap.utils.random(-26, 26)),
          rotate: gsap.utils.random(-16, 16),
          filter: fx(10),
          opacity: 0,
        });
      });
    };
    scatter(splitAccent);
    scatter(splitLight);

    // Opacity and blur only — no scale. Draggable works out its bounds in
    // the grid's own coordinate space, and a scaled ancestor puts those
    // pixels and the pointer's on slightly different rulers: the field
    // settled a few pixels past its own edge, which is the page showing
    // through at the seam.
    // No opacity fade on the field itself any more: the tiles falling into
    // it *are* the entrance, and fading the whole thing in on top of that
    // only muddied it.
    if (card) gsap.set(card, { opacity: 0, y: dpx(20), filter: fx(8) });
    if (email) gsap.set(email, { opacity: 0, y: dpx(12) });
    if (dragHint) gsap.set(dragHint, { opacity: 0, x: dpx(-24), filter: fx(6) });

    // Ends at 'top 30%' rather than 'top top': nothing pins here, so the
    // section keeps rising after its top edge lands, and a reveal that
    // finished at the top edge would have played out while most of the
    // frame was still below the fold.
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        end: 'top 30%',
        scrub: 0.35,
      },
    });

    // Filler tween so the timeline's natural duration is the full 0..1 the
    // scrub maps onto — without it every position label below would fire
    // early, scaled by 1/(end of the last real tween).
    tl.to({}, { duration: 1 }, 0);

    const settle = { x: 0, y: 0, rotate: 0, filter: fx(0), opacity: 1, ease: 'none' };

    if (card) {
      tl.to(card, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.16 }, 0.42);
    }
    if (splitAccent) {
      tl.to(splitAccent.chars, { ...settle, duration: 0.14, stagger: 0.014 }, 0.48);
    }
    if (splitLight) {
      tl.to(splitLight.chars, { ...settle, duration: 0.14, stagger: 0.012 }, 0.58);
    }
    if (underlineSvg) {
      tl.to(underlineSvg, { opacity: 1, ease: 'none', duration: 0.08 }, 0.7);
    }
    if (underline) {
      tl.to(underline, { strokeDashoffset: 0, ease: 'none', duration: 0.1 }, 0.7);
    }
    if (email) {
      tl.to(email, { opacity: 1, y: 0, ease: 'none', duration: 0.1 }, 0.78);
    }
    if (dragHint) {
      tl.to(dragHint, { opacity: 1, x: 0, filter: fx(0), ease: 'none', duration: 0.1 }, 0.86);
    }

    if (splitAccent) liveGlitchLoop(splitAccent.chars);
    liveJitter(dragArrow);
  });
}
