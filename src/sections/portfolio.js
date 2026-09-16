import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

import '../styles/portfolio.css';
import { initGalleryMarquee } from '../canvas/galleryMarquee.js';
import { dpx, onViewportResize } from '../utils/viewport.js';
import { liveGlitchLoop, liveJitter } from '../utils/motion.js';
import { GALLERY_ITEMS } from '../utils/galleryImages.js';
import { fx } from '../utils/filters.js';

// Two independent ScrollTriggers on the same element, unlike skills.js's
// pin/scrub pair which share one range: the heading/gallery/subheading
// entrance is scrubbed across the section's normal-flow *approach*
// ('top bottom' -> 'top top'), so it finishes revealing exactly as the
// section docks, and the pin ('top top' -> +=pinDistance) only starts
// afterwards, holding it there for a dwell period. Sharing one range (like
// skills.js does) would leave the scattered/invisible starting state
// sitting in full view, unrevealed, for the entire approach — see the
// comment at the timeline below. The graffiti signature's own entrance is
// neither of those: it's a fixed-duration, play-once timeline fired by
// onEnter/onLeaveBack on the pin's ScrollTrigger, not scrubbed at all — see
// the comment where it's built for why. The canvas marquee runs on its own
// rAF loop independent of all three — it's already auto-scrolling before,
// during and after every range — so the pin's dwell time just gives
// scrolling (which the pin is absorbing instead of moving the page)
// something to do: it feeds the marquee's speed via getScrollTop below.

// How long the works section holds. Lengthened from 2x to 2.4x when the
// sidebar started transforming inside it (see ui/sidebarPortfolio.js): the
// pin's own two acts already filled the old distance, and the sidebar needed
// room at the front of it that did not come out of theirs.
export function portfolioPinDistance() {
  return 2.4 * window.innerHeight;
}

export function initPortfolio() {
  const section = document.querySelector('#portfolio');
  const lineMade = document.querySelector('.portfolio-heading-line--light');
  const lineBroke = document.querySelector('.portfolio-heading-line--accent');
  const underline = document.querySelector('.portfolio-heading-underline-stroke');
  const underlineSvg = document.querySelector('.portfolio-heading-underline');
  const galleryWrap = document.querySelector('.portfolio-gallery');
  const canvas = document.querySelector('.portfolio-gallery-canvas');
  const subLight = document.querySelector('.portfolio-subheading-line--light');
  const subAccent = document.querySelector('.portfolio-subheading-line--accent');
  const subUnderline = document.querySelector('.portfolio-subheading-underline-stroke');
  const subUnderlineSvg = document.querySelector('.portfolio-subheading-underline');
  const graffiti = document.querySelector('.portfolio-graffiti');
  const graffitiArrowImg = document.querySelector('.portfolio-graffiti-arrow-img');
  const graffitiText = document.querySelector('.portfolio-graffiti-text');
  const headingEl = document.querySelector('.portfolio-heading');
  // The whole closing block, not just the subheading: act two carries it out
  // of frame as one piece, and the claim under it has to travel with the line
  // it belongs to rather than being left behind mid-air.
  const closingEl = document.querySelector('.portfolio-closing');
  const claim = document.querySelector('.portfolio-claim');
  const experience = document.querySelector('.portfolio-experience');
  const experienceUnderline = document.querySelector('.portfolio-experience-underline-stroke');
  const experienceUnderlineSvg = document.querySelector('.portfolio-experience-underline');
  const brand = document.querySelector('.portfolio-brand');
  const brandUnderline = document.querySelector('.portfolio-brand-underline-stroke');
  const brandUnderlineSvg = document.querySelector('.portfolio-brand-underline');
  const brandArrowImg = document.querySelector('.portfolio-brand-arrow-img');
  const brandSubtitle = document.querySelector('.portfolio-brand-subtitle');
  const brandNote = document.querySelector('.portfolio-brand-note');
  const stats = document.querySelector('.portfolio-stats');
  const moreWork = document.querySelector('.portfolio-more-work');
  const moreWorkText = document.querySelector('.portfolio-more-work-text');
  const moreWorkArrow = document.querySelector('.portfolio-more-work-arrow');

  if (!section || !lineMade || !lineBroke) return;

  // The keyboard/screen-reader counterpart to the canvas strip, built from
  // the very list the canvas draws from so the two can never disagree about
  // which theme is which.
  const galleryLinks = document.querySelector('.portfolio-gallery-links');
  if (galleryLinks) {
    galleryLinks.innerHTML = '';
    GALLERY_ITEMS.forEach((item) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = item.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `${item.name} — WordPress theme demo`;
      li.appendChild(a);
      galleryLinks.appendChild(li);
    });
  }

  const marquee = canvas ? initGalleryMarquee(canvas, GALLERY_ITEMS) : null;

  // Wider than a single viewport now that the pin holds two full "acts"
  // (the graffiti's own dwell, then the whole scene-one -> scene-two
  // handoff below) — 1x was tuned back when the dwell was just a gallery
  // auto-scrolling under a static signature; cramming the new content into
  // that same distance would rush all of it. Bumped again from 1.7x to 2x
  // to give the scatter-exit (now three separately-timed departures
  // instead of one wrapper fade) and the later scene-two entrance both
  // real room.
  // A function, not a value captured at init — ScrollTrigger re-evaluates
  // it on every refresh, so a resize re-pins for the viewport it ended up
  // at rather than the one the page was loaded into. Exported, because the
  // sidebar's own change of face rides this same range and a second copy of
  // the number would be a second thing to remember to change.
  const pinDistance = portfolioPinDistance;

  // onEnter/onLeaveBack fire once each, exactly when the pin's start/end
  // boundary is crossed — unlike a scrub tween (see the old graffiti
  // reveal this replaced), they don't re-run for every tiny scroll-position
  // wobble near that boundary, so trackpad momentum or ScrollSmoother's own
  // lag settling right at 'top top' can't flicker it. graffitiEnter is
  // defined below, after the DOM it touches has been split/scattered.
  let graffitiEnter = () => {};
  let graffitiLeaveBack = () => {};
  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${pinDistance()}`,
    pin: true,
    pinSpacing: true,
    invalidateOnRefresh: true,
    onEnter: () => graffitiEnter(),
    onLeaveBack: () => graffitiLeaveBack(),
  });

  // Same belt-and-suspenders as skills.js: hide the underline synchronously
  // via the SVG wrapper's opacity so nothing flashes full-length before the
  // dash-offset below is in place.
  if (underline && underlineSvg) {
    gsap.set(underlineSvg, { opacity: 0 });
    const underlineLength = underline.getTotalLength() + 8;
    gsap.set(underline, { strokeDasharray: underlineLength, strokeDashoffset: underlineLength });
  }
  if (subUnderline && subUnderlineSvg) {
    gsap.set(subUnderlineSvg, { opacity: 0 });
    const subUnderlineLength = subUnderline.getTotalLength() + 6;
    gsap.set(subUnderline, { strokeDasharray: subUnderlineLength, strokeDashoffset: subUnderlineLength });
  }
  if (experienceUnderline && experienceUnderlineSvg) {
    gsap.set(experienceUnderlineSvg, { opacity: 0 });
    const experienceUnderlineLength = experienceUnderline.getTotalLength() + 6;
    gsap.set(experienceUnderline, { strokeDasharray: experienceUnderlineLength, strokeDashoffset: experienceUnderlineLength });
  }
  if (brandUnderline && brandUnderlineSvg) {
    gsap.set(brandUnderlineSvg, { opacity: 0 });
    const brandUnderlineLength = brandUnderline.getTotalLength() + 8;
    gsap.set(brandUnderline, { strokeDasharray: brandUnderlineLength, strokeDashoffset: brandUnderlineLength });
  }
  // Anchored by measuring actual rendered boxes rather than fixed CSS
  // offsets: top against the gallery's own bottom edge (its height is a
  // clamp(), so a fixed distance would drift out of sync with it across
  // viewport widths). Left is a proportional point across the gap between
  // the content column's edge and wherever "Some of these" actually starts
  // (it's right-aligned, so that start position shifts with both viewport
  // width and how wide the phrase renders) — sitting nearer the gallery's
  // own left edge than flush against the text, per the marked-up
  // screenshot. Re-measured on resize.
  function positionGraffiti() {
    if (!graffiti || !galleryWrap) return;
    graffiti.style.top = `${galleryWrap.offsetTop + galleryWrap.offsetHeight + dpx(16)}px`;
    if (subLight) {
      const contentLeft = galleryWrap.offsetLeft;
      const gapWidth = subLight.offsetLeft - contentLeft;
      graffiti.style.left = `${contentLeft + gapWidth * 0.22}px`;
    }
  }
  positionGraffiti();
  onViewportResize(positionGraffiti);

  document.fonts.load('400 64px "Anton"').then(() => {
    const splitMade = new SplitText(lineMade, { type: 'chars' });
    const splitBroke = new SplitText(lineBroke, { type: 'chars' });
    const splitSubLight = subLight ? new SplitText(subLight, { type: 'chars' }) : null;
    const splitSubAccent = subAccent ? new SplitText(subAccent, { type: 'chars' }) : null;
    const splitBrand = brand ? new SplitText(brand, { type: 'chars' }) : null;

    // Re-anchor after both the Anton font landing AND SplitText's own DOM
    // rewrite (every character becomes its own inline-block div, which
    // measurably shifts the heading's line-height versus plain text) —
    // measuring any earlier caught the gallery mid-shift and landed ~30px
    // off from the gallery's actual final bottom edge.
    positionGraffiti();

    // dpx(): same scatter distance *relative to the type* at every viewport
    // — see the matching note in skills.js.
    function scatter(chars) {
      chars.forEach((char) => {
        gsap.set(char, {
          x: dpx(gsap.utils.random(-46, 46)),
          y: dpx(gsap.utils.random(-26, 26)),
          rotate: gsap.utils.random(-16, 16),
          filter: fx(10),
          opacity: 0,
        });
      });
    }

    scatter(splitMade.chars);
    scatter(splitBroke.chars);
    if (splitSubLight) scatter(splitSubLight.chars);
    if (splitSubAccent) scatter(splitSubAccent.chars);
    if (galleryWrap) gsap.set(galleryWrap, { opacity: 0, y: dpx(30), filter: fx(10) });
    if (graffitiText) {
      // Base scrawled tilt lives here (via GSAP), not in CSS — liveJitter
      // below settles back to this same rotate value every cycle, and a
      // GSAP tween writes the whole transform as one inline style, so a
      // plain CSS transform:rotate() on this element would just get
      // clobbered the first time GSAP touches it.
      gsap.set(graffitiText, { opacity: 0, y: dpx(10), filter: fx(6), rotate: -8 });
    }
    if (graffitiArrowImg) {
      gsap.set(graffitiArrowImg, { opacity: 0, y: dpx(10), scale: 0.85, transformOrigin: '15% 85%', filter: fx(6) });
    }
    if (claim) gsap.set(claim, { opacity: 0, y: dpx(12), filter: fx(6) });
    if (experience) gsap.set(experience, { opacity: 0, y: dpx(14), filter: fx(8) });
    if (splitBrand) scatter(splitBrand.chars);
    if (brandArrowImg) {
      // Starts slightly above rest (y:-10) rather than below, since it
      // reads as extending downward out of the brand heading above it,
      // not rising up into place the way the rest of this section's
      // reveals do.
      gsap.set(brandArrowImg, { opacity: 0, y: dpx(-10), scale: 0.8, filter: fx(6) });
    }
    if (brandSubtitle) gsap.set(brandSubtitle, { opacity: 0, y: dpx(14), filter: fx(8) });
    if (brandNote) gsap.set(brandNote, { opacity: 0, y: dpx(12), filter: fx(6) });
    if (stats) gsap.set(stats, { opacity: 0, y: dpx(12), filter: fx(6) });
    if (moreWork) gsap.set(moreWork, { opacity: 0, y: dpx(12), filter: fx(6) });

    // Deliberately NOT tied to the pin's own 'top top'..+=pinDistance
    // range. The scattered/invisible starting state (gsap.set above) is
    // already sitting at its normal-flow position the moment the page
    // loads — if the reveal only started once the pin engages, the section
    // would spend the entire viewport-height of normal scroll it takes to
    // approach 'top top' sitting fully in view but fully invisible, which
    // reads as a dead, empty stretch of scrolling. Scrubbing across the
    // approach itself ('top bottom' -> 'top top') means the reveal finishes
    // exactly as the pin engages, so nothing is ever visible-but-blank.
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        end: 'top top',
        scrub: 0.35,
      },
    });

    // Same filler-tween trick as skills.js: without something spanning the
    // timeline's full nominal range, its natural duration would just be
    // "wherever the last real tween ends" (0.7, here) — and since scrub
    // maps scroll-progress 0..1 straight onto timeline *progress* 0..1,
    // every position label below would then fire early by a factor of
    // 1/0.7, not at the scroll-fraction its number suggests.
    tl.to({}, { duration: 1 }, 0);

    const settle = { x: 0, y: 0, rotate: 0, filter: fx(0), opacity: 1, ease: 'none' };

    // Held off until 0.35 rather than starting at 0: at progress 0 the
    // section has only just touched the viewport's bottom edge (nothing on
    // screen yet), and the heading itself doesn't fully clear into view
    // until roughly a quarter of the way through this approach — starting
    // the reveal immediately made it finish while still low on the screen,
    // barely on-screen. Waiting until the section (and heading) are
    // substantially visible first reads as intentional instead of rushed.
    tl.to(splitMade.chars, { ...settle, duration: 0.13, stagger: 0.01 }, 0.35)
      .to(splitBroke.chars, { ...settle, duration: 0.13, stagger: 0.01 }, 0.42);

    if (underlineSvg) {
      tl.to(underlineSvg, { opacity: 1, ease: 'none', duration: 0.1 }, 0.58);
    }
    if (underline) {
      tl.to(underline, { strokeDashoffset: 0, ease: 'none', duration: 0.1 }, 0.58);
    }
    if (galleryWrap) {
      tl.to(galleryWrap, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.22 }, 0.64);
      // The strip takes its entrance speed at the moment it starts becoming
      // visible, so it is already slowing by the time it is fully in. A
      // timeline call rather than an observer: what "appears" means here is
      // this tween, and the call fires crossing this point in either
      // direction, so coming back up the page replays it.
      if (marquee) tl.call(() => marquee.burst(), null, 0.64);
    }

    // The subheading's own light/accent/underline trio mirrors the main
    // heading's — same structure, same reveal shape, just later in the
    // sequence since it sits below the gallery.
    if (splitSubLight) {
      tl.to(splitSubLight.chars, { ...settle, duration: 0.12, stagger: 0.009 }, 0.72);
    }
    if (splitSubAccent) {
      tl.to(splitSubAccent.chars, { ...settle, duration: 0.12, stagger: 0.009 }, 0.78);
    }
    if (subUnderlineSvg) {
      tl.to(subUnderlineSvg, { opacity: 1, ease: 'none', duration: 0.08 }, 0.9);
    }
    if (subUnderline) {
      tl.to(subUnderline, { strokeDashoffset: 0, ease: 'none', duration: 0.09 }, 0.9);
    }
    // Last, under the line it is a footnote to.
    if (claim) {
      tl.to(claim, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.08 }, 0.94);
    }

    // Not scrubbed — deliberately a fixed-duration, play-once timeline
    // fired by the onEnter/onLeaveBack callbacks on the pin's own
    // ScrollTrigger (declared above, before this DOM existed). "Some of
    // these" already finishes revealing well before the pin engages (its
    // tween above ends at 0.84 of the *approach*, the pin engaging is
    // 1.0 of that same range), so a short flat delay after onEnter reads
    // as "a beat after" without needing more scroll-tied choreography —
    // and paused()+play()/reverse() can't flicker on scroll noise the way
    // the scrub version before it did, since nothing here re-samples
    // scroll position once it's started.
    // Guarded so liveJitter only ever starts once: onEnter/onLeaveBack can
    // both fire more than once each if the reader scrolls back and forth
    // across the pin boundary, and onComplete fires on every forward
    // completion — without the guard, each re-entry would stack another
    // independent liveJitter loop onto the same elements, fighting the
    // earlier ones for the same transform/filter properties.
    let jitterStarted = false;
    const graffitiEntranceTl = gsap.timeline({ paused: true, onComplete: () => {
      if (jitterStarted) return;
      jitterStarted = true;
      liveJitter(graffitiText, { rotateBase: -8 });
      liveJitter(graffitiArrowImg);
    } });
    if (graffitiText) {
      graffitiEntranceTl.to(graffitiText, { opacity: 1, y: 0, filter: fx(0), ease: 'power2.out', duration: 0.4 }, 0);
    }
    if (graffitiArrowImg) {
      graffitiEntranceTl.to(graffitiArrowImg, { opacity: 1, y: 0, scale: 1, filter: fx(0), ease: 'power2.out', duration: 0.4 }, 0.15);
    }

    let graffitiDelayedCall;
    graffitiEnter = () => {
      graffitiDelayedCall = gsap.delayedCall(0.3, () => graffitiEntranceTl.play());
    };
    graffitiLeaveBack = () => {
      if (graffitiDelayedCall) graffitiDelayedCall.kill();
      graffitiEntranceTl.reverse();
    };

    // Act two: scrubbed across the same pin range the graffiti's onEnter
    // fires on, but starting its own first tween at 0.2 rather than
    // immediately — enough scroll distance that a reader moving at a
    // normal pace has already seen the graffiti's ~0.85s fixed-time
    // entrance (0.3s delay + ~0.55s of tweening) land before scene-one
    // starts breaking apart. It's an approximation, not a guarantee (this
    // timeline only knows scroll progress, the graffiti's only knows
    // elapsed time, and nothing here reconciles the two) — a very fast
    // flick through the pin could still outrun it. scrub, not
    // onEnter/onLeaveBack: unlike the graffiti's own reveal, this one's
    // first real tween sits well clear of the pin's 'top top' boundary, so
    // there's no tight scroll-noise/threshold interaction here to guard
    // against, and a multi-stage handoff like this is exactly what
    // scrubbing to scroll position is for.
    const act2 = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => `+=${pinDistance()}`,
        scrub: 0.35,
        invalidateOnRefresh: true,
        // Which of the two scenes owns the pointer. The threshold sits in the
        // gap between scene one finishing its exit (0.2 -> ~0.6) and scene
        // two being substantially in (0.5 -> 0.94) — see the pointer-events
        // note on .portfolio-scene-two.
        //
        // The strip's own on/off rides here rather than on a trigger of its
        // own: this callback is already sampling exactly the progress the
        // answer depends on. Its threshold is later than the scene handoff —
        // 0.58 is where the gallery's own exit tween (0.24, duration 0.32)
        // has finished taking it to opacity 0, and there is no sense drawing
        // seven filtered slides a frame into something that has gone.
        onUpdate: (self) => {
          section.classList.toggle('is-scene-two', self.progress > 0.5);
          if (marquee) marquee.setRunning(self.progress < 0.58);
        },
      },
    });
    act2.to({}, { duration: 1 }, 0);

    // Three separate departures instead of one wrapper-level fade: the
    // heading flies up-left, the gallery sinks and shrinks, the subheading
    // flies down-right — an actual scatter in different directions rather
    // than a single block dissolving in place, with enough duration
    // (0.3–0.34s of scrubbed range each) and blur to read as coming apart
    // rather than a quick fade.
    const exitEase = 'power2.in';
    if (headingEl) {
      act2.to(headingEl, { opacity: 0, x: dpx(-70), y: dpx(-40), rotate: -7, filter: fx(16), ease: exitEase, duration: 0.32 }, 0.2);
    }
    if (graffiti) {
      act2.to(graffiti, { opacity: 0, y: dpx(16), filter: fx(8), ease: exitEase, duration: 0.24 }, 0.22);
    }
    if (galleryWrap) {
      act2.to(galleryWrap, { opacity: 0, scale: 0.86, y: dpx(24), filter: fx(16), ease: exitEase, duration: 0.32 }, 0.24);
    }
    if (closingEl) {
      act2.to(closingEl, { opacity: 0, x: dpx(70), y: dpx(40), rotate: 7, filter: fx(16), ease: exitEase, duration: 0.32 }, 0.28);
    }

    if (experience) {
      act2.to(experience, { opacity: 0.75, y: 0, filter: fx(0), ease: 'none', duration: 0.09 }, 0.5);
    }
    if (experienceUnderlineSvg) {
      act2.to(experienceUnderlineSvg, { opacity: 1, ease: 'none', duration: 0.06 }, 0.57);
    }
    if (experienceUnderline) {
      act2.to(experienceUnderline, { strokeDashoffset: 0, ease: 'none', duration: 0.07 }, 0.57);
    }
    if (splitBrand) {
      act2.to(splitBrand.chars, { ...settle, duration: 0.14, stagger: 0.012 }, 0.62);
    }
    if (brandUnderlineSvg) {
      act2.to(brandUnderlineSvg, { opacity: 1, ease: 'none', duration: 0.08 }, 0.8);
    }
    if (brandUnderline) {
      act2.to(brandUnderline, { strokeDashoffset: 0, ease: 'none', duration: 0.09 }, 0.8);
    }
    if (brandArrowImg) {
      act2.to(brandArrowImg, { opacity: 1, y: 0, scale: 1, filter: fx(0), ease: 'none', duration: 0.09 }, 0.78);
    }
    if (brandSubtitle) {
      act2.to(brandSubtitle, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.08 }, 0.9);
    }
    // A beat behind the line it annotates.
    if (brandNote) {
      act2.to(brandNote, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.07 }, 0.93);
    }
    // Quick pop-ins rather than long fades — secondary footer chrome, not
    // the main reveal, and there's little scrubbed range left this late
    // in the sequence anyway.
    if (stats) {
      act2.to(stats, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.05 }, 0.92);
    }
    if (moreWork) {
      act2.to(moreWork, { opacity: 1, y: 0, filter: fx(0), ease: 'none', duration: 0.05 }, 0.94);
    }

    liveGlitchLoop(splitBroke.chars);
    if (splitSubAccent) liveGlitchLoop(splitSubAccent.chars);
    if (splitBrand) liveGlitchLoop(splitBrand.chars);

    // Same continuous tremor as the graffiti's WPKOI text + arrow — these
    // three are the scene-two equivalents of that same "small handwritten
    // mark" role (the big WPKoi heading itself already has its own
    // liveGlitchLoop above, matching how the other big poster headings are
    // treated). No jitterStarted-style guard needed here the way the
    // graffiti's jitter required one: that guard existed because
    // onEnter/onLeaveBack can each re-fire on repeated scroll direction
    // changes, which could stack duplicate loops — these three just start
    // once, unconditionally, the same way the liveGlitchLoop calls above
    // already do regardless of scroll position.
    liveJitter(brandArrowImg);
    liveJitter(moreWorkText);
    liveJitter(moreWorkArrow);
  });
}
