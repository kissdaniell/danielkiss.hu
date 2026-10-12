import { DICT } from './i18n-hu.js';

// The page comes in two languages: English (index.html, the one edited by
// hand) and Hungarian (hu/index.html, generated from it by
// tools/i18n/build-hu.mjs). Everything written in the markup is translated
// there, at build time, so nothing on this page costs a lookup at runtime.
//
// What is left is the handful of strings the scripts write themselves — the
// menu button's two labels, the hidden gallery links — and those go through
// t(). The dictionary they read is generated from the same language file, so
// a translation still lives in exactly one place.
export const HU = document.documentElement.lang === 'hu';

// Keyed by the English text, which is also what t() hands back when there is
// no translation: a string that has not been added to the language file yet
// shows in English rather than as a missing-key placeholder.
export const t = (en) => (HU && DICT[en]) || en;
