import { gsap } from 'gsap';

import { debugOff } from './debug.js';
import { fx } from './filters.js';

// The two ambient "this page is alive" loops, in one place.
//
// Both of them used to be copy-pasted into six section modules (skills,
// portfolio, wpkoi, awards, transition, contact) plus heroTransition, and
// every copy started its targets unconditionally at init and then ran them
// forever — including the fifteen-odd marks that spend almost the whole
// session several viewports away from anything anyone can see.
//
// What that cost, per element, was one gsap.to() plus one delayedCall()
// created and thrown away roughly six times a second, for the life of the
// page, whether or not the element was on screen: call it a hundred and
// twenty short-lived tweens a second across the page, each one writing four
// animated properties. The motion itself is worth keeping — it is what makes
// the drawn marks read as a hand rather than as stamps — but none of that
// machinery was.
//
// So: one shared ticker callback drives every jitter target, writing through
// gsap.quickSetter (which goes through GSAP's own transform cache, so a
// timeline tweening scale or y on the same element still sees the right
// starting values), nothing is allocated per cycle, and an
// IntersectionObserver takes anything off-screen out of the loop entirely.
// The leg timings, amplitudes and easing are the same numbers the old
// per-file copies used, so the movement itself is unchanged.

const sineInOut = gsap.parseEase('sine.inOut');

const rand = (min, max) => min + Math.random() * (max - min);

// The filter half of the tremor (a sub-pixel blur and a brightness wobble) is
// the only part of it that costs a repaint rather than a composite, so it is
// resampled at 24Hz while the transform keeps running every frame. On a mark
// that is meant to read as an unsteady hand, a stepped 24Hz flicker is
// indistinguishable from a smoothly interpolated one — the same reasoning the
// stepped underline glitch elsewhere on the page already runs on.
const FILTER_STEP = 1 / 24;

const jitterTargets = new Map();
let jitterObserver = null;
let jitterTicking = false;

function observeJitter(el) {
  if (!jitterObserver) {
    jitterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const state = jitterTargets.get(entry.target);
          if (state) state.visible = entry.isIntersecting;
        });
      },
      // A margin either side so a mark is already trembling by the time it
      // scrolls in, rather than visibly picking the motion up on entry.
      { rootMargin: '20% 0px' },
    );
  }
  jitterObserver.observe(el);
}

function newLeg(state) {
  const amp = state.amp;
  state.fromX = state.toX;
  state.fromY = state.toY;
  state.fromRotate = state.toRotate;
  state.toX = rand(-0.8, 0.8) * amp;
  state.toY = rand(-0.6, 0.6) * amp;
  state.toRotate = state.rotateBase + rand(-1.2, 1.2) * amp;
  state.duration = rand(0.12, 0.22);
  // The idle beat the old version got from its onComplete -> delayedCall
  // hand-off. Short enough that the mark never reads as having settled.
  state.hold = rand(0.03, 0.12);
  state.elapsed = 0;
}

function writeFilter(state) {
  const amp = state.amp;
  const blur = (Math.random() * 0.5 * amp).toFixed(3);
  const brightness = (1 - 0.06 * amp + Math.random() * 0.18 * amp).toFixed(3);
  const next = fx(blur, `brightness(${brightness})`);
  if (next === state.lastFilter) return;
  state.lastFilter = next;
  state.el.style.filter = next;
}

// Every tremor on the page, held still.
//
// It exists for one caller: while the hero is assembling, the two scrawls in
// the name's corners are inside the element being scaled, and this loop writes
// a filter on them twenty-four times a second. A filter change on the contents
// of a layer that is mid-scale forces that whole layer to be rasterised again
// — so the tremor was not costing what a tremor costs, it was costing a
// repaint of the largest thing on the screen. Nothing else is on screen during
// that stretch, so pausing all of it is the same as pausing those two.
let jitterPaused = false;

export function setJitterPaused(paused) {
  if (paused === jitterPaused) return;
  jitterPaused = paused;
  if (!paused) return;

  // Held still means held *sharp*, which is not the same as held wherever it
  // happened to be. Both halves of the tremor are sub-pixel: a translate of a
  // few tenths of a pixel and a blur of up to a sixth of one. Stopping the
  // loop mid-leg freezes whichever fraction each was last on — and for the
  // one caller this has, that frozen frame is the whole of the opening view.
  // The two scrawls it holds sit inside an element scaled by four, so a
  // tenth-of-a-pixel offset lands their glyphs half a pixel off the grid and
  // a sixth-of-a-pixel blur reads as most of one: the marks arrive soft, by
  // however much the last random leg happened to ask for, and stay soft for
  // as long as the reader stays at the top of the page.
  //
  // Settling them on their authored position costs nothing — a paused tremor
  // is not a tremor either way — and it is the position they were drawn at.
  // The filter goes away entirely rather than to a zero radius, so nothing is
  // left carrying a filtered render surface for the ride down the page.
  jitterTargets.forEach((state) => {
    state.fromX = 0;
    state.toX = 0;
    state.fromY = 0;
    state.toY = 0;
    state.fromRotate = state.rotateBase;
    state.toRotate = state.rotateBase;
    state.elapsed = 0;
    state.setX(0);
    state.setY(0);
    state.setRotate(state.rotateBase);
    state.lastFilter = '';
    state.el.style.filter = '';
  });
}

function jitterTick(_time, deltaMs) {
  if (jitterPaused) return;

  // Clamped so returning to a backgrounded tab doesn't arrive as one enormous
  // step through several legs at once.
  const dt = Math.min(deltaMs || 0, 100) / 1000;

  jitterTargets.forEach((state) => {
    if (!state.visible) return;

    state.elapsed += dt;
    if (state.elapsed >= state.duration + state.hold) newLeg(state);

    const t = state.duration > 0 ? Math.min(state.elapsed / state.duration, 1) : 1;
    const eased = sineInOut(t);

    state.setX(state.fromX + (state.toX - state.fromX) * eased);
    state.setY(state.fromY + (state.toY - state.fromY) * eased);
    state.setRotate(state.fromRotate + (state.toRotate - state.fromRotate) * eased);

    state.filterElapsed += dt;
    if (state.filterElapsed >= FILTER_STEP) {
      state.filterElapsed = 0;
      writeFilter(state);
    }
  });
}

// A continuous low-amplitude tremor: every leg eases to a freshly randomized
// small target with only a beat of stillness in between, so it reads as a hand
// that can't quite hold a marker still rather than as an occasional startle.
//
// `rotateBase` keeps an element that is already rotated by CSS settled around
// that angle instead of snapping to 0 the moment its transform is taken over.
// `amp` scales every amplitude by one factor — the hero passes 1/3, because
// the full amplitude that suits a dense section read as unstable type in a
// quiet, wide opening frame.
export function liveJitter(target, { rotateBase = 0, amp = 1 } = {}) {
  if (!target || jitterTargets.has(target) || debugOff('jitter')) return;

  const state = {
    el: target,
    amp,
    rotateBase,
    fromX: 0,
    fromY: 0,
    fromRotate: rotateBase,
    toX: 0,
    toY: 0,
    toRotate: rotateBase,
    duration: 0.15,
    hold: 0,
    elapsed: 0,
    filterElapsed: 0,
    lastFilter: '',
    visible: true,
    setX: gsap.quickSetter(target, 'x', 'px'),
    setY: gsap.quickSetter(target, 'y', 'px'),
    setRotate: gsap.quickSetter(target, 'rotate', 'deg'),
  };
  newLeg(state);

  jitterTargets.set(target, state);
  observeJitter(target);

  if (!jitterTicking) {
    jitterTicking = true;
    gsap.ticker.add(jitterTick);
  }
}

// Occasionally picks one character out of a split line and gives it a quick
// blur/brighten jolt, or — rarer — a slow horizontal flip. One character at a
// time, on long random gaps, so the line reads as quietly alive rather than
// constantly busy.
//
// Unlike the tremor above this is naturally cheap (one short timeline every
// couple of seconds), so it keeps its GSAP implementation; what it gains here
// is the same visibility gate. A heading four sections below the fold was
// still scheduling and playing its jolts into an empty room, and each one is a
// blur on a character sitting inside the page's one big scrolling layer.
export function liveGlitchLoop(chars) {
  if (!chars || !chars.length || debugOff('glitch')) return;

  let visible = true;
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
    },
    { rootMargin: '20% 0px' },
  );
  // The characters themselves are inline-block boxes SplitText owns; their
  // shared parent is the stable thing to watch.
  observer.observe(chars[0].parentNode || chars[0]);

  const next = () => {
    if (visible) {
      const char = gsap.utils.random(chars);
      if (Math.random() < 0.15) {
        gsap.timeline()
          .to(char, { rotateY: 180, duration: 0.5, ease: 'power1.inOut' })
          .to(char, { rotateY: 0, duration: 0.5, ease: 'power1.inOut' }, '+=0.15');
      } else {
        gsap.timeline()
          .to(char, {
            filter: fx(3, 'brightness(1.7)'),
            x: gsap.utils.random(-3, 3),
            y: gsap.utils.random(-3, 3),
            duration: 0.1,
            ease: 'power1.out',
          })
          .to(char, { filter: fx(0, 'brightness(1)'), x: 0, y: 0, duration: 0.3, ease: 'power1.inOut' });
      }
    }
    gsap.delayedCall(gsap.utils.random(1.4, 3.6), next);
  };
  gsap.delayedCall(gsap.utils.random(1, 2.5), next);
}
