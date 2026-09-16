import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrollSmoother } from 'gsap/ScrollSmoother';

import '../styles/preloader.css';
import { GALLERY_IMAGES, GALLERY_SRCSET } from '../utils/galleryImages.js';
import { debugOff } from '../utils/debug.js';

// The plate the page opens from.
//
// It grew out of the one on wpkoi.com, and two things came off it on the way.
// The grid of tiles that flew apart is gone: that was a *page transition* —
// it existed to cover a navigation, and this site is one page with nothing to
// navigate to. And the count is no longer a fixed animation from 000 to 100
// that ran for three seconds whatever the network was doing, which is the
// thing about the original that was a story rather than a measurement.
//
// What it says instead is a clock with a condition on its last few per cent.
// It climbs on time, at a rate set by the minimum below — but it cannot pass
// HOLD until what the opening frame actually needs has arrived: the display
// face the name is set in, the body face, and the small gallery exports.
//
// The two halves are doing different jobs and it is worth being clear about
// which. The clock is what stops a warm cache flashing the plate for four
// frames; an opening that is over before it registers reads as a fault, not
// as speed. The condition is what stops the count finishing over a page that
// is still a row of fallback glyphs.
//
// Deliberately *not* the lower of the two read straight off. That was the
// first version and it was worse: with one slow request the count sits at
// eleven for four seconds, and a number that has stopped moving is a number
// that has broken. Held near the end instead, it is always moving and always
// almost there, which is both nicer and truer — nearly everything is.
//
// And over all of it, two independent ways out. This one, on a timer; and the
// keyframe declared inline in the document head, which owes nothing to any of
// this and fires whether or not a single line of it ever ran.

// Whether the reader has asked for less movement. Read once, and consulted by
// both the hold below and the bail-out listener further down: the inline
// keyframe in the document head shortens its own delay to 0.2s under this
// preference, and the two have to agree about when the plate is finished.
const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// The shortest the plate may be up for. Long enough to be an opening rather
// than a flicker — but it is a floor, not a duration: the count is held at
// HOLD until what the opening frame needs has actually arrived, so on a slow
// connection the plate still waits for the hero. Lowered from 2600 once the
// display face stopped coming from Google Fonts (it is preloaded from /font
// now), which is most of what the plate used to be waiting on.
const MIN_MS = reducedMotion ? 200 : 2000;

// ...and the longest, after which it leaves regardless of what has arrived.
// Comfortably clear of MIN_MS so a slow-but-working load still gets its full
// count rather than being cut off mid-way, and comfortably under the inline
// keyframe's own deadline so that one stays what it is: the answer to this
// module not running at all.
const MAX_MS = 7000;

// As far as the clock alone may take the count. The last few per cent belong
// to the page actually being ready — far enough along that the wait reads as
// the end of something rather than as a stall.
const HOLD = 0.92;

// How many of the gallery exports the fan is dealt from. They are also
// genuinely wanted — the closing field is tiled with these same files — so
// fetching them here is not work done for the plate alone.
const CARD_COUNT = 8;

// Each card's resting angle. Written out rather than randomised so the pile
// looks dealt rather than dropped, and so it looks the same every load.
const FAN = [-7, 5, -3, 8, -5, 2, -8, 6];

// What a character cycles through before it settles on itself. The same
// alphabet the rest of the page glitches in, plus the two marks its own type
// uses as separators.
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#*+';

const randomGlyph = () => SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];

export function initPreloader() {
  const plate = document.querySelector('.preloader');
  if (!plate) return;

  const inner = plate.querySelector('.preloader-inner');
  const title = plate.querySelector('.preloader-title-text');
  const mark = plate.querySelector('.preloader-title-mark');
  const cardHost = plate.querySelector('.preloader-stage-cards');
  const digits = Array.from(plate.querySelectorAll('.preloader-digit'));
  const ruler = plate.querySelector('.preloader-ruler');
  const marker = plate.querySelector('.preloader-marker');

  // ?off=preloader opens the page on the first frame. Worth having for the
  // same reason every other switch in utils/debug.js is: the plate sits over
  // everything for three seconds of every reload, and that is three seconds
  // of every attempt to look at what is underneath it.
  if (debugOff('preloader')) {
    release(plate);
    return;
  }

  const scrambles = new Set();

  // ---- The page holds still while the plate is up.
  //
  // Not for tidiness: the wheel reaches the page through ScrollSmoother, and
  // a reader who arrives with a flick already in progress would otherwise
  // spend the plate's three seconds scrolling a page they cannot see, and
  // meet the opening frame somewhere in the middle of the second section.
  const smoother = ScrollSmoother.get();
  if (smoother) {
    smoother.scrollTop(0);
    smoother.paused(true);
  }

  // ---- The rule.
  const TICKS = 100;
  if (ruler) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i <= TICKS; i += 1) {
      const tick = document.createElement('span');
      tick.className = `preloader-tick preloader-tick--${i % 10 === 0 ? 'major' : 'minor'}`;
      tick.style.left = `${(i / TICKS) * 100}%`;
      frag.appendChild(tick);
    }
    ruler.appendChild(frag);
  }

  // ---- The fan, and the first half of what the count is measuring.
  const images = [];
  if (cardHost) {
    // One layout read, here, before a single card exists or anything has
    // started animating — so the eight <img> below can be told what box they
    // are going into and pick the right export for it. The stage is 9rem
    // square wide and 6 --ui upright; neither is expressible in `sizes`,
    // which cannot see a custom property. Falls back to the wide figure if
    // the element has no box yet, which only happens with the plate hidden.
    const cardBox = Math.round(cardHost.getBoundingClientRect().width) || 128;

    GALLERY_IMAGES.slice(0, CARD_COUNT).forEach((src, i) => {
      const card = document.createElement('span');
      card.className = 'preloader-card';

      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      // Before src, so the candidate is chosen once rather than after a
      // request for the fallback has already gone out.
      const srcset = GALLERY_SRCSET.get(src);
      if (srcset) {
        img.srcset = srcset;
        img.sizes = `${cardBox}px`;
      }
      img.src = src;

      card.appendChild(img);
      cardHost.appendChild(card);
      images.push(img);

      gsap.set(card, { opacity: 0, scale: 0.55, rotate: FAN[i % FAN.length] * 1.9 });
    });
  }

  // ---- ...and the second half.
  //
  // The faces matter more than the pictures here: the name in the opening
  // frame is fitted to its column by measuring what the run comes to (see
  // ui/heroName.js), and measured in the fallback face it fits the wrong
  // metrics. The plate covering that moment is most of what it is for.
  const waits = [];
  waits.push(document.fonts ? document.fonts.ready : Promise.resolve());
  images.forEach((img) => {
    waits.push(img.decode ? img.decode() : Promise.resolve());
  });

  let arrived = 0;
  const expected = waits.length;
  waits.forEach((wait) => {
    Promise.resolve(wait).then(settle, settle);
  });

  function settle() {
    arrived += 1;
  }

  // ---- The title, one character at a time.
  let chars = [];
  if (title) {
    const split = SplitText.create(title, { type: 'chars', charsClass: 'char' });
    chars = split.chars.map((el) => ({ el, real: el.textContent }));
    chars.forEach((c) => {
      c.el.textContent = '';
      gsap.set(c.el, { opacity: 0 });
    });
  }

  function scrambleChar(c, duration) {
    gsap.set(c.el, { opacity: 1 });

    const spin = setInterval(() => {
      c.el.textContent = randomGlyph();
    }, gsap.utils.random(28, 55));
    scrambles.add(spin);

    gsap.fromTo(
      c.el,
      { color: 'var(--color-accent)' },
      { color: 'var(--color-light)', duration: duration * 0.8, ease: 'power2.out' },
    );

    gsap.delayedCall(duration, () => {
      clearInterval(spin);
      scrambles.delete(spin);
      c.el.textContent = c.real;
    });
  }

  function stopScrambles() {
    scrambles.forEach(clearInterval);
    scrambles.clear();
  }

  // ---- The arrival.
  // Straight away rather than from the timeline below, which cannot write
  // anything until the ticker has run once. The modules that start after this
  // one hold the main thread for the better part of a second between them, and
  // for all of it the plate would otherwise be a plain dark rectangle.
  gsap.set(inner, { opacity: 1 });

  const intro = gsap.timeline();

  if (mark) intro.to(mark, { scaleX: 1, duration: 0.35, ease: 'power2.out' }, 0.05);

  chars.forEach((c, i) => {
    intro.call(() => scrambleChar(c, gsap.utils.random(0.32, 0.48)), null, 0.1 + i * 0.045);
  });

  if (images.length) {
    images.forEach((img, i) => {
      intro.to(
        img.parentNode,
        { opacity: 1, scale: 1, rotate: FAN[i % FAN.length], duration: 0.45, ease: 'back.out(1.7)' },
        0.2 + i * 0.09,
      );
    });
  }

  // ---- The count.
  //
  // Driven from the ticker rather than tweened, because the number it is
  // reporting is not a curve anyone can write down in advance — it is the
  // lower of a clock and a queue, and either of them can be the binding one
  // from frame to frame.
  // Started on the first frame, not here.
  //
  // Everything else on this page initialises after this module and does it
  // synchronously — several hundred milliseconds of measuring, splitting and
  // building before the browser is given a frame to paint. Timed from here,
  // the count would spend all of that climbing unseen and appear already at
  // forty, which reads as a fault rather than as progress. Timed from the
  // first frame, the minimum below is what it is meant to be: the shortest
  // the plate is *on screen* for.
  let started = 0;
  let shown = 0;
  let leaving = false;

  function tick() {
    if (!started) started = performance.now();
    const elapsed = performance.now() - started;
    const byClock = Math.min(elapsed / MIN_MS, 1);
    const ready = !expected || arrived >= expected || elapsed >= MAX_MS;
    const target = ready ? byClock : Math.min(byClock, HOLD);

    // Never backwards. Nothing here can currently go down, but the count is
    // the one thing on this plate the reader is actually reading, and a
    // number that retreats is worse than one that stops.
    shown = Math.max(shown, target);

    const value = String(Math.round(shown * 100)).padStart(3, '0');
    // Per cell, and only where it changed: nine steps in ten move the last
    // numeral alone, and there is no reason to touch the other two.
    for (let i = 0; i < digits.length; i += 1) {
      if (digits[i].textContent !== value[i]) digits[i].textContent = value[i];
    }
    if (marker) marker.style.left = `${shown * 100}%`;

    if (shown >= 1 && !leaving) leave();
  }

  gsap.ticker.add(tick);

  // ---- ...and two more ways out, neither of which is the ticker.
  //
  // The count above leaves on its own the moment it reaches a hundred, and
  // MAX_MS guarantees it gets there. But it is driven from GSAP's own frame
  // loop, and everything that stops the plate leaving is something that would
  // stop that loop: an exception thrown from another module's ticker
  // callback, a plugin that failed to register, a frame the browser never
  // asks for. A plain timeout owes none of that anything.
  //
  // The first one takes the ordinary exit, so a page that was merely slow
  // still leaves the way it should. The second does not animate at all — it
  // simply takes the plate out and gives the page its scroll back, which is
  // the part a stuck preloader really costs the reader. It is set to land
  // just before the keyframe declared inline in the document head: that one
  // is the answer to this file never having run, and it can only hide the
  // plate, not un-pause anything.
  // The inline keyframe in the document head can take the plate off screen
  // without this module having anything to do with it — at 9s normally, and at
  // 0.2s for a reader who has asked for reduced motion. Its own comment says
  // it can only hide the plate, not un-pause anything, and that was exactly
  // the hole: under reduced motion the plate was gone in under a second while
  // the scroll stayed locked for the length of an opening nobody was being
  // shown. Whatever hides the plate, this hands the page back at the same
  // moment.
  plate.addEventListener('animationend', () => release(plate));

  const graceTimer = setTimeout(() => leave(), MAX_MS + 400);
  const hardTimer = setTimeout(() => {
    if (plate.isConnected) release(plate);
  }, 8500);

  // ---- The departure.
  //
  // Two beats. The marks lift and go, then the plate itself slides off the
  // top — the same movement the portrait menu arrives with, run backwards,
  // which is the only travelling gesture this page has and so the one it
  // should leave by. Transform and opacity, nothing else: whatever the page
  // underneath is doing on its first frames, this must not be asking it to
  // lay anything out.
  function leave() {
    if (leaving) return;
    leaving = true;
    clearTimeout(graceTimer);
    gsap.ticker.remove(tick);
    stopScrambles();

    gsap.timeline({ onComplete: () => { clearTimeout(hardTimer); release(plate); } })
      .to(inner, { autoAlpha: 0, y: '-4rem', duration: 0.4, ease: 'power2.in' })
      // onStart, and this is the whole of the fix for a page that looked ready
      // and would not move.
      //
      // The scroll used to come back from this timeline's onComplete, which is
      // 1.18s after the plate is done being needed — and the plate is on
      // power4.inOut, so it has cleared most of the screen long before then.
      // On a warm cache the reader is looking at the page, flicking at it, and
      // nothing happens; a second later it starts working on its own. Handed
      // back here instead, on the beat the plate begins to move, the page
      // becomes scrollable exactly when it becomes visible.
      .to(plate, { yPercent: -100, duration: 0.9, ease: 'power4.inOut', onStart: giveBackScroll }, '-=0.12');
  }
}

// Handing the page back, in two parts, because they are wanted at two
// different moments: the scroll as soon as the plate starts to lift, the plate
// itself out of the document once it has finished lifting.
let scrollGivenBack = false;

// Idempotent — leave() calls it from the departure, and release() calls it
// again on the paths that skip the departure entirely (the hard timer, and a
// second leave()).
function giveBackScroll() {
  if (scrollGivenBack) return;
  scrollGivenBack = true;
  const smoother = ScrollSmoother.get();
  if (smoother) smoother.paused(false);
  // Dispatched with the scroll rather than with the removal: both listeners
  // (see main.js) are about the page being live, not about the plate's node
  // still being there.
  document.dispatchEvent(new CustomEvent('preloader:done'));
}

// Out of the document entirely rather than hidden: it has nothing left to say,
// and an element covering the viewport is one the browser goes on compositing
// whether or not anything is painted into it.
function release(plate) {
  giveBackScroll();
  if (plate.isConnected) plate.remove();
}
