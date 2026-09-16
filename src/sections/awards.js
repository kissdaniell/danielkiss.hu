import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

import '../styles/awards.css';
import { dpx, onViewportResize } from '../utils/viewport.js';
import { liveGlitchLoop, liveJitter } from '../utils/motion.js';
import { fx } from '../utils/filters.js';

// The certificates orbit an ellipse whose centre sits at the bottom of the
// frame, so what the reader sees is the arc across the top: a card rises in
// from one side, passes the top upright, and leans away out of the other —
// then spends the rest of its turn below the frame, coming round again.
//
// An ellipse rather than a circle, and that is the whole trick: on a circle
// wide enough to spread the cards across the column, the top of the arc
// would sit far higher than a viewport-height section has room for. Squashing
// the vertical radius keeps the sweep as wide as the column while the arc
// stays shallow.
//
// Whatever certificates the markup carries, spread at one even step apiece,
// is what makes the loop seamless — the gaps between them are identical, so
// there is no seam to come round, and nothing to reset. The two-thirds of the
// ring that is off-frame at any moment costs nothing but a transform write
// per card per frame. The step is taken from the cards themselves rather than
// written down here, so a certificate arriving or leaving the list is a
// change to index.html and nothing else.

// One full turn in ~48s. Slow enough to read as drift rather than a carousel
// that wants attention, quick enough that a new certificate arrives every
// five or six seconds.
const ANGULAR_SPEED = (Math.PI * 2) / 48;
// Ellipse, as fractions of the orbit's own box. The centre sits well inside
// the box rather than on its bottom edge, so the arc's lower half is
// something the reader sees a little of before the mask takes it — and so
// the Awards mark, which rides that centre, is nowhere near the clip line.
const RADIUS_X_RATIO = 0.4;
// Re-derived when the orbit box grew from 40rem to 44rem: both of these put
// the ellipse at exactly the same pixels it sat at before, so the whole of
// the added height became visible lower half rather than moving the arc.
const RADIUS_Y_RATIO = 0.409;
// Low enough in the box that the arc's flanks stay clear of the list of
// names in the top-left corner: the certificates climbing the left side are
// what would otherwise run through it.
const CENTER_Y_RATIO = 0.746;
// Cards lean with the arc, but at less than the full tangent — a card at the
// side tips about 70 degrees rather than 90, which reads as scattered rather
// than as spokes on a wheel.
const LEAN_RATIO = 0.78;

// The ring arrives spinning and slows into its resting drift, the same
// entrance the portfolio strip makes. Without it the certificates were simply
// already turning when you got to them, which is a state rather than an
// arrival — and at one revolution in 48 seconds, slow enough that a reader
// could look at the section and not notice it moved at all.
//
// A multiplier on the resting speed, and a time constant for giving it up:
// seven turns the ring in about seven seconds at the moment it lands, and by
// three seconds later it is back to a drift.
const SPIN_BOOST = 7;
const SPIN_SETTLE = 0.9;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function initAwards() {
  const section = document.querySelector('#awards');
  const orbit = document.querySelector('.awards-orbit');
  const ring = document.querySelector('.awards-ring');
  if (!section || !orbit || !ring) return;

  const creditsTitle = document.querySelector('.awards-credits-title');
  const cards = Array.from(ring.querySelectorAll('.awards-card'));
  // See the note at the top: one even step per certificate, whatever the
  // markup holds, is what leaves the ring without a seam.
  const cardStep = (Math.PI * 2) / (cards.length || 1);

  // What each filter falls to at the sides of the arc, reached at 1 by the
  // card facing the reader.
  const CARD_MIN_SATURATION = 0.15;
  const CARD_MIN_BRIGHTNESS = 0.72;
  const CARD_MIN_CONTRAST = 0.9;
  const grade = (min, facing) => (min + (1 - min) * facing).toFixed(3);

  if (!cards.length) return;

  const headingLight = document.querySelector('.awards-heading-line--light');
  const headingAccent = document.querySelector('.awards-heading-line--accent');
  const underline = document.querySelector('.awards-heading-underline-stroke');
  const underlineSvg = document.querySelector('.awards-heading-underline');
  const badge = document.querySelector('.awards-badge');
  const badgeArrow = document.querySelector('.awards-badge-arrow');
  const list = document.querySelector('.awards-list');
  const listItems = list ? Array.from(list.children) : [];

  let centerX = 0;
  let centerY = 0;
  let radiusX = 0;
  let radiusY = 0;
  let cardWidth = 0;
  let cardHeight = 0;

  // Two of the ellipse's four numbers, askable from the stylesheet.
  //
  // The ratios above describe a shape drawn for a wide frame: a vertical
  // radius taken from the box's own height, which upright is the one
  // dimension there is plenty of — so the same three constants that make a
  // shallow sweep across a desktop make an upright oval on a phone, and the
  // arc stands on end. What the shape actually wants to be stated against
  // there is its own width, and where its centre sits is a separate question
  // again (see the portrait block in styles/awards.css, which has to keep the
  // arc clear of the list of names above it).
  //
  // Absent, both fall back to the constants, so the wide layout is measured
  // by exactly the arithmetic it always was.
  function knob(name) {
    const value = parseFloat(getComputedStyle(orbit).getPropertyValue(name));
    return Number.isFinite(value) ? value : null;
  }

  function measure() {
    const width = orbit.clientWidth;
    const height = orbit.clientHeight;
    const centerRatio = knob('--awards-center-ratio');
    // How many times wider than tall the ellipse is asked to be. Stated
    // against the horizontal radius rather than as a ratio of the box,
    // because flatness is a relation between the two radii and nothing else.
    const flatten = knob('--awards-flatten');

    centerX = width / 2;
    centerY = height * (centerRatio === null ? CENTER_Y_RATIO : centerRatio);
    radiusX = width * RADIUS_X_RATIO;
    radiusY = flatten === null || flatten <= 0 ? height * RADIUS_Y_RATIO : radiusX / flatten;
    cardWidth = cards[0].offsetWidth;
    cardHeight = cards[0].offsetHeight;

    // The Awards mark is positioned off this in the stylesheet — one number,
    // written once, rather than a ratio repeated in two languages.
    orbit.style.setProperty('--awards-center-y', `${centerY}px`);
  }

  let angle = 0;
  // Multiplier on ANGULAR_SPEED, decaying back to 1. See SPIN_BOOST.
  let spin = SPIN_BOOST;
  // -1 so the first pass always writes the class, whichever card leads.
  let activeAward = -1;

  // The second argument gsap.ticker hands its listeners is milliseconds
  // since the last tick — the first is total elapsed *seconds*, which is
  // not a performance.now() timestamp and must not be treated as one.
  // Taking GSAP's own delta rather than keeping a clock here also means the
  // ring advances on exactly the time base every tween on the page uses.
  // Clamped so coming back to a backgrounded tab doesn't arrive as half a
  // revolution in a single frame.
  function render(_time, deltaMs) {
    if (!visible) return;

    const dt = clamp((deltaMs || 0) / 1000, 0, 0.05);
    spin += (1 - spin) * (1 - Math.exp(-dt / SPIN_SETTLE));
    angle += ANGULAR_SPEED * spin * dt;

    let frontIndex = 0;
    let frontMost = -Infinity;

    cards.forEach((card, i) => {
      const theta = angle + i * cardStep;
      // Wrapped into (-PI, PI] so the lean is symmetric about the top of the
      // arc and a card crossing the bottom doesn't spin through a full turn
      // on its way past.
      const wrapped = Math.atan2(Math.sin(theta), Math.cos(theta));
      const x = centerX + radiusX * Math.sin(wrapped) - cardWidth / 2;
      const y = centerY - radiusY * Math.cos(wrapped) - cardHeight / 2;

      // 1 at the top of the arc, -1 at the bottom: how much of the card is
      // facing the reader, and the basis for everything below.
      const front = Math.cos(wrapped);
      // Holds most of its strength through the sides and only gives out once
      // the card has swung below the ellipse's centre — which is what makes
      // the lower half of the arc readable rather than a hard edge.
      const opacity = clamp((front + 0.45) / 0.95, 0, 1);
      const facing = clamp(front, 0, 1);
      const scale = 0.88 + 0.12 * facing;
      const lean = (wrapped * LEAN_RATIO * 180) / Math.PI;

      // Transform and opacity are written every frame: they are what the
      // motion *is*, and both are composited properties the frame was going
      // to pay for anyway.
      card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${lean.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      card.style.opacity = opacity.toFixed(3);

      // The other three are not. A filter is a repaint, a z-index is a
      // restack, and pointer-events invalidates hit-testing — and this loop
      // used to write all three, on every card, on all sixty frames a
      // second, whether or not the value had moved. At this rotation speed a
      // card takes six seconds to cross the arc, so the overwhelming majority
      // of those writes were the value the element already had.
      //
      // Quantized, then compared. The grade steps in fiftieths, which is
      // finer than a certificate drifting past can show, and the depth
      // ordering only ever has one distinct answer per card anyway.
      const step = Math.round(facing * 50);
      if (step !== card._gradeStep) {
        card._gradeStep = step;
        const f = step / 50;
        // Only the certificate facing the reader keeps its colour; the ones
        // swinging away give it up along with their contrast, the same
        // grading the portfolio strip runs toward its own edges. Written on
        // the anchor rather than on the image inside it, deliberately: the
        // image carries a filter transition for its hover, and a value
        // rewritten every frame would leave that transition permanently
        // chasing a number that had already moved. On separate elements the
        // two filters just multiply.
        card.style.filter = `saturate(${grade(CARD_MIN_SATURATION, f)}) `
          + `brightness(${grade(CARD_MIN_BRIGHTNESS, f)}) `
          + `contrast(${grade(CARD_MIN_CONTRAST, f)})`;
      }

      // Nearest the top of the arc sits nearest the reader.
      const depth = Math.round(front * 20) + 100;
      if (depth !== card._depth) {
        card._depth = depth;
        card.style.zIndex = String(depth);
      }

      // A card that has faded out is also out of reach — otherwise an
      // invisible certificate at the edge of the frame still takes clicks.
      const reachable = opacity > 0.4;
      if (reachable !== card._reachable) {
        card._reachable = reachable;
        card.style.pointerEvents = reachable ? 'auto' : 'none';
      }

      if (front > frontMost) {
        frontMost = front;
        frontIndex = i;
      }
    });

    // The certificate nearest the top of the arc lights its own line in the
    // list. Written only when it changes: this runs every frame, and the
    // class toggle is the one thing in here that would invalidate style for
    // an element outside the ring.
    if (frontIndex !== activeAward) {
      if (listItems[activeAward]) listItems[activeAward].classList.remove('is-active');
      activeAward = frontIndex;
      if (listItems[activeAward]) listItems[activeAward].classList.add('is-active');
    }
  }

  // The ring is the only thing on the page that animates purely on its own
  // clock rather than off scroll, so it is also the only one that has to be
  // told to stop: no reason to spend a frame on nine transforms while the
  // section is nowhere near the viewport.
  let visible = false;
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
    },
    { threshold: 0 },
  );
  observer.observe(section);

  // ...and a second, stricter one that decides when the entrance happens.
  //
  // Not the reveal timeline, which would be the obvious place: that timeline
  // is hung on the heading, and by the time it has finished fading the orbit
  // in, the arc's own cards are still below the fold — this box is over 700px
  // tall and the ellipse's visible sweep sits in its upper half. A burst fired
  // there would be spent before anyone could see it.
  //
  // The margins ask a question the timeline cannot: is the orbit overlapping
  // the middle half of the screen? That is the same idiom the nav's scrollspy
  // uses, and it means the ring starts spinning when it is actually being
  // looked at, in whichever direction the reader arrived from.
  let spun = false;
  new IntersectionObserver(
    (entries) => {
      const inFrame = entries[0].isIntersecting;
      if (inFrame === spun) return;
      spun = inFrame;
      if (inFrame) spin = SPIN_BOOST;
    },
    { rootMargin: '-25% 0px -25% 0px', threshold: 0 },
  ).observe(orbit);

  // Measuring and drawing always travel together. render() is normally gated
  // on the section being in view and driven by the ticker, so on its own a
  // re-measure would leave the cards sitting on the previous ellipse until
  // some later frame happened to redraw them — at load that is the whole
  // time before the section is first scrolled to. The pass carries no delta,
  // so nothing rotates; it only puts the cards where the new numbers say.
  function remeasure() {
    measure();
    const wasVisible = visible;
    visible = true;
    render();
    visible = wasVisible;
  }

  remeasure();
  onViewportResize(remeasure);

  gsap.ticker.add(render);

  // Same belt-and-suspenders as the other headings: hide the underline via
  // the SVG wrapper's opacity (the path's own glitch keyframes cycle
  // opacity, so an inline style on the path itself would lose to them) and
  // drive the dash offset so it draws itself on.
  if (underline && underlineSvg) {
    gsap.set(underlineSvg, { opacity: 0 });
    const length = underline.getTotalLength() + 8;
    gsap.set(underline, { strokeDasharray: length, strokeDashoffset: length });
  }

  document.fonts.load('400 64px "Anton"').then(() => {
    // Re-measured now the display face has landed. The orbit takes whatever
    // height the title block leaves, and that block is two lines of Anton —
    // measuring before the font arrives sizes the ellipse (and with it the
    // Awards mark's position) against a box that is about to change, which
    // showed up as the top card clipped by the orbit's own top edge.
    remeasure();

    const splitLight = headingLight ? new SplitText(headingLight, { type: 'chars' }) : null;
    const splitAccent = headingAccent ? new SplitText(headingAccent, { type: 'chars' }) : null;

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
    scatter(splitLight);
    scatter(splitAccent);

    gsap.set(orbit, { opacity: 0, y: dpx(28), filter: fx(12) });
    if (badge) gsap.set(badge, { opacity: 0, y: dpx(12), filter: fx(6) });
    if (listItems.length) gsap.set(listItems, { opacity: 0, x: dpx(-14) });
    if (creditsTitle) gsap.set(creditsTitle, { opacity: 0, x: dpx(-14) });

    // Scrubbed across the *heading's* own approach rather than the section's,
    // and that is the fix for a reveal nobody ever saw.
    //
    // This section does not pin and its content is centred in a box taller
    // than the viewport, which puts the heading some 250px below the
    // section's top edge. Triggered off the section, progress 0 was the
    // section's top touching the bottom of the screen — with the heading a
    // further 250px below that, still off-screen — and the characters
    // finished settling at 0.52 of the range, by which point the heading had
    // only just reached the bottom edge. The whole reveal played out below
    // the fold, so scrolling down to the section found it already done.
    //
    // Hanging the range on the heading makes the timing say what it means:
    // progress 0 is the heading arriving at the bottom of the screen, and it
    // has settled by the time it is two thirds of the way up.
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: headingLight ? headingLight.closest('.awards-heading') || section : section,
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

    if (splitLight) {
      tl.to(splitLight.chars, { ...settle, duration: 0.14, stagger: 0.012 }, 0.28);
    }
    if (splitAccent) {
      tl.to(splitAccent.chars, { ...settle, duration: 0.14, stagger: 0.012 }, 0.38);
    }
    if (underlineSvg) {
      tl.to(underlineSvg, { opacity: 1, ease: 'none', duration: 0.08 }, 0.52);
    }
    if (underline) {
      tl.to(underline, { strokeDashoffset: 0, ease: 'none', duration: 0.1 }, 0.52);
    }
    tl.to(orbit, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.24 }, 0.58);
    if (badge) {
      tl.to(badge, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.1 }, 0.8);
    }
    if (listItems.length) {
      // Typed out one line at a time, the way a list of credits reads. To 1,
      // not to the resting dimness: that lives on the list itself in the
      // stylesheet, and the two would otherwise multiply.
      tl.to(listItems, { opacity: 1, x: 0, ease: 'none', duration: 0.06, stagger: 0.022 }, 0.66);
    }
    // A beat ahead of the first name, so the label arrives before the list it
    // is labelling.
    if (creditsTitle) {
      tl.to(creditsTitle, { opacity: 1, x: 0, ease: 'none', duration: 0.06 }, 0.63);
    }

    if (splitAccent) liveGlitchLoop(splitAccent.chars);
    liveJitter(badgeArrow);
    // Arrow and words on separate loops, so the two drift against each other
    // rather than moving as one block — the same split the hero's marks use.
    liveJitter(document.querySelector('.awards-subheading-arrow'), { rotateBase: 45 });
    liveJitter(document.querySelector('.awards-subheading-text'));
  });
}
