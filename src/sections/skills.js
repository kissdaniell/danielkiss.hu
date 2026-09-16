import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

import '../styles/skills.css';
import { dpx } from '../utils/viewport.js';
import { liveGlitchLoop, liveJitter } from '../utils/motion.js';
import { debugOff } from '../utils/debug.js';
import { heroScrollDistance, LIQUID_ALT_OPACITY } from './hero.js';
import { isPortrait, onLayoutMode } from '../utils/layout.js';
import { fx } from '../utils/filters.js';

// The skills heading lives as .hero's own first child — real, in-flow
// content, not a fixed overlay — and gets pinned there via ScrollTrigger
// for the whole time .hero is scrolling through (the same range the
// sidebar's own transition uses). GSAP's pin (with pinSpacing, its default)
// inserts exactly enough extra document space to cover the pinned
// duration, so the moment it releases, #skills picks up right where the
// panel left off with no jump and no second copy of anything to keep in
// sync — one element, pinned then released, instead of two elements
// pretending to hand off to each other.
export function initSkills() {
  const heroSpacer = document.querySelector('.hero');
  const panel = document.querySelector('.skills-panel');
  const lineWork = document.querySelector('.skills-heading-line--light');
  const lineWeird = document.querySelector('.skills-heading-line--accent');
  const underline = document.querySelector('.skills-heading-underline-stroke');
  const underlineSvg = document.querySelector('.skills-heading-underline');
  const subheading = document.querySelector('.skills-subheading');
  const statItems = Array.from(document.querySelectorAll('.skills-stat'));
  const statArrow = document.querySelector('.skills-stat-arrow');
  const categoryItems = Array.from(document.querySelectorAll('.skills-category'));

  if (!heroSpacer || !panel || !lineWork || !lineWeird) return;

  // The pin needs to stay active for the *entire* targetHeroHeight scroll
  // distance — the same range the sidebar transition and this file's own
  // reveal timeline below both use for their 0..1 progress — so the panel
  // stays put until the reveal (and the sidebar) have actually finished,
  // releasing right around when the sidebar has fully assembled instead
  // of bailing out partway through. pinSpacing then adds this on top of
  // the panel's own height for .hero's rendered height (see hero.css) —
  // taller than targetHeroHeight, which is expected: once released, the
  // panel scrolls away normally by its own height before #skills arrives.
  //
  // Only the heading/subheading/stats live inside this pinned panel — the
  // 4 category blocks live in #skills below and reveal on normal scroll
  // instead (see the ScrollTrigger loop near the bottom of this file), so
  // this number only has to cover what's actually pinned. heroTransition.js
  // has its own copy of this same number (its sidebar-assembly timeline) —
  // it must stay equal to this one, or the pin release and "sidebar fully
  // assembled" moment drift apart.
  // A function, not a number captured at init: ScrollTrigger re-evaluates
  // it on every refresh, so a resize re-pins for the new viewport's height
  // instead of holding the height the page happened to load at. Every
  // hero-scoped range on the page (this pin, the reveal timeline below,
  // heroTransition.js's sidebar assembly) reads the same helper.
  const targetHeroHeight = heroScrollDistance;

  ScrollTrigger.create({
    trigger: panel,
    start: 'top top',
    end: () => `+=${targetHeroHeight()}`,
    pin: true,
    pinSpacing: true,
    invalidateOnRefresh: true,
    // The panel only starts answering the pointer once its own reveal is
    // genuinely under way — the characters begin settling at 0.23 of this
    // same range. Before that it is an invisible full-viewport sheet lying
    // over the hero, and clicks and text selections meant for the hero were
    // landing on it (see the pointer-events note on .skills-panel). Left as
    // it stands past the end of the range, so the section keeps it once the
    // pin releases.
    onUpdate: (self) => panel.classList.toggle('is-live', self.progress > 0.2),
  });

  // Hidden synchronously, immediately — not gated behind the font-load
  // promise below, so there's no flash of the full line before JS catches
  // up. Belt-and-suspenders: opacity:0 on the *SVG wrapper* is the real
  // guarantee (padding the dasharray/dashoffset alone didn't fully hide
  // whatever was still leaking through — likely the stroke's own render
  // path under the markerRough displacement filter, not just a length
  // rounding gap), and dashoffset is still driven to the padded length so
  // the line still visibly draws itself on once revealed. Opacity has to
  // live on the wrapper, not the path itself — the path already has its
  // own hero-underline-glitch CSS animation cycling opacity ~0.87–1
  // forever, and a running CSS animation wins over a plain inline style on
  // the same property, so setting opacity here on the path would just get
  // overridden every frame.
  if (underline && underlineSvg) {
    gsap.set(underlineSvg, { opacity: 0 });
    const underlineLength = underline.getTotalLength() + 8;
    gsap.set(underline, { strokeDasharray: underlineLength, strokeDashoffset: underlineLength });
  }

  // Scale only — x/y/rotate/filter belong to liveJitter from here on, and two
  // writers on one transform component is how a mark ends up stuck at an angle
  // nobody chose.
  if (statArrow) {
    gsap.set(statArrow, { scale: 0.8, transformOrigin: '15% 85%' });
  }

  // ?off=reveal skips the panel's whole entrance: no SplitText, no scattered
  // starting state, no scrubbed timeline. Sixty-odd characters each carrying
  // an animated blur is the other half of what runs during this scroll, and
  // this is how you find out which half you are paying for.
  const revealPromise = debugOff('reveal') ? null : Promise.all([
    document.fonts.load('400 64px "Anton"'),
    document.fonts.load('500 16px "Satoshi"'),
  ]);

  if (revealPromise) revealPromise.then(() => {
    const splitWork = new SplitText(lineWork, { type: 'chars' });
    const splitWeird = new SplitText(lineWeird, { type: 'chars' });
    const splitSub = new SplitText(subheading, { type: 'words' });
    const splitStatNumbers = statItems.map((item) => {
      const number = item.querySelector('.skills-stat-number');
      return number ? new SplitText(number, { type: 'chars' }) : null;
    });
    const statLabelLines = statItems.map((item) => Array.from(item.querySelectorAll('.skills-stat-label-line')));

    // Each character starts scattered — small random offset, tilt and blur
    // — so the reveal reads as pieces flying in and settling, not a plain
    // fade, echoing the glitch/tear language used elsewhere on the site.
    // Offsets run through dpx() so the scatter is the same *visual* distance
    // relative to the type it belongs to at every viewport, rather than a
    // fixed pixel throw that reads as a huge explosion next to small text on
    // a narrow window and a timid nudge on a wide one.
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

    scatter(splitWork.chars);
    scatter(splitWeird.chars);
    gsap.set(splitSub.words, { y: dpx(22), opacity: 0, filter: fx(8) });

    splitStatNumbers.forEach((split) => {
      if (split) scatter(split.chars);
    });
    statLabelLines.forEach((lines) => {
      gsap.set(lines, { y: dpx(14), opacity: 0, filter: fx(6) });
    });

    // Using an explicit pixel distance rather than 'bottom top' — see the
    // matching note in heroTransition.js for why 'bottom top' can't be
    // trusted here once a child of this same element is pinned.
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: heroSpacer,
        start: 'top top',
        end: () => `+=${targetHeroHeight()}`,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });

    // Every other tween here is much shorter than the timeline's own full
    // range. Without something spanning that whole range, the timeline's
    // natural duration would just be "whenever the last real tween ends"
    // instead of 1 — and a scroll-fraction of, say, 0.3 would then map to
    // an earlier moment than intended. This keeps position labels below
    // equal to true scroll fractions.
    tl.to({}, { duration: 1 }, 0);

    const settle = { x: 0, y: 0, rotate: 0, filter: fx(0), opacity: 1, ease: 'none' };
    const settleLine = { y: 0, opacity: 1, filter: fx(0), ease: 'none' };

    tl.to(splitWork.chars, { ...settle, duration: 0.11, stagger: 0.009 }, 0.23)
      .to(splitWeird.chars, { ...settle, duration: 0.11, stagger: 0.009 }, 0.3);

    if (underlineSvg) {
      tl.to(underlineSvg, { opacity: 1, ease: 'none', duration: 0.09 }, 0.57);
    }

    if (underline) {
      tl.to(underline, { strokeDashoffset: 0, ease: 'none', duration: 0.09 }, 0.57);
    }

    tl.to(splitSub.words, { ...settleLine, duration: 0.075, stagger: 0.009 }, 0.59);

    // Stats cascade in one item at a time, each its own quick number
    // scatter-in followed a beat later by its label lines — starting only
    // once the subheading has finished, so nothing double-reveals.
    const statsStart = 0.72;
    const statStagger = 0.055;
    splitStatNumbers.forEach((split, i) => {
      if (!split) return;
      const itemStart = statsStart + i * statStagger;
      tl.to(split.chars, { ...settle, duration: 0.09, stagger: 0.008 }, itemStart);
      tl.to(statLabelLines[i], { ...settleLine, duration: 0.08, stagger: 0.02 }, itemStart + 0.03);
    });

    // The arrow arrives after the figure it points at has settled — pointing
    // at an empty space that then fills in is the wrong order for a gesture.
    if (statArrow) {
      tl.to(statArrow, { opacity: 1, scale: 1, ease: 'power2.out', duration: 0.08 }, statsStart + 0.1);
    }

    // Stays a little alive once settled.
    liveGlitchLoop(splitWeird.chars);
    liveJitter(statArrow);
  });

  // The hero's own liquid video fades out as the sidebar assembles (see
  // heroTransition.js) — .hero-liquid itself and its canvas stay alive
  // (opacity untouched there) so this can fade a second video in
  // underneath that same canvas as #skills scrolls into view. Once
  // revealed it just stays — the video is a background layer, not
  // content, so it carries on for the rest of the page instead of fading
  // out again on some schedule tied to #skills specifically.
  //
  // Starts at 'top 115%', i.e. while #skills is still fully below the
  // viewport — that's before video1's own fade-out (which runs the whole
  // hero pin, ending exactly at #skills's 'top bottom') has quite finished,
  // for a bit of real cross-fade instead of a hard handoff. The fade-in
  // itself spans ~65% of a viewport height, well short of video1's own
  // much longer fade, but long enough to read as gradual rather than a
  // sudden pop-in. Target opacity is 0.3, not 1 — at full strength this
  // video (which never fades back out) reads as too intense as a
  // permanent background for the rest of the page; video1 only ever has
  // to hold attention for the hero itself, so opacity 1 suits it but not
  // this one.
  const liquidVideoAlt = document.querySelector('.hero-liquid-video--alt');
  const skillsSection = document.querySelector('#skills');

  // The blur half of both of this video's transitions is written by hand
  // rather than tweened, and the reason is the same one heroTransition.js
  // gives for the hero video: this is a fixed, full-viewport <video>, and a
  // CSS filter on one costs a multi-pass pass over a million-odd pixels every
  // frame — on top of which *any* non-`none` filter, `blur(0px)` included,
  // makes the compositor keep a separate render surface for the element
  // instead of drawing the video straight through.
  //
  // That last part is what made the old version expensive far beyond its own
  // range: once the fade-in finished, GSAP left `filter: blur(0px)` sitting
  // inline on a full-screen video that then stays on screen for the entire
  // rest of the page — so every section below paid for a render surface that
  // was doing nothing. Written this way the property goes to a literal `none`
  // the moment the radius reaches zero, and comes back if the reader scrolls
  // up into the range again.
  //
  // The radius is also confined to a fraction of each range and quantized to
  // 2px steps. On a background layer sitting at 0.3 opacity behind
  // everything, no one can tell 14px from 15px — but the browser can, and it
  // re-filters the whole frame for the difference.
  let altFilter = '';
  function setAltBlur(px) {
    const next = px > 0 ? fx(px) : 'none';
    if (next === altFilter) return;
    altFilter = next;
    liquidVideoAlt.style.filter = next;
  }
  // 0 -> in focus, 1 -> fully blurred, quantized.
  const blurAt = (t) => Math.round((24 * Math.min(Math.max(t, 0), 1)) / 2) * 2;

  if (liquidVideoAlt && skillsSection) {
    const altIn = gsap.timeline({
      scrollTrigger: {
        trigger: skillsSection,
        start: 'top 115%',
        end: 'top 50%',
        scrub: 0.5,
      },
      // Arrives out of focus and is sharp by 45% of the way in, well before
      // the opacity fade finishes — which is how it read anyway.
      onUpdate() {
        setAltBlur(blurAt(1 - this.progress() / 0.45));
      },
    }).to(liquidVideoAlt, { opacity: LIQUID_ALT_OPACITY, ease: 'none', duration: 1 }, 0);

    // ---- ...and none of it below 4:3.
    //
    // The whole point of this video is to keep the liquid layer meaning
    // something for the rest of the page once the hero's own has gone. There
    // is no rest of the page for that layer upright: it leaves at the end of
    // the opening frame and stays gone (ui/liquidRetire.js), so a second
    // video fading in underneath it would be fading in behind nothing. Its
    // file is never even fetched there (ui/deferredMedia.js); this is what
    // makes sure a window turned upright mid-page stops the one that already
    // was.
    const applyMode = (portrait) => {
      const st = altIn.scrollTrigger;
      if (st) {
        if (portrait) st.disable(true);
        else st.enable();
      }
      if (!portrait) return;
      setAltBlur(0);
      gsap.set(liquidVideoAlt, { opacity: 0 });
      liquidVideoAlt.pause();
    };
    applyMode(isPortrait());
    onLayoutMode(applyMode);
  }

  // The exit is not here any more. It used to run on the approach to the
  // closing frame, which kept this layer alive — solver, videos and all —
  // through four sections that had no use for it. It now leaves at #portfolio,
  // on the same beat the sidebar's portrait gives way to the grid; see
  // ui/liquidRetire.js, which also switches the layer off once it has gone.

  // The 4 skill-category blocks live in #skills, below the pinned panel —
  // once the pin above releases, this section scrolls normally like any
  // other. Each block's reveal is scrubbed to its own local scroll range
  // (its top crossing from 90% down the viewport to 55%) rather than a
  // timed play-once animation: a timed reveal can finish playing while the
  // block is still off-screen or mid-scroll on a fast flick, since nothing
  // ties its progress back to where the page actually is — scrubbing makes
  // that impossible, since progress *is* scroll position.
  if (categoryItems.length) {
    Promise.all([
      document.fonts.load('400 64px "Anton"'),
      document.fonts.load('500 16px "Satoshi"'),
    ]).then(() => {
      categoryItems.forEach((item) => {
        const index = item.querySelector('.skills-category-index');
        const title = item.querySelector('.skills-category-title');
        const tags = item.querySelector('.skills-category-tags');
        const note = item.querySelector('.skills-category-note');
        if (!title) return;

        const splitTitle = new SplitText(title, { type: 'words' });

        gsap.set(index, { y: dpx(8), opacity: 0, filter: fx(5) });
        gsap.set(splitTitle.words, { y: dpx(16), opacity: 0, filter: fx(7) });
        gsap.set(tags, { y: dpx(12), opacity: 0, filter: fx(6) });

        // The wrapper is what the reveal moves; the tremor below runs on the
        // two children inside it. Keeping them apart is what stops the two
        // animations writing y and filter on the same element.
        if (note) {
          gsap.set(note, { y: dpx(10), opacity: 0, filter: fx(6) });
          liveJitter(note.querySelector('.skills-category-note-text'));
          liveJitter(note.querySelector('.skills-category-note-arrow'), { rotateBase: 45 });
        }

        const settleLine = { y: 0, opacity: 1, filter: fx(0), ease: 'none' };

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: item,
            start: 'top 90%',
            end: 'top 55%',
            scrub: 0.4,
          },
        })
          .to(index, { ...settleLine, duration: 0.3 }, 0)
          .to(splitTitle.words, { ...settleLine, duration: 0.4, stagger: 0.08 }, 0.15)
          .to(tags, { ...settleLine, duration: 0.3 }, 0.45);

        // Last in, after the heading it is remarking on has arrived.
        if (note) tl.to(note, { ...settleLine, duration: 0.3 }, 0.6);
      });
    });
  }
}
