import { gsap } from 'gsap';

import { onViewportResize, requestViewportPass } from '../utils/viewport.js';
import { isPortrait, onLayoutMode } from '../utils/layout.js';
import { liveJitter, setJitterPaused } from '../utils/motion.js';
import { debugOff } from '../utils/debug.js';
import { heroScrollDistance, holdsScroll } from '../sections/hero.js';
import { fx } from '../utils/filters.js';

// As the user scrolls through the (tall, empty) #hero spacer, the sidebar's
// own children animate from an oversized, spread-out "hero"/"header"
// arrangement down to their natural, compact sidebar layout — the sidebar
// element itself never moves, only its children's transforms/opacity/size do.
// The liquid background's own hero video (also fixed, sitting behind
// everything) blurs and fades away over the same scroll range so it reads
// as dissolving into the dark page background — .hero-liquid itself and
// its canvas stay alive (opacity untouched), since skills.js later fades
// in a second video underneath that same canvas as #skills scrolls into
// view, then fades the whole liquid layer out again from there.
//
// The starting ("hero") transform for each element is computed at runtime
// from the exact box-model the old, pre-sidebar hero/header layout used
// (same clamp()/vw/% math), rather than guessed pixel offsets — so elements
// land back on their old, familiar spots and animate FROM there to the
// sidebar, and it stays correct across viewport sizes. The whole timeline is
// rebuilt (not just re-progressed) on resize: photo/social targets are
// concrete pixel values tied to the current viewport, not resize-proof
// relative ones, so a plain progress(0) reset isn't enough.

function cssClamp(min, value, max) {
  return Math.min(max, Math.max(min, value));
}

// Scale factor that makes `el` (rendered at its current, natural font-size)
// read as if it were sized at `vwFraction * 100vw`, the way the old
// header/hero text was sized.
function vwFontScale(el, vwFraction, W) {
  const currentSize = parseFloat(getComputedStyle(el).fontSize);
  return (vwFraction * W) / currentSize;
}

// left/top delta needed to make `el` (at `rect`, its natural sidebar
// position/size) visually appear at `{left, top, width}` instead — expressed
// as a gsap x/y/scale set with transformOrigin "left top".
// Rounded, and only the offsets. A FLIP delta is the difference of two
// measured boxes, so it lands on some fraction of a pixel essentially always
// — and for the stretch this element is composited (see .sidebar-name.is-moving
// in sidebar.css) a fractional offset means the compositor resamples the whole
// rasterised layer as it draws it. Half a pixel of that is nothing on a name
// set at two hundred pixels and is the difference between crisp and soft on
// the fifteen-pixel scrawls riding along in its corners. Nobody can see the
// opening frame sitting half a pixel from where it was measured; everybody
// can see it slightly out of focus.
function flipFrom(el, target, rect = el.getBoundingClientRect()) {
  const scale = target.width / rect.width;
  return {
    x: Math.round(target.left - rect.left),
    y: Math.round(target.top - rect.top),
    scale,
    transformOrigin: 'left top',
  };
}

function buildOldHeroLayout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const sideInset = cssClamp(24, 0.04 * W, 80); // clamp(1.5rem, 4vw, 5rem)
  const rowGap = 24;
  const rowWidth = W - sideInset * 2;
  // The row used to sit with bottom:8% inside a 100vh hero. Held a little
  // higher than that now — the opening frame carries more under the name
  // than it did (the underline moved down, the "keep digging" scrawl sits
  // beside it), and 8% left that whole band crowding the viewport's edge.
  const rowBottom = H * 0.89;

  const nameWidth = rowWidth * 0.8;
  const photoWidth = rowWidth * 0.12;

  const headerTop = 28; // old header padding-top: 1.75rem
  const navGap = 32; // old .site-nav gap: 2rem
  const brandGap = 5.6; // old .site-header-brand gap: 0.35rem
  const socialGap = 0.01 * W; // old .hero-social gap: 1vw

  return {
    W, H, sideInset, rowGap, rowWidth, rowBottom, nameWidth, photoWidth,
    headerTop, navGap, brandGap, socialGap,
  };
}

// The hero's own marks run the same shared tremor every drawn mark further
// down the page does (see utils/motion.js), scaled by one factor. The hero is
// a quiet, wide frame with very little in it, and at the full amplitude that
// suits a dense section the same movement stopped reading as a drawn hand and
// started reading as unstable type.
const JITTER = 1 / 3;

// How much of the hero's scroll the two corner scrawls take to fade out.
const MARK_FADE = 0.3;

// How long after the last frame of movement the assembly is called still.
// Long enough that a scrub catching up between two flicks of a wheel is not
// read as two separate stops, short enough that letting go of the page and
// looking at it are the same moment.
const STILL_MS = 140;

export function initHeroTransition() {
  const sidebar = document.querySelector('.site-sidebar');
  const name = document.querySelector('.sidebar-name');
  const tagline = document.querySelector('.sidebar-tagline');
  const stack = document.querySelector('.sidebar-stack');
  const socialGroup = document.querySelector('.sidebar-social');
  const allSocialLinks = Array.from(document.querySelectorAll('.social-link'));
  // Links that existed in the old hero (they carry a `.social-text` old-style
  // label) get the full text-to-icon FLIP treatment; links added only for
  // the sidebar (Dribbble, Pinterest) have no old form — they just fade in
  // like bio/locale/badge once the sidebar has mostly assembled.
  const socialLinks = allSocialLinks.filter((link) => link.querySelector('.social-text'));
  const socialTexts = socialLinks.map((link) => link.querySelector('.social-text'));
  const socialIcons = socialLinks.map((link) => link.querySelector('.social-icon-svg'));
  const extraSocialLinks = allSocialLinks.filter((link) => !link.querySelector('.social-text'));
  const bio = document.querySelector('.sidebar-bio');
  const locale = document.querySelector('.sidebar-locale');
  const navLinks = Array.from(document.querySelectorAll('.sidebar-nav a'));
  // The two scrawls in the name's corners (see .hero-mark in sidebar.css).
  // They're children of .sidebar-name, so they ride its FLIP for free —
  // all this file has to do is let go of them before it lands.
  const heroMarks = Array.from(document.querySelectorAll('.hero-mark'));
  const photo = document.querySelector('.sidebar-photo-wrap');
  const badge = document.querySelector('.sidebar-badge');
  const photoCaption = document.querySelector('.sidebar-photo-caption');
  const email = document.querySelector('.sidebar-email');
  // .hero-liquid-video--alt (the second, skills-section video — see
  // skills.js) must NOT fade with this one, so it's excluded explicitly
  // rather than relying on this being the first DOM match.
  const liquidVideo = document.querySelector('.hero-liquid-video:not(.hero-liquid-video--alt)');
  const fixedDatas = document.querySelector('.fixed-datas');
  const heroSpacer = document.querySelector('.hero');

  if (!name || !heroSpacer) return;

  // ?off=flip leaves the sidebar in its assembled state and never builds the
  // scrubbed timeline. It is the coarsest probe on this page: everything the
  // assembly animates — the portrait's width and height, the social row's
  // gap, each link's width, the brand stack's height — is a layout property,
  // so if the stutter goes with this it is a relayout problem and not a paint
  // one.
  if (debugOff('flip')) return;

  // ---- Hold the name still while it is being resized.
  //
  // The measurement that led here: switching off *only* the name's scale tween
  // was the one thing that made this transition smooth, while switching off
  // its glow, its marker filter, the character blurs, or the layout tweens
  // each did almost nothing. So it is not what is inside the name that costs —
  // it is that a region roughly 940 by 400 pixels has its scale changed sixty
  // times a second, and every one of those changes is a fresh rasterisation of
  // the type, the shadow behind it, the SVG filter on the underline and the
  // two scrawls in the corners.
  //
  // The answer is to rasterise it once and let the compositor do the scaling,
  // which is what will-change asks for. But that only pays off if the layer's
  // contents hold still: anything that repaints inside a composited layer
  // makes it rasterise again, and this subtree had three things repainting
  // several times a second — the underline's glitch keyframes, the SMIL
  // animation re-rolling its turbulence seed, and the tremor writing filters
  // on the two scrawls. All three are held for the duration.
  //
  // Only for the duration, and deliberately: will-change left on permanently
  // is a composited layer kept alive for a page the name spends most of its
  // life sitting quietly at the top of. And the scale starts at its largest,
  // so the one rasterisation the layer gets is taken at full size and every
  // frame after that is a minification — which is the direction that stays
  // sharp.
  const heroUnderlineSvg = name.querySelector('.hero-underline');
  let scaling = false;

  function setScaling(active) {
    if (debugOff('namelayer') || active === scaling) return;
    scaling = active;

    name.classList.toggle('is-scaling', active);
    setJitterPaused(active);

    // The CSS keyframes are paused by the class above; the seed animation is
    // SMIL and has its own timeline, which only this call can stop.
    //
    // Verified and retried, because this runs off the trigger's first refresh
    // and that can land before the SVG's own timeline has started — in which
    // case the pause is asked for and simply does not stick. One frame later
    // it does.
    if (!heroUnderlineSvg || !heroUnderlineSvg.pauseAnimations) return;

    if (!active) {
      heroUnderlineSvg.unpauseAnimations();
      return;
    }

    heroUnderlineSvg.pauseAnimations();
    if (heroUnderlineSvg.animationsPaused()) return;
    requestAnimationFrame(() => {
      if (scaling) heroUnderlineSvg.pauseAnimations();
    });
  }

  // ---- ...and the composited layer itself, which only exists while the
  // assembly is in motion.
  //
  // `is-scaling` above says "the opening frame is on screen", which is the
  // right question for holding the ambient loops still — they are held for
  // the whole of it. It is the wrong question for the layer, and answering it
  // with the layer is what made the two corner scrawls arrive soft.
  //
  // A composited layer is drawn at whatever offset its transform asks for,
  // and this element's is a FLIP delta measured between two boxes: a
  // fraction of a pixel, essentially always. Drawing a rasterised layer at a
  // fractional offset resamples all of it — invisible on a name set at two
  // hundred pixels, and precisely the softness the fifteen-pixel scrawls in
  // its corners kept turning up with. The layer earns that cost while the
  // scale is changing sixty times a second and buys nothing at all while the
  // frame is being read, which is nearly all of the time it is on screen.
  //
  // So: on for the first frame of movement, off once the scrub has caught up
  // and stopped. The one rasterisation the layer gets is still taken at the
  // top of the range, where the scale is largest, so every frame after it is
  // a minification — the direction that stays sharp.
  let moving = false;
  let stillTimer = null;

  function setMoving(active) {
    if (active === moving) return;
    moving = active;
    name.classList.toggle('is-moving', active);
  }

  function markMoving() {
    setMoving(true);
    clearTimeout(stillTimer);
    stillTimer = setTimeout(() => setMoving(false), STILL_MS);
  }

  function markStill() {
    clearTimeout(stillTimer);
    setMoving(false);
  }

  // ---- The size the opening frame was last measured against.
  //
  // Every start state build() writes is a concrete pixel offset for one
  // particular window. The shared pass (utils/viewport.js) rebuilds them on
  // every resize and that is how they stay correct — but it is one pass
  // running one list of callbacks, and this module's is the last of them.
  // Anything that stops it short (a listener throwing, a resize the page
  // never hears about) leaves this timeline holding another window's
  // coordinates, and because it is only ever re-measured by that same pass,
  // nothing afterwards puts it right: the reader comes back up to a sidebar
  // scattered across the screen and stays there for the rest of the session.
  //
  // The trigger therefore checks its own footing whenever the opening frame
  // is on screen. Two numbers compared, and the frame cannot be entered
  // stale.
  //
  // The window's size is not the only thing that can go out from under it.
  // ui/heroName.js fits the name to its column by writing a font-size, and it
  // does that from a ResizeObserver as well as from the pass — so the run can
  // change width without the window changing at all, and a FLIP scale is the
  // ratio of two widths measured at one moment. Stale by that route the name
  // renders wider than the frame was laid out for and runs under the portrait
  // beside it. The fitted size is an inline string, so checking it costs a
  // property read and no layout.
  let builtWidth = 0;
  let builtHeight = 0;
  let builtFontSize = '';
  let healPending = false;

  const nameText = name.querySelector('.sidebar-name-text');

  function isStale() {
    return builtWidth !== window.innerWidth
      || builtHeight !== window.innerHeight
      || (nameText && builtFontSize !== nameText.style.fontSize);
  }

  function healIfStale() {
    if (healPending) return;
    healPending = true;

    // Decided a task later rather than here, because "here" is often the
    // middle of the very pass that is about to fix it: the trigger's own
    // onRefresh fires from inside flush(), once before build() has run and
    // once after. Asking on the first of those would book a second pass for
    // work the first one is already doing. A timeout puts the question after
    // whatever is in flight has finished, where the answer is the true one.
    setTimeout(() => {
      healPending = false;
      if (!isStale()) return;

      // The shared pass rather than this module's own build(), even though
      // build() is the thing that is out of date. The name fits itself to its
      // column and republishes the ink metrics this FLIP measures against, and
      // it does that on the same pass — so a missed pass leaves both stale,
      // and rebuilding one against the other's old answer only half-mends it.
      // The pass runs them in the right order, which is why it exists.
      requestViewportPass();
    }, 0);
  }

  let tl = null;

  function build() {
    if (tl) {
      tl.scrollTrigger && tl.scrollTrigger.kill();
      tl.kill();
      tl = null;
    }

    // Strip any leftover inline transform/size from a previous build before
    // measuring — otherwise a rebuild mid-scroll (e.g. on resize) would
    // measure an already-transformed box instead of the natural one.
    const allEls = [
      name, tagline, stack, photo, socialGroup, bio, locale, badge, photoCaption, email, liquidVideo, fixedDatas,
      ...socialLinks, ...socialTexts, ...socialIcons, ...extraSocialLinks, ...navLinks, ...heroMarks,
    ].filter(Boolean);
    gsap.set(allEls, { clearProps: 'all' });

    // Below 4:3 there is no opening frame and nothing for it to assemble
    // into: the panel these elements belong to is a full-screen sheet behind
    // a button, and it wears the state it would have *finished* in. So the
    // clearProps above is the whole of the work — every one of them is back
    // on the stylesheet's own answer — and no timeline is built to move them
    // off it again. The frame's two held-still flags are released with it, or
    // the tremor on every mark down the page would stay paused for the
    // session on whichever side of the boundary it was last switched.
    builtWidth = window.innerWidth;
    builtHeight = window.innerHeight;
    builtFontSize = nameText ? nameText.style.fontSize : '';
    healPending = false;
    if (isPortrait()) {
      setScaling(false);
      markStill();
      return;
    }

    // The box the portrait ends up in — measured, not derived.
    //
    // This used to be a sum: sidebar height, less its padding, less every
    // other child's height, less the gaps between them, capped at the content
    // width to make a square. That was the stylesheet's own layout rule
    // written out a second time in JavaScript, and the two only agreed for as
    // long as nobody touched either. They no longer even want to agree — the
    // portrait's row takes whatever vertical room is left over now (see
    // .sidebar-photo-row) and its width is a fixed share of the column, so
    // the finished box is not a square and its shape follows the viewport's.
    //
    // So the layout is simply put into its finished state and asked. The
    // finished state differs from the live one in exactly one way: the brand
    // stack has collapsed to nothing, and everything below it — the portrait
    // included — has risen by its height and grown into the room. Written
    // straight to the style attribute rather than through GSAP so this
    // temporary state never enters a tween's idea of where the element began.
    const stackFlowHeight = stack ? stack.getBoundingClientRect().height : 0;
    let photoEnd;
    if (stack) {
      const restore = stack.style.height;
      stack.style.height = '0px';
      photoEnd = photo.getBoundingClientRect();
      stack.style.height = restore;
    } else {
      photoEnd = photo.getBoundingClientRect();
    }
    // Held as plain numbers: the rect above is live and would report the
    // portrait's *hero* size once the FLIP below writes it.
    const photoEndWidth = photoEnd.width;
    const photoEndHeight = photoEnd.height;

    // Published for ui/sidebarPortfolio.js, which lays a grid into this same
    // rectangle further down the page and decides its row count from the
    // rectangle's shape. It cannot simply measure the box itself: for the
    // whole of the hero this element is wearing the opening frame's size, and
    // the assembled one is only knowable through the collapse-and-measure
    // above. Same idea as the ink metrics on .sidebar-name.
    photo.dataset.endWidth = photoEndWidth.toFixed(2);
    photo.dataset.endHeight = photoEndHeight.toFixed(2);

    const L = buildOldHeroLayout();

    // ---- Name: old row's left-most, largest item (80% of the row), bottom-anchored.
    const nameRect = name.getBoundingClientRect();
    const nameHeight = L.nameWidth * (nameRect.height / nameRect.width);
    gsap.set(name, flipFrom(name, { left: L.sideInset, top: L.rowBottom - nameHeight, width: L.nameWidth }, nameRect));

    // ---- Photo: same row, right of the name, its top and bottom edges level
    // with the name's own cap line and baseline. Not centred against the
    // canvas box any more, and not sized from the image's own aspect ratio
    // either: that box is taller than the letterforms inside it (the shader
    // needs air around them for its glow — see the ink bounds
    // heroName.js publishes on this element's dataset), so centring a
    // differently-proportioned portrait inside it left the portrait starting
    // low and hanging low.
    //
    // Tweens real width/height (not scale) so object-fit:cover recomputes
    // its crop against the box's true shape — an upright, uncropped portrait
    // at rest, narrowing/squaring off into the sidebar's cropped square as
    // it settles (a uniform transform scale would just stretch the already-
    // cropped square instead).
    const inkTop = parseFloat(name.dataset.inkTop) || 0;
    const inkBottom = parseFloat(name.dataset.inkBottom) || 1;
    const photoLeft = L.sideInset + L.nameWidth + L.rowGap;
    const photoTop = L.rowBottom - nameHeight + nameHeight * inkTop;
    const oldPhotoHeight = nameHeight * (inkBottom - inkTop);
    const photoRect = photo.getBoundingClientRect();
    gsap.set(photo, {
      width: L.photoWidth,
      height: oldPhotoHeight,
      // Whole pixels, for the same reason flipFrom rounds its own: a
      // photograph drawn between two pixel columns is resampled into both.
      x: Math.round(photoLeft - photoRect.left),
      y: Math.round(photoTop - photoRect.top),
    });

    // ---- Social: row whose right edge lines up with the photo's right
    // edge, hanging just under the name/underline (its left end naturally
    // spills under the name, since the old text labels are wider than the
    // photo). Old and new are both flex rows, so only each link's own width
    // (old text label -> final 30px icon slot) and the row's gap need to
    // tween — flex reflows the rest automatically. Text label and icon
    // glyph cross-fade inside that shrinking slot.
    const socialRight = photoLeft + L.photoWidth;
    // Was 0.05 of the name's height above the row's baseline, which put the
    // row tight under the portrait. Held lower now, for the same reason the
    // row as a whole sits higher: the bottom band needed air, not density.
    const socialTop = L.rowBottom - nameHeight * 0.015;
    const naturalSocialGap = parseFloat(getComputedStyle(socialGroup).columnGap) || 0;

    // Resize the links (and the row's gap) to their old-look sizes *before*
    // measuring the group's own box — the group has no explicit width, so
    // it shrink-wraps its children; measuring right-edge position before
    // they're resized would capture the wrong (still-natural-width) box,
    // and the group would keep drifting once flex reflows around the
    // resized children out from under an already-fixed translate.
    // Natural (sidebar) width is measured, not assumed: it is 1.875rem in
    // the stylesheet, so its pixel value moves with the page scale — the
    // literal 30 that used to be tweened back to was only correct at the
    // reference viewport, and left the icons mis-sized everywhere else.
    const naturalLinkWidth = socialLinks.length ? socialLinks[0].getBoundingClientRect().width : 30;
    socialLinks.forEach((link, i) => {
      const oldWidth = socialTexts[i].getBoundingClientRect().width;
      gsap.set(link, { width: oldWidth });
      gsap.set(socialTexts[i], { opacity: 1 });
      gsap.set(socialIcons[i], { opacity: 0 });
    });
    // Extra (Dribbble/Pinterest) links don't exist in the old hero at all —
    // collapse them to nothing before measuring so they don't push the old
    // right edge outward, then reveal them later alongside bio/badge/locale.
    extraSocialLinks.forEach((link) => {
      // --assembly-fade rather than opacity: ui/sidebarWpkoi.js fades all five
      // of these out again further down the page and would otherwise be the
      // second writer on one property. See .social-link in the stylesheet.
      gsap.set(link, { width: 0, '--assembly-fade': 0 });
    });
    gsap.set(socialGroup, { columnGap: L.socialGap });

    const socialRect = socialGroup.getBoundingClientRect();
    gsap.set(socialGroup, {
      x: socialRight - socialRect.right,
      y: socialTop - socialRect.top,
    });

    // ---- Tagline + stack: old header's top-left corner, stacked tightly.
    const taglineRect = tagline.getBoundingClientRect();
    const taglineScale = vwFontScale(tagline, 0.015, L.W);
    gsap.set(tagline, flipFrom(tagline, { left: L.sideInset, top: L.headerTop, width: taglineRect.width * taglineScale }, taglineRect));

    if (stack) {
      const taglineHeight = taglineRect.height * taglineScale;
      const stackRect = stack.getBoundingClientRect();
      const stackScale = vwFontScale(stack, 0.008, L.W);
      gsap.set(stack, flipFrom(stack, {
        left: L.sideInset,
        top: L.headerTop + taglineHeight + L.brandGap,
        width: stackRect.width * stackScale,
      }, stackRect));
    }

    // ---- Nav: old header's horizontal top-right row. The sidebar keeps
    // flex-direction:column at all times (it's a discrete CSS value, not
    // tweenable), so each link gets its own FLIP from a computed old-row
    // position back to its natural stacked position.
    if (navLinks.length) {
      const navScale = vwFontScale(navLinks[0], 0.015, L.W);
      const widths = navLinks.map((a) => a.getBoundingClientRect().width * navScale);
      const totalWidth = widths.reduce((sum, w) => sum + w, 0) + L.navGap * (navLinks.length - 1);
      let cursor = L.W - L.sideInset - totalWidth;
      navLinks.forEach((a, i) => {
        gsap.set(a, flipFrom(a, { left: cursor, top: L.headerTop, width: widths[i] }));
        cursor += widths[i] + L.navGap;
      });
    }

    // autoAlpha, not plain opacity — the same reason the hero marks use it
    // further down, arrived at from the other direction.
    //
    // These five are laid out in the column from the first frame and only
    // faded in as the frame assembles. At zero opacity they are invisible but
    // still in the hit-test: five full-width blocks sitting over the hero's
    // own social row, silently eating clicks on links the reader can see and
    // is aiming at. The email is the worst of them, because it is a real
    // <button> and so takes the press rather than merely blocking it.
    //
    // autoAlpha carries visibility along with the opacity, and a hidden
    // element is not hit-tested at all — so the fade and the click target
    // stop being two separate facts that have to be kept in step by hand.
    gsap.set(bio, { autoAlpha: 0 });
    gsap.set(locale, { autoAlpha: 0 });
    gsap.set(badge, { autoAlpha: 0 });
    gsap.set(photoCaption, { autoAlpha: 0 });
    gsap.set(email, { autoAlpha: 0 });

    // heroSpacer's own rendered height is unreliable to read here as
    // 'bottom top' — skills.js pins a child of it, and something about that
    // combination leaves ScrollTrigger's own 'bottom top' resolution stuck
    // at the pre-pin height for triggers other than the pin's own, even
    // after an explicit refresh. Using the same explicit pixel distance
    // every hero-scoped trigger on the page relies on sidesteps that
    // entirely instead of depending on 'bottom top' resolving correctly.
    //
    // 2.4 must stay equal to skills.js's own targetHeroHeight multiplier —
    // this is what makes "sidebar fully assembled" and "skills pin release"
    // the same scroll position instead of drifting apart.
    tl = gsap.timeline({
      scrollTrigger: {
        trigger: heroSpacer,
        start: 'top top',
        end: () => `+=${heroScrollDistance()}`,
        scrub: 1,
        invalidateOnRefresh: true,
        onToggle: (self) => {
          setScaling(holdsScroll(self));
          if (!holdsScroll(self)) markStill();
          healIfStale();
        },
        onRefresh: (self) => {
          setScaling(holdsScroll(self));
          // A refresh is a re-measure, not a movement: whatever the frame was
          // doing, it is holding still by the end of one.
          markStill();
          // Also here, not only on the two above: ScrollTrigger keeps a
          // couple of auto-refresh events of its own (visibilitychange,
          // load — see main.js), and those re-measure every pin on the page
          // without running the viewport pass that re-measures this. A
          // window resized while the tab was in the background comes back
          // through exactly that door.
          healIfStale();
        },
        // setScaling here as well as on the two above, and it is the only
        // one of the three that catches the case it is here for.
        //
        // onToggle fires on a change of `isActive` — and a reader who is
        // below the opening frame and goes back to the very top of the page
        // in one movement (the nav's own Introduce link does exactly that,
        // and so does End-then-Home) is inactive on both sides of that
        // movement: past the end before, at the start after. Nothing
        // toggled, so nothing told the frame it was on screen again, and it
        // sat at the top of the page in the state it wears halfway down —
        // the name off its own layer, the underline's glitch running, the
        // tremor writing sub-pixel blurs onto the two scrawls. Which is why
        // the opening frame did not always look the same as the one a fresh
        // load lands on.
        //
        // onUpdate fires on a change of progress, which that movement very
        // much is. Cheap enough to sit on every frame of the opening scroll
        // regardless: all three calls early-return unless something changed.
        onUpdate: (self) => {
          setScaling(holdsScroll(self));
          if (holdsScroll(self)) markMoving();
          healIfStale();
        },
      },
    });

    tl.to(name, debugOff('flip-name')
      ? { x: 0, y: 0, ease: 'none', duration: 1 }
      : { x: 0, y: 0, scale: 1, ease: 'none', duration: 1 }, 0)
      .to(photo, debugOff('flip-photo')
        ? { x: 0, y: 0, ease: 'none', duration: 1 }
        : { x: 0, y: 0, width: photoEndWidth, height: photoEndHeight, ease: 'none', duration: 1 }, 0)
      .to(socialGroup, debugOff('flip-social')
        ? { x: 0, y: 0, ease: 'none', duration: 1 }
        : { x: 0, y: 0, columnGap: naturalSocialGap, ease: 'none', duration: 1 }, 0)
      .to(tagline, { x: 0, y: 0, scale: 1, ease: 'none', duration: 1 }, 0)
      .to(liquidVideo, { opacity: 0, ease: 'none', duration: 1 }, 0)
      // autoAlpha on both ends, or the visibility set above is never undone.
      .to(bio, { autoAlpha: 1, ease: 'none', duration: 0.3 }, 0.6)
      .to(locale, { autoAlpha: 1, ease: 'none', duration: 0.3 }, 0.6)
      .to(badge, { autoAlpha: 1, ease: 'none', duration: 0.3 }, 0.6)
      .to(photoCaption, { autoAlpha: 1, ease: 'none', duration: 0.3 }, 0.6)
      .to(email, { autoAlpha: 1, ease: 'none', duration: 0.3 }, 0.65);

    // The video's dissolve is opacity for the whole range (above) but blur
    // only for the last 45% of it (here), and that split is the single
    // biggest saving in this whole transition.
    //
    // This is a fixed, full-viewport <video>. A CSS blur on it costs a
    // multi-pass filter over roughly a million pixels, per frame, on an
    // element that is also decoding video into that same surface — and the
    // old version ran that filter across the *entire* sidebar assembly, which
    // is exactly the stretch of the page that stuttered. Most of that spend
    // bought nothing: for the first half of the range the radius is small
    // enough to read as "slightly soft" while the opacity fade is doing all
    // the visible work, and by the time the radius is large the video is
    // nearly transparent anyway.
    //
    // Confining it to the tail leaves the two ends identical to before — a
    // crisp video at the top of the page, blur(24px) at opacity 0 at the
    // bottom — and if anything the opening frame reads sharper for it.
    //
    // fromTo with immediateRender:false, not a plain to(): a to() would have
    // GSAP write `filter: blur(0px)` the moment the playhead first sits
    // before it, and an element carrying even a zero-radius filter still
    // makes the compositor keep a filtered render surface for it. Starting
    // from the literal `none` means that for the first 55% there is no filter
    // on the element at all.
    tl.fromTo(
      liquidVideo,
      { filter: 'none' },
      { filter: fx(24), ease: 'none', duration: 0.45, immediateRender: false },
      0.55,
    );

    if (stack) {
      // The old header's brand stack has no place in the finished sidebar
      // (the sidebar already carries the same info elsewhere) — it dissolves
      // away and collapses its own height to 0, so it doesn't leave behind
      // an empty gap above the social row once it's gone.
      //
      // build() used to force that collapse early, before measuring photo,
      // social and nav, on the reasoning that those should be flipped from
      // the layout stack eventually leaves behind. That had it backwards: a
      // FLIP offset is `wanted - live`, and `live` at the moment the offset
      // is applied still has stack at full height. Measuring it collapsed
      // made every one of those three sit stack's own height too low for the
      // whole hero — which is what left the portrait starting and ending
      // below the name it is supposed to line up with. They are measured
      // live now; y: 0 at the end of this timeline is still their correct
      // resting place, because by then stack really has collapsed.
      tl.to(stack, debugOff('flip-stack')
        ? { x: 0, y: 0, scale: 1, opacity: 0, ease: 'none', duration: 1 }
        : { x: 0, y: 0, scale: 1, opacity: 0, filter: fx(8), height: 0, ease: 'none', duration: 1 }, 0);
    }

    navLinks.forEach((a) => {
      tl.to(a, debugOff('flip-nav')
        ? { x: 0, y: 0, ease: 'none', duration: 1 }
        : { x: 0, y: 0, scale: 1, ease: 'none', duration: 1 }, 0);
    });

    // Hero-only marks: they go over the first third of the scroll, well
    // before the name has finished shrinking, rather than riding it all the
    // way down into a sidebar that has no room for them.
    //
    // Opacity and nothing else, deliberately: liveJitter (started once, at
    // the bottom of this function) owns filter/x/y/rotate on the text and
    // arrow *inside* each mark, and a blur tween here would be a second
    // writer on the same filter. Fading the wrapper leaves those two
    // animations on entirely separate properties of entirely separate
    // elements, so neither can stamp on the other.
    if (heroMarks.length) {
      // autoAlpha, not plain opacity: the words inside these are selectable
      // text, and a fully faded mark left at visibility:visible would go on
      // catching the pointer in the assembled sidebar. It flips back on its
      // own if the reader scrubs upward again.
      tl.to(heroMarks, { autoAlpha: 0, ease: 'none', duration: MARK_FADE }, 0);
    }

    socialLinks.forEach((link, i) => {
      if (!debugOff('flip-social')) tl.to(link, { width: naturalLinkWidth, ease: 'none', duration: 1 }, 0);
      tl
        .to(socialTexts[i], { opacity: 0, ease: 'none', duration: 1 }, 0)
        .to(socialIcons[i], { opacity: 1, ease: 'none', duration: 1 }, 0);
    });

    extraSocialLinks.forEach((link) => {
      // fromTo, and both ends written out, because the resting state has to
      // survive a refresh. A custom property is not a style GSAP restores
      // when it reverts a tween the way it restores width — it simply drops
      // the declaration, and the element falls back to the stylesheet's own
      // `--assembly-fade: 1`, which is the *finished* value. Stated as a from
      // it is re-applied on every invalidate, so a refresh at the top of the
      // page cannot leave these two showing.
      tl.fromTo(
        link,
        { width: 0, '--assembly-fade': 0 },
        { width: naturalLinkWidth, '--assembly-fade': 1, ease: 'none', duration: 0.3 },
        0.6,
      );
    });

    // ---- Fixed-datas readout: shrinks and re-centers on the photo's own
    // vertical middle as the sidebar assembles, instead of crowding it at a
    // fixed, unrelated spot.
    if (fixedDatas) {
      // Measure the centerline *after* applying the scale (not before): with
      // transformOrigin "bottom right", scaling alone already shifts the
      // visual center toward that corner, before any translate is added.
      gsap.set(fixedDatas, { x: 0, y: 0, scale: 0.78, transformOrigin: 'bottom right' });
      const scaledRect = fixedDatas.getBoundingClientRect();
      const scaledCenterY = scaledRect.top + scaledRect.height / 2;

      // photoRect is the portrait as it sits *now*, with the stack still
      // occupying flow above it; by the end of this timeline the stack has
      // collapsed to nothing and everything under it has risen by exactly
      // that much. The height is the finished one measured above, which is no
      // longer the same as the live one.
      const photoCenterY = photoRect.top - stackFlowHeight + photoEndHeight / 2;

      gsap.set(fixedDatas, { y: 0, scale: 1 });
      tl.to(fixedDatas, { y: photoCenterY - scaledCenterY, scale: 0.78, ease: 'none', duration: 1 }, 0);
    }
  }

  build();

  // A change of layout mode is a rebuild, and it is the one rebuild the
  // viewport pass cannot leave to onViewportResize alone: build() has to run
  // with the new answer in hand, and utils/layout.js publishes that before
  // the pass calls a single listener.
  onLayoutMode(() => build());

  // Started once, outside build(): these run on the marks' children, which
  // build()'s clearProps pass never touches, so a rebuild can't strand a
  // half-applied transform or leave two loops racing on one element. Each
  // arrow carries a CSS rotate of its own that GSAP is about to take over,
  // hence the matching rotateBase.
  heroMarks.forEach((mark) => {
    liveJitter(mark.querySelector('.hero-mark-text'), { amp: JITTER });
    const arrow = mark.querySelector('.hero-mark-arrow');
    if (!arrow) return;
    const rotateBase = parseFloat(getComputedStyle(arrow).getPropertyValue('--arrow-rotate')) || 0;
    liveJitter(arrow, { rotateBase, amp: JITTER });
  });

  // The whole timeline is rebuilt rather than just re-progressed: the FLIP
  // start states above are concrete pixel positions measured against the
  // current viewport, so a plain refresh would scrub toward last size's
  // coordinates. The shared pass calls ScrollTrigger.refresh() itself once
  // every module has re-measured, so there is no refresh call here.
  onViewportResize(build);
}

// Every button carrying a data-email, not just the sidebar's — the contact
// section has one of its own now, and both want the same behaviour: copy the
// address, flash a confirmation, go quiet again.
export function initEmailCopy() {
  const buttons = Array.from(document.querySelectorAll('[data-email]'));
  if (!buttons.length) return;

  buttons.forEach((button) => {
    let resetTimer;
    button.addEventListener('click', async () => {
      const email = button.dataset.email;
      try {
        await navigator.clipboard.writeText(email);
      } catch {
        return;
      }
      button.classList.add('is-copied');
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => button.classList.remove('is-copied'), 1800);
    });
  });
}
