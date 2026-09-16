import '../styles/debug.css';

// A measuring harness for "why does this frame take so long", plus a set of
// kill switches for bisecting the answer. Inert unless the URL asks for it, so
// it costs a query-string read on a normal load.
//
//   ?debug            live readout in the corner + window.__perf
//   ?off=a,b,c        switch things off one at a time (see SWITCHES below)
//
// The readout deliberately reports two different numbers for the same frame,
// because which of them is large is the whole diagnosis:
//
//   frame   how long the browser actually took to get to the next frame.
//           This is what the reader feels.
//   main    how long the main thread was busy in that frame — script, style,
//           layout, paint recording — from the long-animation-frame API.
//
// If `frame` is long and `main` is long, the work is on the main thread and
// the breakdown below says which part. If `frame` is long while `main` stays
// short, the main thread finished early and the frame was still late: the cost
// is in the compositor — rasterising layers, blurs, filters, blend modes,
// large or numerous composited layers. That distinction is the one thing you
// cannot get by removing elements one at a time, because both kinds of cost
// disappear when you remove the element.

const params = new URLSearchParams(window.location.search);
const enabled = params.has('debug');
const off = new Set(
  (params.get('off') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

// Everything that can be switched off, and what it takes with it. The CSS ones
// work by !important in debug.css, which beats the inline styles GSAP writes —
// that is the only way to take a property away from a running tween without
// editing the tween.
const SWITCHES = {
  // --- CSS
  glow: 'the name\'s text-shadow aura',
  marker: 'every hand-drawn underline: its SVG turbulence filter and its glitch keyframes',
  blur: 'ALL filters everywhere, including the per-character blur the reveals animate',
  shadow: 'all text-shadows',
  willchange: 'every will-change hint (drops the permanent composited layers)',
  mask: 'the gallery mask-images',
  grain: 'the grain overlay and its blend mode',
  photoglitch: 'the portrait glitch keyframes',
  // --- JS
  flip: 'the hero to sidebar assembly timeline, whole (heroTransition.js)',
  // The assembly, taken apart. `flip` on its own only says "it is in here";
  // these say which property. The first three animate layout, the last two
  // animate a transform on a subtree full of type.
  'flip-photo': 'only the portrait width/height tween (layout)',
  'flip-social': 'only the social row column-gap and per-link width tweens (layout)',
  'flip-stack': 'only the brand stack height-to-zero tween (layout)',
  'flip-name': 'only the name scale tween (raster of scaled type)',
  'flip-nav': 'only the nav link scale tweens (raster of scaled type)',
  ruler: 'the ruler readout that rewrites a dozen labels per scrolled frame',
  // Reverts the name to being re-rasterised on every frame of the scale,
  // which is what it did before the composited-layer treatment. A/B this
  // one against a plain ?debug run.
  namelayer: 'the composited layer the name is scaled on while the hero assembles',
  reveal: 'the skills panel reveal timeline (skills.js)',
  jitter: 'the shared tremor on every drawn mark (motion.js)',
  glitch: 'the character glitch loops and the name glitch',
  liquid: 'the fluid simulation layer',
  smoother: 'ScrollSmoother\'s smoothing (falls back to native scroll)',
};

// Called from the modules that own the JS-side switches.
export function debugOff(name) {
  return off.has(name);
}

export function initDebug() {
  off.forEach((name) => document.documentElement.classList.add(`dbg-${name}`));

  if (!enabled) {
    if (off.size) {
      // Worth saying out loud — a page with something switched off and no
      // readout on it is an easy thing to forget you are looking at.
      console.warn('[debug] switched off:', [...off].join(', '));
    }
    return;
  }

  const hud = document.createElement('div');
  hud.id = 'dbg-hud';
  document.body.appendChild(hud);

  // ---- What the reader feels: the gap between frames.
  let last = performance.now();
  const frames = [];

  // ---- What the main thread was doing: long-animation-frame.
  //
  // Only frames the browser considers long (>50ms) are reported, which is
  // exactly the set worth looking at — and the silence when nothing is
  // reported is itself the signal described at the top of this file.
  const loafs = [];
  let loafSupported = false;

  try {
    new PerformanceObserver((list) => {
      list.getEntries().forEach((e) => {
        const end = e.startTime + e.duration;
        loafs.push({
          at: e.startTime,
          total: e.duration,
          // Time this frame kept anything else waiting.
          blocking: e.blockingDuration,
          // The render phase, and the style+layout part of it. Anything left
          // over inside render is paint recording.
          render: e.renderStart ? end - e.renderStart : 0,
          styleLayout: e.styleAndLayoutStart ? end - e.styleAndLayoutStart : 0,
          scripts: (e.scripts || []).map((s) => ({
            // sourceFunctionName is usually the useful one; invoker says what
            // called it (a rAF, a listener, a promise).
            name: s.sourceFunctionName || s.name || '(anonymous)',
            where: `${s.sourceURL || '?'}:${s.sourceCharPosition ?? '?'}`,
            invoker: s.invoker || s.invokerType || '',
            ms: s.duration,
            // The number that matters most in this codebase: time this script
            // spent inside a layout it forced by reading geometry after
            // writing style.
            forced: s.forcedStyleAndLayoutDuration || 0,
          })),
        });
      });
    }).observe({ type: 'long-animation-frame', buffered: true });
    loafSupported = true;
  } catch {
    console.warn('[debug] long-animation-frame is not available in this browser; frame timings only.');
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = now - last;
    last = now;
    frames.push({ at: now, dt });
    if (frames.length > 600) frames.shift();

    // Rolling second.
    const cutoff = now - 1000;
    let worst = 0;
    let count = 0;
    for (let i = frames.length - 1; i >= 0 && frames[i].at >= cutoff; i--) {
      count++;
      if (frames[i].dt > worst) worst = frames[i].dt;
    }
    const recentLoaf = loafs.filter((l) => l.at >= cutoff);
    const mainMs = recentLoaf.reduce((m, l) => Math.max(m, l.total), 0);

    const verdict = worst < 20
      ? 'ok'
      : mainMs > worst * 0.6
        ? 'MAIN THREAD'
        : loafSupported
          ? 'COMPOSITOR / RASTER'
          : '?';

    hud.textContent = [
      `fps ${count}`,
      `frame worst ${worst.toFixed(1)}ms`,
      `main worst ${mainMs ? `${mainMs.toFixed(1)}ms` : '—'}`,
      `>> ${verdict}`,
      '',
      'p = report   c = clear',
    ].join('\n');
  }
  requestAnimationFrame(tick);

  function report() {
    if (!loafs.length) {
      console.log(
        '%c[debug] no long main-thread frames were recorded.',
        'font-weight:bold',
        '\nIf the page still stuttered, the main thread was keeping up and the cost is'
        + '\nin the compositor: raster of large or filtered layers, blurs, blend modes,'
        + '\nor text being re-rasterised at a changing scale. Switch off ?off=blur,glow,'
        + '\nmarker,willchange one at a time and watch "frame worst" rather than "main".',
      );
      return;
    }

    const worst = loafs.slice().sort((a, b) => b.total - a.total).slice(0, 10);
    console.group(`[debug] ${loafs.length} long frames; worst ${worst[0].total.toFixed(1)}ms`);
    console.table(worst.map((l) => ({
      'total ms': +l.total.toFixed(1),
      'blocking ms': +l.blocking.toFixed(1),
      'render ms': +l.render.toFixed(1),
      'style+layout ms': +l.styleLayout.toFixed(1),
      'paint ms': +(l.render - l.styleLayout).toFixed(1),
      'script ms': +l.scripts.reduce((s, x) => s + x.ms, 0).toFixed(1),
    })));

    // Which functions, summed across every long frame, and how much of that
    // was a layout they forced.
    const byScript = new Map();
    loafs.forEach((l) => l.scripts.forEach((s) => {
      const key = `${s.name}  ${s.where}`;
      const acc = byScript.get(key) || { ms: 0, forced: 0, calls: 0, invoker: s.invoker };
      acc.ms += s.ms;
      acc.forced += s.forced;
      acc.calls += 1;
      byScript.set(key, acc);
    }));
    console.table(
      [...byScript.entries()]
        .sort((a, b) => b[1].ms - a[1].ms)
        .slice(0, 15)
        .map(([key, v]) => ({
          script: key,
          invoker: v.invoker,
          calls: v.calls,
          'total ms': +v.ms.toFixed(1),
          'forced layout ms': +v.forced.toFixed(1),
        })),
    );

    const totals = loafs.reduce((t, l) => ({
      style: t.style + l.styleLayout,
      paint: t.paint + (l.render - l.styleLayout),
      script: t.script + l.scripts.reduce((s, x) => s + x.ms, 0),
    }), { style: 0, paint: 0, script: 0 });
    console.log(
      'Across all long frames — script %.0fms, style+layout %.0fms, paint %.0fms.',
      totals.script, totals.style, totals.paint,
    );
    console.groupEnd();
  }

  window.__perf = {
    report,
    clear() {
      frames.length = 0;
      loafs.length = 0;
      console.log('[debug] cleared');
    },
    frames,
    loafs,
    switches: SWITCHES,
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'p') report();
    if (e.key === 'c') window.__perf.clear();
  });

  console.log(
    '%c[debug] on.%c Scroll the hero, then press p for the report.\n'
    + 'Kill switches: add ?off=name,name — one at a time.\n%o',
    'font-weight:bold', '', SWITCHES,
  );
}
