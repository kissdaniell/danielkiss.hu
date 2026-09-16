import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

import '../styles/wpkoi.css';
import { dpx } from '../utils/viewport.js';
import { liveGlitchLoop, liveJitter } from '../utils/motion.js';
import { fx } from '../utils/filters.js';

// Horizontal parallax gallery for the WPKoi showcase, ported from the
// Codrops "Horizontal Parallax Gallery" DOM demo and reshaped for this page:
//
//  * The demo drives its strip straight off wheel deltas across the whole
//    viewport. Here the strip is scoped to the column left of the fixed
//    sidebar, and its position comes from a pinned ScrollTrigger's progress
//    instead — so the reader scrolls the page normally and the strip is what
//    that scroll moves, with no wheel handler of its own to fight
//    ScrollSmoother for the same events.
//  * Rather than mapping progress linearly onto the track's full travel, it
//    interpolates between the scroll offsets that centre each individual
//    media (see measure/scrollForProgress). The clips are set shorter than
//    the stills, so the boxes aren't all the same width and a linear map
//    would drift out of step with the 01–05 counter; this way every whole
//    step of the counter is exactly one media arriving dead-centre.
//  * The demo's parallax mechanic is kept: each media is wider than the
//    box it sits in and counter-shifts against the strip's motion, which is
//    what makes the strip read as depth instead of a slide reel. The
//    overhang is halved (118% rather than the demo's 125%) because these
//    are screenshots, where every percent of overhang is a percent of the
//    captured page cropped away. On top of it, distance from centre also
//    drives a --focus custom property that dims and desaturates whatever
//    isn't the current piece.
//
// The per-frame work (track transform, per-media shift, --focus, counter)
// runs on gsap.ticker with its own eased follow of the scroll
// target, deliberately outside GSAP's tween system: it's a handful of style
// writes on a fixed set of nodes, and keeping it off the tween timeline
// means the entrance animation below can own opacity/blur on the same
// elements without either side clobbering the other's inline styles.

// % of the media's own (118%) width — 7% of 118 is 8.3% of the box it
// sits in, comfortably inside the 9% of overhang on either side.
const MAX_PARALLAX_SHIFT = 7;
// Where the gallery's mask stops being fully opaque, as a fraction of its
// width — must match the linear-gradient in wpkoi.css. The strip stops with
// the last media's right edge here rather than carrying on to centre it,
// which is the furthest it can travel while still showing that media whole.
const FADE_INSET_RATIO = 0.1;
// Resting tilt of the two circled marks, in degrees. Applied from here
// rather than CSS — see the note above .wpkoi-visit in the stylesheet.
const VISIT_TILT = -3.5;
// Square, unlike the mark beside the title: this one closes a row of dates
// and titles that are all set straight, and a tilt here read as a mistake
// rather than as a scrawl. Its entrance still arrives from an angle (see the
// gsap.set below) — it just settles level.
const MORE_TILT = 0;
const FOLLOW_EASE = 0.11;
// Above this, a clip is close enough to centre to be worth playing.
const PLAY_THRESHOLD = 0.34;

// The strip's pin length, readable from outside.
//
// Unlike the portfolio's, this is not a fixed multiple of the viewport: it
// comes off how far the strip actually has to travel, which is only known
// once the media have been measured. So the real implementation is installed
// by initWpkoi below and this stands in until then — which is enough, because
// the only caller (ui/sidebarWpkoi.js) asks for it through a ScrollTrigger
// `end` function that is re-evaluated on every refresh.
let pinDistanceImpl = () => window.innerHeight * 1.4;

export function wpkoiPinDistance() {
  return pinDistanceImpl();
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const pad2 = (n) => String(n).padStart(2, '0');

export function initWpkoi() {
  const section = document.querySelector('#wpkoi');
  const gallery = document.querySelector('.wpkoi-gallery');
  const track = document.querySelector('.wpkoi-track');
  if (!section || !gallery || !track) return;

  const items = Array.from(track.querySelectorAll('.wpkoi-media'));
  if (items.length < 2) return;

  const inners = items.map((item) => item.querySelector('.wpkoi-media-inner'));
  const videos = items.map((item) => item.querySelector('video'));
  const playing = items.map(() => false);
  // Last --focus value written per media, in hundredths. See where it is used.
  const focusSteps = items.map(() => -1);

  // Whether the strip is anywhere near the viewport. Two things hang off it:
  // the clips only ever play while it is true (a paused strip several
  // sections above or below the reader was still decoding video into a box
  // nobody can see, purely because the last frame before it left had one
  // media near enough to centre), and the per-frame pass below returns
  // immediately when it is false.
  let sectionVisible = true;
  new IntersectionObserver(
    (entries) => {
      sectionVisible = entries[0].isIntersecting;
      if (sectionVisible) return;
      videos.forEach((video, i) => {
        if (!video || !playing[i]) return;
        playing[i] = false;
        video.pause();
      });
    },
    { rootMargin: '25% 0px' },
  ).observe(section);

  const experience = document.querySelector('.wpkoi-experience');
  const experienceUnderline = document.querySelector('.wpkoi-experience-underline-stroke');
  const experienceUnderlineSvg = document.querySelector('.wpkoi-experience-underline');
  const titleLight = document.querySelector('.wpkoi-title-line--light');
  const titleAccent = document.querySelector('.wpkoi-title-line--accent');
  const visit = document.querySelector('.wpkoi-visit--main');
  const visitRing = visit ? visit.querySelector('.wpkoi-visit-ring-stroke') : null;
  const visitRingSvg = visit ? visit.querySelector('.wpkoi-visit-ring') : null;
  const more = document.querySelector('.wpkoi-visit--more');
  const moreRing = more ? more.querySelector('.wpkoi-visit-ring-stroke') : null;
  const moreRingSvg = more ? more.querySelector('.wpkoi-visit-ring') : null;
  const visitArrows = Array.from(document.querySelectorAll('.wpkoi-visit-arrow'));
  const counterCurrent = document.querySelector('.wpkoi-counter-current');
  const counterValue = document.querySelector('.wpkoi-counter-value');
  const counterSlash = document.querySelector('.wpkoi-counter-slash');
  const counterTotal = document.querySelector('.wpkoi-counter-total');
  const scrollHint = document.querySelector('.wpkoi-scroll-hint');
  const scrollHintArrow = document.querySelector('.wpkoi-scroll-hint-arrow');
  const timelineItems = Array.from(document.querySelectorAll('.wpkoi-timeline-item'));

  if (counterTotal) counterTotal.textContent = pad2(items.length);
  if (counterValue) counterValue.textContent = pad2(1);

  // Scroll offset (in px of track travel) that puts each media dead-centre
  // in the gallery viewport, plus the total travel between the first and
  // last of those. Re-measured on every ScrollTrigger refresh, since every
  // size here is viewport-relative.
  let galleryWidth = 0;
  // Where each media sits in the track, as the scroll offset that would put
  // it dead-centre. Pure geometry — the parallax and the dimming read it.
  let centers = [];
  // Where the strip actually stops for each media. The same as `centers`
  // except for the last one (see measure), and what the counter counts.
  let stops = [];
  let limit = 0;

  function measure() {
    galleryWidth = gallery.clientWidth;
    const first = items[0];
    const last = items[items.length - 1];
    const fadeInset = galleryWidth * FADE_INSET_RATIO;

    // Left padding puts the first media dead-centre at rest. The right one
    // only has to cover the mask's fade, since the strip no longer travels
    // far enough to centre the last media (see below).
    track.style.paddingLeft = `${Math.max(0, (galleryWidth - first.offsetWidth) / 2)}px`;
    track.style.paddingRight = `${Math.max(0, fadeInset)}px`;

    centers = items.map((item) => item.offsetLeft + item.offsetWidth / 2 - galleryWidth / 2);

    // The last stop is where the last media's right edge meets the point
    // the mask stops fading — the furthest it needs to come to be seen
    // whole. Travelling on to centre it (which is what this used to do)
    // just drags a screen's worth of empty background in behind it.
    // Clamped so it can never land before the previous stop, and never past
    // dead-centre either: a media wider than ~80% of the gallery reaches
    // centre before its right edge gets that far.
    const lastIndex = items.length - 1;
    const flushRight = last.offsetLeft + last.offsetWidth - galleryWidth + fadeInset;
    stops = centers.slice();
    stops[lastIndex] = clamp(flushRight, centers[lastIndex - 1], centers[lastIndex]);

    // stops[0] is 0 by construction, so the last stop *is* the total
    // travel. (track.scrollWidth looked like the obvious source for this
    // but silently drops the track's end padding, and read differently
    // after a resize than on a fresh load.) The pin's own length comes off
    // this.
    limit = Math.max(0, stops[lastIndex]);
  }

  // progress 0..1 -> track offset, walking the stops list rather than
  // scaling `limit` directly (see the header comment).
  function scrollForProgress(progress) {
    const u = clamp(progress, 0, 1) * (items.length - 1);
    const i = Math.min(items.length - 2, Math.floor(u));
    return stops[i] + (stops[i + 1] - stops[i]) * (u - i);
  }

  const state = { current: 0, target: 0 };
  let settled = false;
  let activeIndex = 0;
  let counterTl;

  // Swap animation for the big numeral. `direction` is +1 scrolling forward,
  // -1 back, so the digit always leaves the way the strip is travelling and
  // the new one arrives from the other side.
  function setActiveIndex(next, direction) {
    if (next === activeIndex) return;
    activeIndex = next;
    if (!counterValue) return;

    // Killed rather than queued: a fast scroll can cross several media
    // before one swap finishes, and letting them stack would leave the
    // numeral mid-blur showing a stale value.
    if (counterTl) counterTl.kill();
    counterTl = gsap
      .timeline()
      .to(counterValue, {
        y: dpx(-18) * direction,
        opacity: 0,
        filter: fx(7),
        duration: 0.16,
        ease: 'power2.in',
        onComplete: () => {
          counterValue.textContent = pad2(next + 1);
        },
      })
      .fromTo(
        counterValue,
        { y: dpx(18) * direction, opacity: 0, filter: fx(7) },
        { y: 0, opacity: 1, filter: fx(0), duration: 0.3, ease: 'power2.out' },
      );
  }

  function render() {
    // Nothing here is worth a frame while the section is out of reach: the
    // strip's position comes from a pinned trigger that is not running, so
    // every number this pass computes would be the one it computed last time.
    if (!sectionVisible) return;

    const diff = state.target - state.current;
    if (Math.abs(diff) < 0.05) {
      // Nothing left to follow: park exactly on target and stop writing
      // styles until the next scroll update marks it unsettled again.
      if (settled) return;
      state.current = state.target;
      settled = true;
    } else {
      state.current += diff * FOLLOW_EASE;
      settled = false;
    }

    const half = galleryWidth / 2 || 1;
    track.style.transform = `translate3d(${-state.current}px, 0, 0)`;

    let nearest = 0;
    let nearestDistance = Infinity;

    items.forEach((item, i) => {
      // Where this media's centre currently sits inside the gallery
      // viewport, expressed as -1 (left edge) .. 0 (centre) .. 1 (right).
      const offset = centers[i] + half - state.current;
      const t = clamp((offset - half) / half, -1, 1);

      inners[i].style.transform = `translate3d(${(-t * MAX_PARALLAX_SHIFT).toFixed(3)}%, 0, 0)`;

      // Quadratic rather than linear falloff, and for a specific reason:
      // media sit further apart than half the gallery is wide, so at the
      // hand-off point between two of them both are already at |t| ~= 0.7.
      // A linear ramp puts both near zero there — the strip blacks out for
      // a third of every step. 1 - t^2 crosses at ~0.5 instead, so the two
      // read as one dimming while the other lifts.
      const focus = 1 - t * t;

      // --focus is not like the transform above it. The stylesheet feeds it
      // into `filter: brightness() saturate()` on the media itself, and two
      // of those media are playing video: a new value means the browser has
      // to push a freshly decoded frame back through a filter chain before it
      // can be composited, which is most of why the clips in this strip
      // stutter. The transform costs a matrix; this costs a repaint.
      //
      // So it steps in hundredths and is only written when the step actually
      // changes. Across a whole media arriving and leaving that is around a
      // hundred writes instead of one per frame for the length of the pin,
      // and a hundredth of a stop on a brightness curve is not a quantity
      // anyone can see.
      const step = Math.round(focus * 100);
      if (step !== focusSteps[i]) {
        focusSteps[i] = step;
        item.style.setProperty('--focus', (step / 100).toFixed(2));
      }

      const video = videos[i];
      if (video) {
        const shouldPlay = sectionVisible && focus > PLAY_THRESHOLD;
        if (shouldPlay !== playing[i]) {
          playing[i] = shouldPlay;
          if (shouldPlay) {
            const played = video.play();
            // Rejects harmlessly whenever a pause lands before the play
            // promise settles — normal during a fast scroll-through.
            if (played) played.catch(() => {});
          } else {
            video.pause();
          }
        }
      }

      // Against the stop, not the centre: the last media never reaches
      // dead-centre any more, so measuring against centres would leave the
      // counter one short of the end.
      const distance = Math.abs(stops[i] - state.current);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i;
      }
    });

    setActiveIndex(nearest, nearest > activeIndex ? 1 : -1);
  }

  measure();
  gsap.ticker.add(render);

  // The pin's length is derived from the strip's own travel rather than a
  // flat multiple of the viewport: the media are sized in vh and their
  // widths (so the total travel) change a lot between a wide desktop and a
  // narrow one. Roughly 1:1 scroll-to-strip movement, floored so a very
  // short strip still gets a real dwell instead of flicking past.
  const pinDistance = () => Math.max(window.innerHeight * 1.4, limit * 1.05);
  pinDistanceImpl = pinDistance;

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${pinDistance()}`,
    pin: true,
    pinSpacing: true,
    invalidateOnRefresh: true,
    // onRefreshInit, not onRefresh: it runs before the end value above is
    // evaluated, and that value reads `limit` — measuring afterwards would
    // pin for a distance computed from the previous viewport's numbers.
    onRefreshInit: measure,
    onRefresh: (self) => {
      // Measured a second time, now that the pin has been re-applied and
      // the section is definitely back at its full width. Cheap, and it
      // means a transient layout during the revert can't leave the centres
      // list quietly wrong until the next resize.
      measure();
      state.target = scrollForProgress(self.progress);
      state.current = state.target;
      settled = false;
    },
    onUpdate: (self) => {
      state.target = scrollForProgress(self.progress);
      settled = false;
    },
  });

  // Same belt-and-suspenders as the other sections: hide each drawn stroke
  // via its SVG wrapper's opacity (the path's own glitch keyframes cycle
  // opacity, so an inline style on the path itself would lose to them) and
  // drive the dash offset so it draws itself on. The Visit Site ring is the
  // same trick applied to a closed-ish loop rather than a line, so it reads
  // as being scrawled around the words.
  function prepareStroke(path, svg, pad) {
    if (!path || !svg) return;
    gsap.set(svg, { opacity: 0 });
    const length = path.getTotalLength() + pad;
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
  }

  prepareStroke(experienceUnderline, experienceUnderlineSvg, 6);
  prepareStroke(visitRing, visitRingSvg, 10);
  prepareStroke(moreRing, moreRingSvg, 10);

  document.fonts.load('400 64px "Anton"').then(() => {
    // The three counter spans are scattered as whole boxes rather than
    // SplitText characters, unlike the poster headings elsewhere on the
    // site: setActiveIndex rewrites the current numeral's textContent on
    // every step, which would throw away any character nodes split out of
    // it — and the reversed entrance would then be animating orphans while
    // the live numeral sat there fully visible.
    const counterParts = [counterCurrent, counterSlash, counterTotal].filter(Boolean);

    // Offsets run through dpx() so they stay the same distance relative to
    // the type they belong to at every viewport — see the note in skills.js.
    if (experience) gsap.set(experience, { opacity: 0, y: dpx(14), filter: fx(8) });

    // The title gets the same per-character scatter the other poster
    // headings on the page open with.
    const splitLight = titleLight ? new SplitText(titleLight, { type: 'chars' }) : null;
    const splitAccent = titleAccent ? new SplitText(titleAccent, { type: 'chars' }) : null;
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

    // Both marks arrive over-rotated and settle onto their resting tilt,
    // rather than settling to square — see VISIT_TILT.
    if (visit) gsap.set(visit, { opacity: 0, y: dpx(12), scale: 0.94, rotate: VISIT_TILT - 7, filter: fx(6) });
    if (more) gsap.set(more, { opacity: 0, y: dpx(10), scale: 0.95, rotate: MORE_TILT + 6, filter: fx(6) });
    timelineItems.forEach((item) => gsap.set(item, { opacity: 0, y: dpx(14), filter: fx(6) }));

    counterParts.forEach((part) => {
      gsap.set(part, {
        x: dpx(gsap.utils.random(-26, 26)),
        y: dpx(gsap.utils.random(-20, 20)),
        rotate: gsap.utils.random(-12, 12),
        filter: fx(10),
        opacity: 0,
      });
    });
    // xPercent rather than a pixel offset: it is relative to the gallery's
    // own width, so it stays correct without being rebuilt when the viewport
    // changes — a px offset here is baked in at the scale the page loaded
    // at, and this is the one entrance offset big enough for that to show.
    gsap.set(gallery, { opacity: 0, xPercent: 7, filter: fx(14) });
    if (scrollHint) gsap.set(scrollHint, { opacity: 0, y: dpx(10), filter: fx(6) });

    // Scrubbed across the section's *approach* ('top bottom' -> 'top top'),
    // not across the pin — exactly the arrangement portfolio.js uses and
    // for the same reason: the hidden starting state is already parked at
    // its normal-flow position on load, so revealing it during the approach
    // means it finishes right as the pin engages and the pin's own range
    // stays entirely for the gallery.
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        end: 'top top',
        scrub: 0.35,
        // Both clips only carry metadata until the section is on its way in
        // — ~10MB of video that nothing above this point needs. Buffering
        // starts here rather than on first play so the first clip isn't a
        // black box when the strip reaches it.
        onEnter: () => {
          videos.forEach((video) => {
            if (!video || video.preload === 'auto') return;
            video.preload = 'auto';
            video.load();
          });
        },
      },
    });

    // Filler tween so the timeline's natural duration is the full 0..1 the
    // scrub maps onto — without it every position label below would fire
    // early, scaled by 1/(end of the last real tween).
    tl.to({}, { duration: 1 }, 0);

    const settle = { x: 0, y: 0, rotate: 0, filter: fx(0), opacity: 1, ease: 'none' };

    // Top down, in reading order: the Experience line, its underline, the
    // title breaking in character by character, the ring scrawling itself
    // around Visit Site, then the strip arriving from the right with the
    // counter, and finally the timeline along the bottom.
    if (experience) {
      tl.to(experience, { opacity: 0.75, y: 0, filter: fx(0), ease: 'none', duration: 0.1 }, 0.22);
    }
    if (experienceUnderlineSvg) {
      tl.to(experienceUnderlineSvg, { opacity: 1, ease: 'none', duration: 0.06 }, 0.3);
    }
    if (experienceUnderline) {
      tl.to(experienceUnderline, { strokeDashoffset: 0, ease: 'none', duration: 0.07 }, 0.3);
    }
    if (splitLight) {
      tl.to(splitLight.chars, { ...settle, duration: 0.13, stagger: 0.012 }, 0.34);
    }
    if (splitAccent) {
      tl.to(splitAccent.chars, { ...settle, duration: 0.13, stagger: 0.012 }, 0.42);
    }
    if (visit) {
      tl.to(visit, { opacity: 1, y: 0, scale: 1, rotate: VISIT_TILT, filter: fx(0), ease: 'none', duration: 0.1 }, 0.52);
    }
    if (visitRingSvg) {
      tl.to(visitRingSvg, { opacity: 1, ease: 'none', duration: 0.05 }, 0.56);
    }
    if (visitRing) {
      // Longer than the straight underlines get: it is a full loop of
      // stroke, and drawing it at their pace reads as a flick rather than
      // as someone circling the words.
      tl.to(visitRing, { strokeDashoffset: 0, ease: 'none', duration: 0.14 }, 0.56);
    }
    if (counterParts.length) {
      tl.to(counterParts, { ...settle, duration: 0.16, stagger: 0.03 }, 0.6);
    }
    // Arrives from the right, the direction it will keep travelling once
    // the pin takes over.
    tl.to(gallery, { opacity: 1, xPercent: 0, filter: fx(0), ease: 'none', duration: 0.28 }, 0.6);
    if (scrollHint) {
      tl.to(scrollHint, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.09 }, 0.8);
    }
    if (timelineItems.length) {
      tl.to(timelineItems, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.09, stagger: 0.03 }, 0.82);
    }
    if (more) {
      tl.to(more, { opacity: 1, y: 0, scale: 1, rotate: MORE_TILT, filter: fx(0), ease: 'none', duration: 0.08 }, 0.88);
    }
    if (moreRingSvg) {
      tl.to(moreRingSvg, { opacity: 1, ease: 'none', duration: 0.04 }, 0.9);
    }
    if (moreRing) {
      tl.to(moreRing, { strokeDashoffset: 0, ease: 'none', duration: 0.1 }, 0.9);
    }

    // Stays a little alive once settled, the same way the accent half of
    // every other poster heading on the page does.
    if (splitAccent) liveGlitchLoop(splitAccent.chars);

    // Same constant low-amplitude tremor the portfolio's handwritten marks
    // carry — this hint uses the same "Higher Jump" scrawl, so it gets the
    // same treatment. Started once, unconditionally, like those do.
    liveJitter(scrollHintArrow, { rotateBase: 45 });
    // The two mark arrows get the same tremor. Their base rotation cancels
    // the tilt of the mark they sit inside, so each one keeps pointing
    // up-and-out no matter how its button is angled.
    if (visitArrows[0]) liveJitter(visitArrows[0], { rotateBase: -VISIT_TILT });
    if (visitArrows[1]) liveJitter(visitArrows[1], { rotateBase: -MORE_TILT });
  });
}
