import { gsap } from 'gsap';

import { portfolioPinDistance } from '../sections/portfolio.js';
import { liquidLayer, heroScrollDistance } from '../sections/hero.js';
import { SWAP_START, SWAP_END } from './sidebarPortfolio.js';
import { isPortrait, onLayoutMode } from '../utils/layout.js';
import { fx } from '../utils/filters.js';

// Where the liquid layer's life ends.
//
// It opens the page behind the name, hands over to the second video as
// #skills arrives, and used to keep going all the way down to the closing
// passage — a full-viewport WebGL fluid solver, two videos decoding, and a
// canvas compositing over everything, running through four sections that do
// not use any of it. It retires at #portfolio instead, on the same beat the
// sidebar's portrait gives way to the grid: one gesture, the page changing
// its backdrop and its panel together, rather than two things happening near
// each other.
//
// Retiring means what it says. The video fades, and then the solver stops
// stepping, the drops stop falling, both videos stop decoding and the whole
// layer stops being composited. Nothing is destroyed — scrolling back up
// brings it round again exactly as it was, which is what everything else on
// this page does.
//
// The grain goes the other way as it happens. The two layers were always
// doing the same job between them: the liquid gives the page its texture
// while it is there, and once it is gone the grain has to carry that alone.

// What the overlay comes up to once nothing else is providing any texture.
// Its resting value is read from the stylesheet, which stays the one place
// that decides it.
const GRAIN_LATE = 0.16;

// The blur the video dissolves through on its way out — the same figure it
// arrived on, so it leaves the way it came.
const EXIT_BLUR = 24;

export function initLiquidRetire() {
  const section = document.querySelector('#portfolio');
  const layer = document.querySelector('.hero-liquid');
  const grain = document.querySelector('.grain-overlay');
  if (!section || !layer) return;

  const videos = Array.from(layer.querySelectorAll('video'));

  // Wide only, and on the first frame rather than on idle.
  //
  // Both videos in this layer carry data-src instead of a <source>, so
  // neither is fetched by the parser. ui/deferredMedia.js owns the second one
  // — it belongs to #skills and can wait for the page to settle. This one is
  // the hero's own backdrop and cannot, so it is attached here, from the
  // branch that already knows the page is wide enough to want it.
  //
  // Runs before initDeferredMedia(), and clears data-src on the way out, so
  // that module's query never sees this element and cannot append a second
  // <source> to it.
  function attachSource(video) {
    if (!video || !video.dataset.src) return;
    const source = document.createElement('source');
    source.src = video.dataset.src;
    source.type = 'video/mp4';
    video.appendChild(source);
    delete video.dataset.src;
    video.load();
  }
  const span = SWAP_END - SWAP_START;

  // ---- Off, and back on again.
  let retired = false;

  function setRetired(next) {
    if (next === retired) return;
    retired = next;

    layer.classList.toggle('is-retired', next);

    const reveal = liquidLayer();
    if (reveal) reveal.setPaused(next);

    videos.forEach((v) => {
      // The second video is not part of this layer's life below 4:3 — it is
      // never fetched, never faded in, and coming back from a retirement must
      // not be the one thing that starts it decoding. See the portrait
      // life-cycle at the foot of this file.
      if (next || (isPortrait() && v.classList.contains('hero-liquid-video--alt'))) {
        v.pause();
        return;
      }
      // Muted and playsinline, so the autoplay policy allows this — and a
      // rejection is not something anything else is waiting on.
      const played = v.play();
      if (played) played.catch(() => {});
    });
  }

  // Position rather than `isActive`: see holdsScroll in sections/hero.js for
  // why that property cannot be trusted at a boundary. The layer is retired
  // from the moment the fade below has finished to the end of the page, and
  // comes back the moment the reader scrolls above that point again.
  function evaluate(self) {
    const at = self.start + (self.end - self.start) * SWAP_END;
    setRetired(self.scroll() >= at);
  }

  // ---- The fade itself, on the pin the sidebar's own swap runs on.
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => `+=${portfolioPinDistance()}`,
      scrub: 0.6,
      invalidateOnRefresh: true,
      onUpdate: evaluate,
      onToggle: evaluate,
      onRefresh: evaluate,
    },
  });

  // Filler tween so the timeline's natural duration is the full 0..1 the
  // scrub maps onto — the same reason every other scrubbed timeline on the
  // page opens with one.
  tl.to({}, { duration: 1 }, 0);

  // ---- The layer goes, not the video inside it.
  //
  // Fading the second video was the obvious thing and it was wrong twice over.
  //
  // The first time it put that video at 0.3 from page load, because a fromTo
  // writes its from-values the moment it is created rather than when its turn
  // in the timeline comes — so both videos sat behind the hero at once.
  // Deferring the render fixed that and exposed the real problem underneath:
  // skills.js also owns that video's opacity, holding it at 0.3 from #skills
  // onward, and two timelines writing one property means the value on screen
  // is whichever of them rendered last. Neither is wrong; there is simply no
  // answer to which wins, and the measurements bore that out — the same
  // scroll position gave 0 one run and 0.3 the next.
  //
  // The wrapper has no other writer at all. Fading it takes the video, the
  // canvas and the overlay with it in one property nobody else touches, and
  // what the canvas paints where it has not been disturbed is the page's own
  // background colour — so there is nothing to see behind it as it goes.
  tl.fromTo(
    layer,
    { opacity: 1 },
    { opacity: 0, ease: 'none', duration: span, immediateRender: false },
    SWAP_START,
  );

  if (grain) {
    // The resting value comes from the stylesheet rather than being written
    // down again here, and it is captured as an explicit `from` so that the
    // refresh this trigger performs cannot re-read it from a state the tween
    // has already changed — which is how a tween quietly becomes one that
    // does nothing.
    const resting = parseFloat(getComputedStyle(grain).opacity) || 0.12;
    // Deferred for the same reason as the video above, even though its
    // from-value happens to match the stylesheet: a tween has no business
    // writing anything onto an element before its own range is reached.
    tl.fromTo(
      grain,
      { opacity: resting },
      { opacity: GRAIN_LATE, ease: 'none', duration: span, immediateRender: false },
      SWAP_START,
    );
  }

  // ---- The blur, on the same wrapper and written by hand rather than tweened.
  //
  // Same reasoning as the entrance in skills.js: this is a fixed,
  // full-viewport box, a CSS filter on one costs a pass over a million-odd
  // pixels a frame, and any non-`none` filter — `blur(0px)` included — makes
  // the compositor keep a separate render surface for it. Written this way the
  // property is a literal `none` for the whole page above this section, and
  // quantized to 2px steps within it.
  let written = '';
  tl.eventCallback('onUpdate', function onUpdate() {
    const t = (this.progress() - SWAP_START) / span;
    const px = Math.round((EXIT_BLUR * Math.min(Math.max(t, 0), 1)) / 2) * 2;
    const next = px > 0 ? fx(px) : 'none';
    if (next === written) return;
    written = next;
    layer.style.filter = next;
  });

  // ---- A shorter life entirely, below 4:3.
  //
  // Everything above is written for a page where this layer has four sections
  // of work left after the hero: the first video hands over to the second as
  // #skills arrives, the second carries the texture down to #portfolio, and
  // the layer retires there. Upright, none of that happens — the second video
  // is never fetched (ui/deferredMedia.js) and never faded in (skills.js),
  // because the reader is on a handset and a full-screen video decoding
  // behind a page it is not visible through is the most expensive thing this
  // site could ask of them.
  //
  // So the layer simply ends with the opening frame. The traffic video takes
  // the same exit it takes on the wide layout — opacity across the whole
  // range, blur only in the tail, for the reason heroTransition.js gives at
  // length — and when it has gone, the solver stops. That last part is the
  // saving that matters: a fluid simulation stepping every frame behind a
  // page nobody can see it through, for the whole rest of the scroll.
  const traffic = layer.querySelector('.hero-liquid-video:not(.hero-liquid-video--alt)');
  const heroSpacer = document.querySelector('.hero');

  if (!traffic || !heroSpacer) return;

  // Where the blur starts inside that range, as a fraction of it. The same
  // split heroTransition.js uses on the same video: for the first half the
  // radius is small enough to read as "slightly soft" while the opacity fade
  // does all the visible work, and by the time it is large the video is
  // nearly transparent anyway.
  const BLUR_FROM = 0.55;

  let trafficBlur = '';
  function setTrafficBlur(px) {
    const next = px > 0 ? fx(px) : 'none';
    if (next === trafficBlur) return;
    trafficBlur = next;
    traffic.style.filter = next;
  }

  const exit = gsap.timeline({
    scrollTrigger: {
      trigger: heroSpacer,
      start: 'top top',
      end: () => `+=${heroScrollDistance()}`,
      scrub: 0.5,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const t = (self.progress - BLUR_FROM) / (1 - BLUR_FROM);
        setTrafficBlur(Math.round((EXIT_BLUR * Math.min(Math.max(t, 0), 1)) / 2) * 2);
      },
      // Position rather than progress, for the reason holdsScroll in
      // sections/hero.js spells out — and past the end is the whole of the
      // rest of the page, which is exactly the stretch this is switching off.
      onToggle: (self) => setRetired(self.scroll() >= self.end),
      onRefresh: (self) => setRetired(self.scroll() >= self.end),
    },
  }).to(traffic, { opacity: 0, ease: 'none', duration: 1 }, 0);

  // The two lives are mutually exclusive, and each hands everything it wrote
  // back on the way out — the video's opacity, the layer's own, the grain's,
  // and the two filters, which are written by hand and so have to be undone
  // by hand.
  function applyMode(portrait) {
    const wide = tl.scrollTrigger;
    const tall = exit.scrollTrigger;
    if (portrait) {
      if (wide) wide.disable(true);
      written = '';
      layer.style.filter = '';
      // Reverting a tween restores the value it started from — as an inline
      // style, which is not the same as never having been touched. The two
      // opacities it hands back here both have a portrait rule of their own
      // waiting underneath (the grain holds one value for the whole page
      // upright), and an inline declaration beats a stylesheet whatever the
      // stylesheet says. Cleared outright so the rules can speak.
      gsap.set([layer, grain].filter(Boolean), { clearProps: 'opacity' });
      if (tall) tall.enable();
    } else {
      if (tall) tall.disable(true);
      trafficBlur = '';
      traffic.style.filter = '';
      setRetired(false);
      // ...and explicitly, because setRetired is a toggle and the layer was
      // very likely not retired at the moment the window was turned — so it
      // has nothing to say and says nothing. The second video was paused on
      // the way in regardless of that flag, and this is the only thing that
      // starts it again. A rejection (no source attached yet, because
      // ui/deferredMedia.js has not got to it) is not a problem: that module
      // plays it itself the moment it does.
      videos.forEach((v) => {
        // The hero's own backdrop, attached here the first time this branch
        // runs. The second video is left for ui/deferredMedia.js — a no-op
        // for it, because it still has its data-src.
        if (v === traffic) attachSource(v);
        const played = v.play();
        if (played) played.catch(() => {});
      });
      if (wide) wide.enable();
    }
  }

  applyMode(isPortrait());
  onLayoutMode(applyMode);
}
