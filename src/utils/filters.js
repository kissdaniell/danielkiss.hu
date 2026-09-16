// What a blur costs, and where this page stops paying it.
//
// Nearly every reveal on the page scatters its target — characters, words,
// lines, tiles — and settles it back: a little x/y, a little rotation, a
// fade, and a blur that clears as the piece lands. On a desktop that last
// term is the one that makes the reveal read as focus rather than as
// movement, and it is worth what it costs.
//
// On a phone it is not. Blur is a paint-time filter: an element carrying one
// is rasterised into its own surface and re-rasterised on every frame the
// value changes, and this page has a lot of them. Measured on the built site
// at 412x823, two hundred and thirty-nine elements were carrying a blur at
// rest — a hundred and ninety-three of them the per-character <div>s that
// SplitText generates, each one an independent surface to blur and composite,
// scrubbed against the scroll. That is the single largest entry in this
// page's main-thread bill by a wide margin.
//
// So the blur term — and only the blur term — is dropped where it cannot be
// afforded. Everything else about every reveal is untouched: the pieces still
// scatter, still tilt, still fade, still land on the same beat. Flip
// CHEAP_FILTERS to `false` below to put it back everywhere and measure again.
import { isPortrait } from './layout.js';

// Read once. All three inputs are fixed for the life of a page load — an
// orientation change re-lays-out the sections that use this, and a reader who
// turns their phone mid-reveal is not owed a different blur policy.
const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Upright is the layout with the least of everything: the fewest pixels of
// bandwidth, the smallest GPU, and the one this page's score is measured on.
// hardwareConcurrency catches the wide-but-weak case that aspect ratio cannot
// — an old laptop is landscape and still cannot afford this.
const CHEAP_FILTERS =
  isPortrait() || reducedMotion || (navigator.hardwareConcurrency || 8) <= 4;

/**
 * A CSS filter string with the blur term included only where it is affordable.
 *
 *   fx(10)                    -> "blur(10px)"  | "none"
 *   fx(3, 'brightness(1.7)')  -> "blur(3px) brightness(1.7)" | "brightness(1.7)"
 *
 * Always returns a real value rather than undefined, so a tween that animates
 * `filter` still has both ends of the property to work with and GSAP is never
 * handed a half-declared transition.
 */
export function fx(blurPx, rest = '') {
  const blur = CHEAP_FILTERS ? '' : `blur(${blurPx}px)`;
  return [blur, rest].filter(Boolean).join(' ') || 'none';
}

// For the handful of places that want to skip building an effect at all
// rather than just drop its blur.
export const cheapFilters = () => CHEAP_FILTERS;
