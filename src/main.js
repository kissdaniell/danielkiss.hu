import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';

import './styles/main.css';
import './styles/ruler.css';
import './styles/sidebar.css';

import { initHero } from './sections/hero.js';
import { initSkills } from './sections/skills.js';
import { initPortfolio } from './sections/portfolio.js';
import { initWpkoi } from './sections/wpkoi.js';
import { initAwards } from './sections/awards.js';
import { initTransition } from './sections/transition.js';
import { initContact } from './sections/contact.js';
import { initRulers } from './ui/ruler.js';
import { initSidebarNav, initNavScrollspy } from './ui/sidebarNav.js';
import { initHeroTransition, initEmailCopy } from './ui/heroTransition.js';
import { initCornerMarks } from './ui/cornerMarks.js';
import { initSidebarPortfolio } from './ui/sidebarPortfolio.js';
import { initSidebarWpkoi } from './ui/sidebarWpkoi.js';
import { initHeroHeader } from './ui/heroHeader.js';
import { initLiquidRetire } from './ui/liquidRetire.js';
import { initDeferredMedia } from './ui/deferredMedia.js';
import { initMobileMenu } from './ui/mobileMenu.js';
import { initPortraitHero } from './ui/portraitHero.js';
import { initStackYear } from './ui/stackYear.js';
import { initPreloader } from './ui/preloader.js';
import { initDebug, debugOff } from './utils/debug.js';
import { fixSplitAria } from './utils/splitAria.js';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText, Draggable, InertiaPlugin);

// Before anything measures or animates: it puts the ?off= classes on <html>,
// so a bisection is in force from the first style resolution rather than from
// whenever this module happens to finish. No-ops without ?debug or ?off.
initDebug();

// Resize is deliberately absent from this list: src/utils/viewport.js owns
// the resize pass (every module re-measures on one shared debounce, then it
// calls ScrollTrigger.refresh() once at the end). Leaving ScrollTrigger's
// own resize refresh on would have it re-measuring pins against canvases and
// FLIP boxes that hadn't been rebuilt yet, mid-drag, dozens of times.
ScrollTrigger.config({ autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load' });

ScrollSmoother.create({
  wrapper: '#smooth-wrapper',
  content: '#smooth-content',
  // ?off=smoother drops this to native scrolling. Worth trying early: it
  // changes what drives every scrubbed timeline on the page, and a stutter
  // that survives it is not a smoothing problem.
  smooth: debugOff('smoother') ? 0 : 1.2,
  // Nothing on this page carries data-speed or data-lag, and with `effects`
  // on, ScrollSmoother measures candidates for them on every refresh and
  // keeps a per-tick pass alive for a list that is always empty.
  effects: false,
  // The same address-bar problem utils/viewport.js filters out of its own
  // resize listener, told to GSAP as well: without it ScrollSmoother re-runs
  // its internal measurements when a phone's bar slides away mid-scroll, and
  // every pin on the page is measured against that.
  ignoreMobileResize: true,
});

// GSAP drives the touch scroll itself rather than reading it.
//
// smoothTouch defaults to 0, so on a phone the smoother above steps aside and
// the page scrolls natively — and a native touch scroll is run on the
// compositor and reported to JS asynchronously, in coalesced batches. Every
// pin on this page is positioned from that reported number, so each one was
// drawn a frame or two behind where the finger actually was and then snapped
// forward when the next batch landed. That is the shake: not a measurement
// that is wrong, a measurement that is late. It is also why it reproduces in
// desktop devtools with touch emulation on, where there is no address bar to
// blame.
//
// `type: 'touch'` and not the default 'wheel,touch': with a mouse the
// smoother is already driving every frame from its own ticker and there is
// nothing to normalise, so this stays out of the desktop path entirely.
// allowNestedScroll leaves any inner scrollable element still scrollable.
//
// Passed as a config object rather than `true`, which only re-enables an
// already-built normalizer — with none built yet it would try to set .type on
// the boolean, and module code is strict-mode.
if (matchMedia('(hover: none) and (pointer: coarse)').matches) {
  const startNormalizer = () => ScrollTrigger.normalizeScroll({ type: 'touch', allowNestedScroll: true });
  startNormalizer();

  // Built again once the plate is gone, rather than trusting the one that was
  // switched off underneath it.
  //
  // ui/preloader.js holds the page still with ScrollSmoother.paused(true) —
  // and that, inside GSAP, does `normalizeScroll().disable()` and puts a
  // blocking observer in its place. paused(false) kills the blocker and calls
  // enable() on the same normalizer. What arrives on the other side is a
  // re-enabled instance rather than a fresh one, and on Chrome for Android
  // the first touch after it lands does nothing at all: the browser will not
  // scroll (touch-action is ours) and the normalizer does not either. The
  // second touch works, and everything after it.
  //
  // Discarding it and building a new one costs nothing here — the plate has
  // just left, nothing is animating against the scroll yet — and it removes
  // the question of what a disable/enable cycle leaves behind.
  document.addEventListener('preloader:done', () => {
    ScrollTrigger.normalizeScroll(false);
    startNormalizer();
  }, { once: true });

  // The horizontal axis is taken back off the browser in styles/main.css
  // rather than here — see the touch-action rule there for why a stylesheet
  // and not this line.
}

// Before the sections, and after the smoother it has to hold still.
//
// The plate is already covering the page from the stylesheet inline in the
// document head; this is what gives it something to say and, in due course,
// takes it away. Early because it pauses the scroll, and a reader who arrives
// mid-flick should not spend the opening scrolling a page they cannot see.
initPreloader();

initHero().then(() => initHeroTransition());
initSkills();
initPortfolio();
initWpkoi();
initAwards();
initTransition();
initContact();
initRulers();
initSidebarNav();
initNavScrollspy();
initEmailCopy();
initCornerMarks();
// After initPortfolio: it reads the pin distance that module owns.
initSidebarPortfolio();
// After initWpkoi: it reads the pin length that module measures.
initSidebarWpkoi();
initHeroHeader();
// After initHero and initPortfolio: it needs the liquid handle one owns and
// the pin distance the other does.
initLiquidRetire();
initDeferredMedia();
// Below 4:3 the sidebar is a sheet behind a button rather than a column; this
// is the button. Inert above that boundary — see ui/mobileMenu.js.
initMobileMenu();
// The upright opening frame — its own markup, rendered only below 4:3.
initPortraitHero();
// Before the opening frame is measured: the stack's year is one of the
// things heroTransition.js flips, and this is what decides what it says.
initStackYear();

// After the sections, because there is nothing to correct until they have
// split something. Every split on this page is gated on document.fonts.load()
// for the face it is measured against, so fonts.ready is the earliest moment
// they can all have run; the plate leaving is the backstop for anything whose
// own promise settles later. Idempotent — the query skips what it has already
// marked — so being called twice costs one pass over a handful of elements.
document.fonts.ready.then(() => fixSplitAria());
document.addEventListener('preloader:done', () => fixSplitAria(), { once: true });
