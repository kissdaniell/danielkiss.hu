import { gsap } from 'gsap';

import { onViewportResize } from '../utils/viewport.js';
import { onScrollFrame, documentScrollRange as documentRange } from '../utils/scrollFrame.js';
import { debugOff } from '../utils/debug.js';

// Ported from a WPKoi.com ruler widget (jQuery + plain DOM) to vanilla JS.
// Sections opt in to dark ruler ink by carrying a `.dark-ruler` class.

export function initRulers() {
  if (window.innerWidth <= 767 || debugOff('ruler')) return;

  const container = document.querySelector('.hero-rulers');
  const topRuler = document.querySelector('.ruler-top');
  const leftRuler = document.querySelector('.ruler-left');
  const cursorX = document.querySelector('.ruler-cursor-x');
  const cursorY = document.querySelector('.ruler-cursor-y');
  const dataPanel = document.querySelector('.fixed-datas');
  if (!(container && topRuler && leftRuler && dataPanel)) return;

  const [xLabel, yLabel, percentLabel] = dataPanel.querySelectorAll('span');

  // State the two markers' resting pose in GSAP's own terms before anything
  // tweens them.
  //
  // Left to itself, GSAP works this out by reading the computed transform —
  // which is a matrix by then — and decomposing it back into a rotation and a
  // translation. That round trip is exact in principle and slightly lossy in
  // practice: a quarter turn comes back as -90.0000000000000127 degrees, sat
  // on a matrix whose cos term is -2.2e-16 rather than 0. Nothing about that
  // is visible on its own, but it is the kind of near-miss that decides which
  // way a rotation gets interpolated, and this marker has already been caught
  // pointing the wrong way once (see the note on the transition these two used
  // to carry, in ruler.css). Handing GSAP the authored numbers means there is
  // nothing to infer.
  if (cursorX) gsap.set(cursorX, { xPercent: -50 });
  if (cursorY) gsap.set(cursorY, { yPercent: -50, rotate: -90, transformOrigin: 'left center' });

  let topMarks = [];
  let leftMarks = [];
  let topTicks = [];
  let leftTicks = [];

  function pad(value, length) {
    return String(Math.round(value)).padStart(length, '0');
  }

  function buildRuler() {
    topRuler.innerHTML = '';
    leftRuler.innerHTML = '';

    const topFragment = document.createDocumentFragment();
    for (let x = 100; x <= window.innerWidth + 100; x += 100) {
      const mark = document.createElement('div');
      mark.className = 'ruler-mark';
      mark.dataset.pos = x;
      mark.style.left = `${x}px`;
      mark.textContent = x;
      topFragment.appendChild(mark);
    }
    for (let x = 20; x < window.innerWidth; x += 20) {
      if (x % 100 === 0) continue;
      const tick = document.createElement('div');
      tick.className = 'ruler-tick';
      tick.style.left = `${x}px`;
      topFragment.appendChild(tick);
    }
    topRuler.appendChild(topFragment);

    const leftFragment = document.createDocumentFragment();
    for (let y = 100; y <= window.innerHeight + 100; y += 100) {
      const mark = document.createElement('div');
      mark.className = 'ruler-mark';
      mark.dataset.pos = y;
      mark.dataset.base = y;
      mark.style.top = `${y}px`;
      mark.textContent = y;
      leftFragment.appendChild(mark);
    }
    for (let y = 20; y < window.innerHeight; y += 20) {
      if (y % 100 === 0) continue;
      const tick = document.createElement('div');
      tick.className = 'ruler-tick';
      tick.style.top = `${y}px`;
      leftFragment.appendChild(tick);
    }
    leftRuler.appendChild(leftFragment);

    topMarks = [...topRuler.querySelectorAll('.ruler-mark')];
    leftMarks = [...leftRuler.querySelectorAll('.ruler-mark')];
    topTicks = [...topRuler.querySelectorAll('.ruler-tick')];
    leftTicks = [...leftRuler.querySelectorAll('.ruler-tick')];
  }

  function tickDarkState(tick, axisMarks) {
    const pos = parseFloat(axisMarks === topMarks ? tick.style.left : tick.style.top);
    const index = Math.max(0, Math.ceil(pos / 100) - 1);
    return axisMarks[index]?.classList.contains('dark');
  }

  // Which elements the ruler should read as "light surface underneath".
  // Collected on build rather than queried per frame — the set only changes
  // when the DOM does.
  let darkZones = [];
  let darkZonesApplied = false;

  function collectDarkZones() {
    darkZones = Array.from(document.querySelectorAll('.dark-ruler'));
  }

  // Rewritten from an elementFromPoint hit-test per mark (~25 of them, each
  // one a forced hit-test, the whole pass bracketed by two visibility
  // toggles that invalidated style for the entire overlay) to a plain
  // point-in-rect check against the handful of opted-in elements. Same
  // result, but it no longer costs two synchronous layouts on every frame
  // the page scrolls — which is what made this the most expensive thing
  // running on the page.
  function updateDarkSections() {
    if (!darkZones.length) {
      // Nothing has opted in. Clear whatever the last state was, once, and
      // then stay out of the scroll path entirely.
      if (darkZonesApplied) {
        darkZonesApplied = false;
        topMarks.forEach((el) => el.classList.remove('dark'));
        leftMarks.forEach((el) => el.classList.remove('dark'));
        topTicks.forEach((el) => el.classList.remove('dark'));
        leftTicks.forEach((el) => el.classList.remove('dark'));
        dataPanel.classList.remove('dark');
      }
      return;
    }
    darkZonesApplied = true;

    const rects = darkZones.map((el) => el.getBoundingClientRect());
    const covers = (x, y) => rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);

    topMarks.forEach((mark) => {
      mark.classList.toggle('dark', covers(Number(mark.dataset.pos), 10));
    });
    topTicks.forEach((tick) => {
      tick.classList.toggle('dark', !!tickDarkState(tick, topMarks));
    });

    leftMarks.forEach((mark) => {
      mark.classList.toggle('dark', covers(20, Number(mark.dataset.pos)));
    });
    leftTicks.forEach((tick) => {
      tick.classList.toggle('dark', !!tickDarkState(tick, leftMarks));
    });

    const rect = dataPanel.getBoundingClientRect();
    dataPanel.classList.toggle('dark', covers(rect.left + rect.width / 2, rect.top + rect.height / 2));
  }

  // The left-hand marks count document position rather than viewport
  // position, so they carry the scroll offset in their text. Skipped
  // wholesale when that offset hasn't moved a whole pixel: this is a dozen
  // textContent writes into a fixed overlay, and rewriting a label with the
  // number it already shows still costs the layout invalidation.
  //
  // maxScroll is no longer read from the document here. It used to be
  // `document.documentElement.scrollHeight` — a forced synchronous layout of
  // the whole page, taken on every scrolled frame, directly after the writes
  // above had invalidated it. scrollFrame.js keeps it measured off
  // ScrollTrigger's refresh instead, which is the only event that changes it.
  let lastLabelScroll = -1;

  function updateScrollLabels(rawScroll = window.scrollY, maxScroll = documentRange()) {
    const scrollY = Math.round(rawScroll);
    if (scrollY !== lastLabelScroll) {
      lastLabelScroll = scrollY;
      leftMarks.forEach((mark) => {
        mark.textContent = Number(mark.dataset.base) + scrollY;
      });
    }

    const percent = maxScroll > 0 ? Math.min(100, Math.max(1, (rawScroll / maxScroll) * 100)) : 100;
    const next = `p:${pad(percent, 3)}%`;
    if (percentLabel.textContent !== next) percentLabel.textContent = next;
  }

  (window.requestIdleCallback || ((fn) => setTimeout(fn, 200)))(
    () => {
      buildRuler();
      collectDarkZones();
      updateScrollLabels();
      updateDarkSections();
      container.classList.add('is-ready');
      dataPanel.classList.add('is-ready');
    },
    { timeout: 1500 },
  );

  // Pointer proximity glow, batched into one rAF: mousemove can fire several
  // times per frame, and this used to run a full pass over both axes for
  // every one of those events — spawning one GSAP tween *per left-hand mark
  // per event* on top of that, which then fought the 0.33s CSS opacity
  // transition those same marks already carry. Both axes now write opacity
  // directly and let that CSS transition ease it, and a mark is only written
  // when its value actually moved.
  let pointerX = -1;
  let pointerY = -1;
  let pointerFrame = null;
  const markOpacity = new WeakMap();

  function glow(marks, pointerPos) {
    marks.forEach((mark) => {
      const distance = Math.abs(mark.dataset.pos - pointerPos);
      const isDark = mark.classList.contains('dark');
      const base = isDark ? 0.45 : 0.3;
      const peak = isDark ? 0.95 : 0.8;
      const value = base + (peak - base) * Math.max(0, 1 - distance / 180);
      const previous = markOpacity.get(mark);
      if (previous !== undefined && Math.abs(previous - value) < 0.01) return;
      markOpacity.set(mark, value);
      mark.style.opacity = value;
    });
  }

  function applyPointer() {
    pointerFrame = null;
    xLabel.textContent = `x:${pad(pointerX, 4)}`;
    yLabel.textContent = `y:${pad(pointerY, 4)}`;

    gsap.to(cursorX, { x: pointerX, duration: 0.12, ease: 'power2.out', overwrite: true });
    gsap.to(cursorY, { y: pointerY, duration: 0.12, ease: 'power2.out', overwrite: true });

    glow(topMarks, pointerX);
    glow(leftMarks, pointerY);
  }

  window.addEventListener('mousemove', (event) => {
    if (event.clientX === pointerX && event.clientY === pointerY) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(applyPointer);
  }, { passive: true });

  // Shares the page's one batched scroll pass (see utils/scrollFrame.js).
  onScrollFrame((scrollY, maxScroll) => {
    updateScrollLabels(scrollY, maxScroll);
    updateDarkSections();
  });

  onViewportResize(() => {
    buildRuler();
    collectDarkZones();
    updateScrollLabels();
    updateDarkSections();
  });
}
