import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

import '../styles/transition.css';
import { dpx } from '../utils/viewport.js';
import { liveGlitchLoop } from '../utils/motion.js';
import { fx } from '../utils/filters.js';

// The copy that carries the passage between the awards and the closing
// frame. Only the two lines live here; the two things that make this section
// worth its scroll distance are driven from elsewhere against this same
// element — the sidebar coming apart and the contact field assembling, both
// in contact.js, which is where the elements they move actually live.
export function initTransition() {
  const section = document.querySelector('#transition');
  const light = document.querySelector('.transition-line--light');
  const accent = document.querySelector('.transition-line--accent');
  if (!section || !light || !accent) return;

  document.fonts.load('400 64px "Anton"').then(() => {
    const splitLight = new SplitText(light, { type: 'chars' });
    const splitAccent = new SplitText(accent, { type: 'chars' });

    const scatter = (split) => {
      split.chars.forEach((char) => {
        gsap.set(char, {
          x: dpx(gsap.utils.random(-46, 46)),
          y: dpx(gsap.utils.random(-26, 26)),
          rotate: gsap.utils.random(-16, 16),
          filter: fx(10),
          opacity: 0,
        });
      });
    };
    scatter(splitLight);
    scatter(splitAccent);

    // Tied to the line's own arrival rather than to the whole passage, whose
    // length is there for the sidebar and the field. The line sits near the
    // top of the section now, so the reveal has to finish that much earlier.
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top 90%',
        end: 'top 20%',
        scrub: 0.4,
      },
    });

    // Filler tween so the timeline's natural duration is the full 0..1 the
    // scrub maps onto — without it every position label below would fire
    // early, scaled by 1/(end of the last real tween).
    tl.to({}, { duration: 1 }, 0);

    const settle = { x: 0, y: 0, rotate: 0, filter: fx(0), opacity: 1, ease: 'none' };
    tl.to(splitLight.chars, { ...settle, duration: 0.34, stagger: 0.012 }, 0.1);
    tl.to(splitAccent.chars, { ...settle, duration: 0.34, stagger: 0.012 }, 0.34);

    liveGlitchLoop(splitAccent.chars);
  });
}
