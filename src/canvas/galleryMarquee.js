import { onViewportResize } from '../utils/viewport.js';
import { isPortrait } from '../utils/layout.js';

// Infinite horizontal film-strip marquee, drawn entirely on a single 2D
// canvas (no DOM slide nodes). Motion is a slow constant drift, arrived at
// from a much faster one: the strip comes in travelling several times its
// resting speed and eases down to it over a couple of seconds, which is what
// gives it an entrance rather than merely a presence.
//
// Page-scroll velocity used to be added on top of that and eased back down,
// so scrolling sped the strip up. That is gone: it meant the strip's speed
// was a second thing the reader's scrolling was doing, competing with the
// pin the section holds them in, and it cost a scroll-position read on every
// frame.
//
// Hovering a slide ramps up a
// glitch pass on that one instance only: banded RGB-channel split + noise,
// re-rolled on a stepped clock rather than smoothly, to match the stepped
// (steps(1,jump-end)) glitch language used on the underline elsewhere on
// the site rather than reading as a smooth wobble.

const WORK_SIZE = 512;
const BAND_COUNT = 7;
const TICK_MS = 80;

// Pseudo-3D bend: slides are drawn flat, but their destination rect is
// resized around a common horizontal centre line based on how far they sit
// from the canvas's own centre — as if the strip were a wide band curving
// *away* from the viewer in the middle. So the middle of the row is its far
// side: slides there are shortest, and they grow back toward both edges.
//
// Height carries nearly all of it and width only a little. That asymmetry is
// the whole effect: matching them would just be a row of boxes changing size,
// whereas holding the width almost steady leaves the top and bottom edges of
// the strip tracing two visible arcs bowing toward each other. Pure 2D
// scale/offset math (no real rotation), cheap enough to recompute for every
// slide every frame.
// Deeper and rounder than the first pass at this. Both figures moved once the
// bend became continuous: with each slide flat, a shallow arc was all the
// stepping between them could carry without looking like a staircase, and a
// high exponent kept the middle of the strip almost level so the stepping was
// the only thing left to read. Now that the surface curves, it can afford to
// curve visibly.
const CURVE_MIN_HEIGHT = 0.7;
const CURVE_EXPONENT = 1.4;

// How many vertical slices each slide is drawn in. This is what makes the
// bend continuous: sampling the arc once per slide gave every slide one flat
// height, so the strip read as a row of upright boards each set a little
// deeper than the last, rather than as one surface curving away. Sampled per
// column instead, the top and bottom edges of each slide follow the same
// arc the strip as a whole lies on.
const CURVE_SLICES = 18;

// Colour is spent where the reader is actually looking. Slides at the centre
// of the strip keep their own, and both ends fall away toward near-grey and a
// little darker — a soft edge in colour to go with the mask the CSS already
// puts on the box, so the row dissolves outward instead of ending.
const EDGE_DESATURATION = 0.88;
const EDGE_DARKENING = 0.26;

// Small vertical breathing room so a source image with content running to its
// own edges never sits flush against the slide's top/bottom. Much smaller
// than it was: the curve above already holds every slide off both edges by
// resizing it, and stacking the old 6% on top of that was spending the bend's
// own effect on padding nobody can see.
const IMAGE_INSET_RATIO = 0.025;

// Caption sizing, all as fractions of the slide it sits in, so it holds its
// proportion as the curve resizes each one. The rest is in em off the type
// size, matching .wpkoi-media-tag's own padding/gap/dot proportions.
const LABEL_SIZE_RATIO = 0.068;
const LABEL_SIZE_RANGE = [10, 16];
const LABEL_INSET_RATIO = 0.055;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function hash(n) {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

// Combines an arbitrary number of "seed" numbers (tick, band index, channel
// offset, slide seed...) into one pseudo-random 0..1 value — the standard
// GLSL fract(sin(dot(...)) * k) hash, ported to JS so the glitch effects on
// the page share a family resemblance.
function rand(...parts) {
  let n = 0;
  parts.forEach((p, i) => {
    n += p * (12.9898 + i * 37.719);
  });
  return hash(n);
}

// object-fit: cover, but biased rather than centered: a too-wide source
// still crops its sides evenly (there's no other option), but a too-tall
// source keeps its top edge and only crops away the bottom.
function coverRect(srcW, srcH, targetAspect) {
  const srcAspect = srcW / srcH;
  if (srcAspect > targetAspect) {
    const sw = srcH * targetAspect;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / targetAspect;
  return { sx: 0, sy: 0, sw: srcW, sh };
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function tintChannel(img, color) {
  const c = document.createElement('canvas');
  c.width = WORK_SIZE;
  c.height = WORK_SIZE;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, WORK_SIZE, WORK_SIZE);
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = color;
  cx.fillRect(0, 0, WORK_SIZE, WORK_SIZE);
  return c;
}

function makeNoiseTile(size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const cx = c.getContext('2d');
  const data = cx.createImageData(size, size);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.random() * 255;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  cx.putImageData(data, 0, 0);
  return c;
}

// `items` may be plain src strings or {src, label, href} objects — the contact
// field only needs the former, the portfolio strip captions and links its
// slides.
export function initGalleryMarquee(canvas, items, options = {}) {
  if (!canvas || !items?.length) return null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Same three inks .wpkoi-media-tag uses, read from the stylesheet rather
  // than repeated here as literals.
  const rootStyles = getComputedStyle(document.documentElement);
  const chipFill = rootStyles.getPropertyValue('--color-light').trim() || '#ece7dc';
  const chipInk = rootStyles.getPropertyValue('--color-bg').trim() || '#17171a';
  const chipDot = rootStyles.getPropertyValue('--color-accent').trim() || '#ff321d';

  const slideAspect = options.slideAspect ?? 1;
  const gapRatio = options.gapRatio ?? 0.11;
  const baseSpeed = options.baseSpeed ?? 55;
  // What the strip arrives at, as a multiple of the speed it settles to, and
  // how long it takes to give it up. The decay is exponential, so this is a
  // time constant rather than a duration: at 0.55 the strip is within a fifth
  // of its resting speed after a second and a half and indistinguishable from
  // it by three.
  const entrySpeed = baseSpeed * (options.entryBoost ?? 9);
  const entrySettle = options.entrySettle ?? 0.55;

  const canHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;

  const slides = items.map((item) => ({
    src: typeof item === 'string' ? item : item.src,
    label: typeof item === 'string' ? null : item.label || null,
    href: typeof item === 'string' ? null : item.href || null,
    img: null,
    ready: false,
    channelsReady: false,
    rC: null,
    gC: null,
    bC: null,
  }));
  const noiseTiles = Array.from({ length: 4 }, () => makeNoiseTile());

  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d');

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cssW = 0;
  let cssH = 0;
  let slideW = 0;
  let slideH = 0;
  let gap = 0;
  let unit = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    slideH = cssH;
    slideW = slideH * slideAspect;
    gap = slideH * gapRatio;
    unit = slideW + gap;

    scratch.width = Math.max(1, Math.round(slideW * dpr));
    scratch.height = Math.max(1, Math.round(slideH * dpr));
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();

  // Debounced by the shared viewport pass rather than a private timer, so
  // the strip is already re-measured by the time ScrollTrigger refreshes the
  // pin it lives inside.
  const offResize = onViewportResize(resize);

  Promise.all(slides.map((slide) => loadImage(slide.src))).then((imgs) => {
    imgs.forEach((img, i) => {
      if (!img) return;
      slides[i].img = img;
      slides[i].ready = true;
    });
  });

  function wrapIndex(n) {
    return ((n % slides.length) + slides.length) % slides.length;
  }

  function ensureChannels(slide) {
    if (slide.channelsReady) return;
    slide.channelsReady = true;
    slide.rC = tintChannel(slide.img, '#ff0000');
    slide.gC = tintChannel(slide.img, '#00ff00');
    slide.bC = tintChannel(slide.img, '#0000ff');
  }

  const mouse = { x: -9999, y: -9999, clientX: -9999, clientY: -9999, active: false, dirty: false };
  const hover = { n: null, intensity: 0 };
  let cursorIsPointer = false;

  // Viewport coordinates are kept raw here and resolved to canvas-local ones
  // once per frame, inside the loop (see tick). The canvas rides a pinned
  // section so its box really does move, which rules out caching the origin —
  // but a mousemove handler can fire several times per frame on a fast mouse,
  // and getBoundingClientRect() is a forced synchronous layout every time. One
  // per frame is the least this can cost while staying correct.
  function onMove(e) {
    mouse.clientX = e.clientX;
    mouse.clientY = e.clientY;
    mouse.active = true;
    mouse.dirty = true;
  }
  function onLeave() {
    mouse.active = false;
  }

  if (canHover) {
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
  }

  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
  }, { threshold: 0 });
  io.observe(canvas);

  // Being on screen is not the same as being *seen* here. The strip lives
  // inside a pinned section, so for the whole second half of that pin — a
  // full viewport of scrolling — it stays exactly where it is, at
  // opacity 0, while scene two plays over it. It went on drawing anyway:
  // seven slides a frame, each one a filtered composite into a scratch
  // buffer and eighteen slices back out of it, for a layer that had faded
  // out. portfolio.js switches this off across that stretch (see the act-two
  // trigger, which was already watching that progress for something else).
  let running = true;

  // Which slide instance (not index — the strip repeats) covers a point, or
  // null. Shared by the hover pass and the click handler so a tap can never
  // open a theme the pointer wasn't actually over.
  function slideAt(x, y) {
    if (unit <= 0) return null;
    const nGuess = Math.floor((x + scrollX) / unit);
    for (let n = nGuess - 1; n <= nGuess + 1; n++) {
      const leftX = n * unit - scrollX;
      const c = computeCurve(leftX);
      if (x < c.dx || x > c.dx + c.dw) continue;
      const band = bandAt(x);
      if (y >= band.top && y <= band.top + band.height) return n;
    }
    return null;
  }

  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const n = slideAt(e.clientX - rect.left, e.clientY - rect.top);
    if (n === null) return;
    const { href } = slides[wrapIndex(n)];
    // noopener: these open on a third-party domain, and an opened tab with a
    // handle back on window.opener can navigate the page that spawned it.
    if (href) window.open(href, '_blank', 'noopener');
  }
  canvas.addEventListener('click', onClick);

  function updateHover(dt) {
    const newHoverN = mouse.active ? slideAt(mouse.x, mouse.y) : null;
    if (newHoverN !== hover.n) hover.n = newHoverN;

    const target = hover.n !== null ? 1 : 0;
    const tau = target > hover.intensity ? 0.09 : 0.32;
    const k = 1 - Math.exp(-dt / tau);
    hover.intensity += (target - hover.intensity) * k;
    if (hover.intensity < 0.001) hover.intensity = 0;

    // Only written when it actually changes: this runs every frame, and an
    // unconditional style write on every one of them is a style
    // invalidation the compositor has to look at 60 times a second for
    // nothing.
    const wantsPointer = hover.n !== null;
    if (wantsPointer !== cursorIsPointer) {
      cursorIsPointer = wantsPointer;
      canvas.style.cursor = wantsPointer ? 'pointer' : 'default';
    }
  }

  // The band the whole strip lies on, at one x. Everything vertical comes
  // from here, per column — which is the difference between a curved surface
  // and a row of flat boards at varying depths.
  function bandAt(x) {
    const norm = clamp((x - cssW / 2) / (cssW / 2), -1, 1);
    const bend = Math.pow(Math.abs(norm), CURVE_EXPONENT);
    const height = slideH * (CURVE_MIN_HEIGHT + (1 - CURVE_MIN_HEIGHT) * bend);
    const pad = height * IMAGE_INSET_RATIO;
    return { top: (slideH - height) / 2 + pad, height: height - pad * 2 };
  }

  // Per-slide values only: where it starts, how wide it is, and how graded.
  // Width is constant now — with the arc carried by height alone, varying it
  // as well only reintroduced the per-slide stepping this was meant to lose.
  function computeCurve(leftX) {
    const centerX = leftX + slideW / 2;
    const norm = clamp((centerX - cssW / 2) / (cssW / 2), -1, 1);
    const edge = Math.abs(norm);
    const bend = Math.pow(edge, CURVE_EXPONENT);
    return {
      dx: leftX,
      dw: slideW,
      edge,
      saturation: 1 - EDGE_DESATURATION * bend,
      shade: 1 - EDGE_DARKENING * bend,
    };
  }

  // Puts the scratch buffer onto the band in vertical slices, each taking its
  // top and height from the arc at its own x. Each slice is drawn a pixel
  // wider than its step so neighbours overlap rather than leaving seams where
  // the sub-pixel edges land.
  function drawBent(dx, dw) {
    const step = dw / CURVE_SLICES;
    const srcStep = scratch.width / CURVE_SLICES;
    for (let i = 0; i < CURVE_SLICES; i++) {
      const x = dx + i * step;
      const band = bandAt(x + step / 2);
      ctx.drawImage(scratch, srcStep * i, 0, srcStep, scratch.height, x, band.top, step + 1, band.height);
    }
  }

  // Graded once into the scratch buffer and bent from there, rather than
  // grading each of the slices: the filter chain would otherwise be set up
  // CURVE_SLICES times per slide per frame for exactly the same result.
  //
  // The crop is recomputed per draw rather than cached on the slide: the box
  // it has to cover no longer has one fixed aspect ratio — the arc gives
  // every slide a different one, and it changes as the strip moves. It is
  // measured at the slide's own middle, so the slight squash either side of
  // that across a slide's width is the bend itself rather than an error.
  function drawPlain(slide, leftX) {
    const c = computeCurve(leftX);
    const band = bandAt(c.dx + c.dw / 2);
    const cover = coverRect(slide.img.naturalWidth || 1, slide.img.naturalHeight || 1, c.dw / band.height);

    sctx.clearRect(0, 0, slideW, slideH);
    sctx.filter = `saturate(${(0.95 * c.saturation).toFixed(3)}) brightness(${(0.94 * c.shade).toFixed(3)}) contrast(1.04)`;
    sctx.drawImage(slide.img, cover.sx, cover.sy, cover.sw, cover.sh, 0, 0, slideW, slideH);
    sctx.filter = 'none';

    drawBent(c.dx, c.dw);
    drawLabel(slide, c);
  }

  // The theme's name and its number, as the same chip .wpkoi-media-tag draws
  // further down the page: a light plate in the slide's top-left corner with
  // an accent dot ahead of the words. A plate rather than a scrim because the
  // photographs underneath vary too much for light type to survive them, and
  // matching the other gallery is worth more than inventing a second
  // treatment. Everything is sized off the band the slide is standing on, so
  // a caption on a shrunken middle slide stays in proportion to it.
  function drawLabel(slide, c) {
    if (!slide.label) return;
    // Upright there is no room for them. The caption is sized off the band the
    // slide stands on, and at portrait widths that band is narrow enough that
    // the chip runs past the edges of the photograph it belongs to — a label
    // floating over its neighbours rather than naming its own slide. The
    // numbering it carries is decorative; the strip reads without it.
    if (isPortrait()) return;

    const band = bandAt(c.dx + c.dw / 2);
    const size = clamp(band.height * LABEL_SIZE_RATIO, LABEL_SIZE_RANGE[0], LABEL_SIZE_RANGE[1]);
    const padX = size * 0.7;
    const padY = size * 0.35;
    const dotR = size * 0.25;
    const gap = size * 0.55;

    ctx.font = `500 ${size}px Satoshi, sans-serif`;
    // Not supported everywhere; assigning an unknown property is harmless and
    // the caption simply reads untracked where it isn't.
    ctx.letterSpacing = `${(size * 0.06).toFixed(2)}px`;
    const text = slide.label.toUpperCase();
    const chipW = padX * 2 + dotR * 2 + gap + ctx.measureText(text).width;
    const chipH = size + padY * 2;

    // Placed against the arc under its own middle, so a chip near a steep
    // part of the curve doesn't hang off the top edge of the slide it labels.
    const chipX = c.dx + c.dw * LABEL_INSET_RATIO;
    const chipY = bandAt(chipX + chipW / 2).top + band.height * LABEL_INSET_RATIO;

    // Edge slides lose their caption along with their colour, rather than a
    // bright plate staying crisp over a photograph that has faded out from
    // under it.
    ctx.globalAlpha = c.shade * c.shade;
    ctx.fillStyle = chipFill;
    ctx.fillRect(chipX, chipY, chipW, chipH);

    ctx.fillStyle = chipDot;
    ctx.beginPath();
    ctx.arc(chipX + padX + dotR, chipY + chipH / 2, dotR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = chipInk;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, chipX + padX + dotR * 2 + gap, chipY + chipH / 2 + size * 0.06);

    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
  }

  function drawGlitched(slide, leftX, intensity, now, n) {
    ensureChannels(slide);

    const c = computeCurve(leftX);
    const band = bandAt(c.dx + c.dw / 2);
    // The scratch is a fixed slideW x slideH buffer that gets stretched onto
    // the band, so the crop taken out of the channel canvases is the
    // *destination's* aspect ratio, not the scratch's: the stretch on the way
    // out is exactly what undoes the squash on the way in.
    const workCover = coverRect(WORK_SIZE, WORK_SIZE, c.dw / band.height);

    const tick = Math.floor(now / TICK_MS);
    const seed = (n % 97) + slide.src.length;
    const bandSrcH = workCover.sh / BAND_COUNT;
    const bandDstH = slideH / BAND_COUNT;

    sctx.clearRect(0, 0, slideW, slideH);
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, slideW, slideH);

    sctx.globalCompositeOperation = 'screen';
    const channels = [
      { canvas: slide.rC, seedOff: 0, bias: 6 },
      { canvas: slide.gC, seedOff: 100, bias: 0 },
      { canvas: slide.bC, seedOff: 200, bias: -6 },
    ];
    channels.forEach((ch) => {
      for (let b = 0; b < BAND_COUNT; b++) {
        const jitter = rand(tick, b, seed, ch.seedOff) * 2 - 1;
        const burst = rand(tick, b, seed, ch.seedOff + 50) > 0.9 ? 3 : 1;
        const dx = (jitter * 9 * burst + ch.bias) * intensity;
        const sy = workCover.sy + bandSrcH * b;
        const dy = bandDstH * b;
        sctx.drawImage(ch.canvas, workCover.sx, sy, workCover.sw, bandSrcH, dx, dy, slideW, bandDstH);
      }
    });
    sctx.globalCompositeOperation = 'source-over';

    const tile = noiseTiles[Math.floor(rand(tick, seed, 7) * noiseTiles.length) % noiseTiles.length];
    sctx.globalAlpha = 0.18 * intensity;
    sctx.globalCompositeOperation = 'overlay';
    sctx.drawImage(tile, 0, 0, slideW, slideH);
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = 'source-over';

    if (rand(tick, seed, 60) > 0.94) {
      const flashBand = Math.floor(rand(tick, seed, 61) * BAND_COUNT);
      sctx.fillStyle = 'rgba(255,255,255,0.55)';
      sctx.fillRect(0, flashBand * bandDstH, slideW, bandDstH);
    }

    // Unlike drawPlain, the grade goes on the way out: the scratch is built
    // up over several composite passes above, so there is no single draw into
    // it to hang a filter on. Only ever one slide at a time is glitched, so
    // the per-slice filter setup this costs is paid once per frame at most.
    ctx.globalAlpha = c.shade;
    ctx.filter = `saturate(${c.saturation.toFixed(3)})`;
    drawBent(c.dx, c.dw);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    drawLabel(slide, c);
  }

  function draw(now) {
    ctx.clearRect(0, 0, cssW, cssH);
    if (unit <= 0) return;

    const nStart = Math.floor((scrollX - unit) / unit);
    const nEnd = Math.ceil((scrollX + cssW) / unit);

    for (let n = nStart; n <= nEnd; n++) {
      const leftX = n * unit - scrollX;
      const slide = slides[wrapIndex(n)];
      if (!slide.ready) continue;

      if (n === hover.n && hover.intensity > 0.002) {
        drawGlitched(slide, leftX, hover.intensity, now, n);
      } else {
        drawPlain(slide, leftX);
      }
    }
  }

  let scrollX = 0;
  // Starts at the entrance speed rather than the resting one, so the first
  // time the strip is looked at it is already slowing down. burst() below
  // does the same again for a reader who leaves and comes back.
  let speed = entrySpeed;
  let lastTime = performance.now();
  let rafId = null;

  function tick(now) {
    rafId = requestAnimationFrame(tick);

    const dt = clamp((now - lastTime) / 1000, 0, 0.05);
    lastTime = now;

    if (!visible || !running) return;

    speed += (baseSpeed - speed) * (1 - Math.exp(-dt / entrySettle));
    scrollX += speed * dt;

    if (mouse.dirty) {
      mouse.dirty = false;
      const rect = canvas.getBoundingClientRect();
      mouse.x = mouse.clientX - rect.left;
      mouse.y = mouse.clientY - rect.top;
    }

    updateHover(dt);
    draw(now);
  }

  rafId = requestAnimationFrame(tick);

  return {
    // Whether the strip is worth drawing at all. Position and speed are held
    // while it is off, so switching back on continues from where it stopped
    // rather than jumping.
    setRunning(next) {
      if (next === running) return;
      running = next;
      // Whatever time piled up while it was off would otherwise arrive as one
      // enormous step on the first frame back.
      lastTime = performance.now();
    },
    // Hand the strip its entrance speed again. Called when the gallery is
    // revealed, in both directions — a reader who scrolls back up and returns
    // gets the same arrival they got the first time.
    burst() {
      speed = entrySpeed;
    },
    destroy() {
      cancelAnimationFrame(rafId);
      offResize();
      canvas.removeEventListener('click', onClick);
      if (canHover) {
        canvas.removeEventListener('mousemove', onMove);
        canvas.removeEventListener('mouseleave', onLeave);
      }
      io.disconnect();
    },
  };
}
