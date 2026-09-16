// Media the opening frame doesn't need.
//
// A <video> with a src is fetched as soon as the parser reaches it, and the
// second liquid video (the one #skills fades in behind the liquid canvas)
// sits near the very top of the document — so its whole file used to start
// downloading with the page, competing for bandwidth with the hero's own
// poster at exactly the point where LCP is decided, on behalf of a layer
// nobody sees until two and a half viewports further down.
//
// Anything carrying `data-src` instead of a <source> is left alone until the
// page has settled: whichever comes first of the browser going idle after
// load, or the reader scrolling at all. #skills starts its fade-in while it
// is still a full viewport below the fold, so there is a wide margin either
// way — and if the connection is slow enough that there isn't, an unloaded
// background layer costs nothing but a few seconds of plain background.
import { isPortrait, onLayoutMode } from '../utils/layout.js';

export function initDeferredMedia() {
  const videos = Array.from(document.querySelectorAll('video[data-src]'));
  if (!videos.length) return;

  let attached = false;

  function attach() {
    if (attached) return;
    attached = true;

    videos.forEach((video) => {
      // Below 4:3 the liquid layer has left the page by the end of the
      // opening frame (see ui/liquidRetire.js), so the video that fades in
      // behind it is a file fetched and decoded for a layer nobody sees
      // again. Marked on the element rather than checked for the whole
      // module, because the grain is deferred the same way and is wanted in
      // both layouts. Asked again if the window is turned, which is the one
      // way this can become wanted after the fact.
      if (video.dataset.wideOnly !== undefined && isPortrait()) {
        attached = false;
        return;
      }
      if (!video.dataset.src) return;
      const source = document.createElement('source');
      source.src = video.dataset.src;
      source.type = 'video/mp4';
      video.appendChild(source);
      delete video.dataset.src;
      video.load();
      // For anything that would rather arrive than appear — see the grain's
      // rule in styles/main.css. Harmless on the videos that have no such
      // rule, which is all the others.
      video.classList.add('is-attached');
      // These are muted and playsinline, so the autoplay policy allows a
      // programmatic play — but a rejection (a backgrounded tab, a
      // reduced-data preference) is not something anything else waits on.
      video.play().catch(() => {});
    });
  }

  // Scrolling is the impatient path: someone already moving down the page
  // wants this sooner than an idle callback might get round to it.
  window.addEventListener('scroll', attach, { once: true, passive: true });

  onLayoutMode((portrait) => {
    if (!portrait) attach();
  });

  const whenIdle = () => (window.requestIdleCallback || ((fn) => setTimeout(fn, 200)))(attach, { timeout: 3000 });
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
}
