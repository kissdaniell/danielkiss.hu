// Makes the Hungarian version of the page: hu/index.html from index.html, and
// src/i18n-hu.js (the texts that live in the scripts), using the translations
// in tools/i18n/hu.json — see README.md next to this file.
//
// Runs before every `npm run dev` / `npm run build`. index.html is the only
// page edited by hand; never edit hu/index.html, it is overwritten.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rows = JSON.parse(readFileSync(join(ROOT, 'tools/i18n/hu.json'), 'utf8'));
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Both columns are written exactly as they stand in the markup, entities and
// all (`&hellip;`, `&mdash;`, `&amp;`), so a translation goes in verbatim.
// The only two things done to it are the ones that depend on where it lands:
// a line break is a <br /> in text and a space in an attribute, and a quote
// would close the attribute it sits in.
const attr = (s) => s.replace(/"/g, '&quot;').replace(/\n/g, ' ');
const text = (s) => s.replace(/\n/g, '<br />');
const put = (open, hu) => (open.endsWith('"') ? attr(hu) : text(hu));

// The English text as it may stand in the markup: any white space between its
// words (the source is wrapped by hand), and a line break written as <br>.
const loose = (en) => en
  .split('\n')
  .map((line) => line.trim().split(/\s+/).map(esc).join('\\s+'))
  .join('\\s*<br\\s*/?>\\s*');

const missing = [];
const swap = (from, to) => {
  if (!html.includes(from)) return false;
  html = html.split(from).join(to);
  return true;
};

// ---- The name, which is the one text that cannot be replaced word by word.
//
// It is two words in two spans — one light, one in accent red — and Hungarian
// puts them the other way round. Replacing "Daniel" with "Kiss" and then
// "Kiss" with "Dániel" would find the first replacement again and leave the
// line reading "Dániel Dániel", so both spans are written out in one pass.
//
// The red belongs to a word rather than to a position: it is on "Kiss" in
// English, where that is the second word, and it stays on "Kiss" in
// Hungarian, where it is the first. So the class travels with the word the
// row's "accent" names, and the markup comes out with the two spans in the
// other order.
const nameRow = rows.find((r) => r.source === 'name' && r.hu);
if (nameRow) {
  const [enFirst, enSecond] = nameRow.en.split(/\s+/);
  const huWords = nameRow.hu.split(/\s+/);
  // Absent, the red stays where English has it: on the second word.
  const accent = huWords.includes(nameRow.accent) ? nameRow.accent : huWords[1];
  if (nameRow.accent && accent !== nameRow.accent) {
    missing.push({ ...nameRow, note: `az "accent" (${nameRow.accent}) nem a név egyik szava` });
  }
  const re = new RegExp(
    `<span class="(sidebar-name-word|hero-portrait-word)">${esc(enFirst)}</span>(\\s*)`
    + `<span class="\\1 \\1--accent">${esc(enSecond)}</span>`,
    'g',
  );
  let hits = 0;
  html = html.replace(re, (m, cls, gap) => {
    hits += 1;
    const span = (word) => `<span class="${cls}${word === accent ? ` ${cls}--accent` : ''}">${word}</span>`;
    return span(huWords[0]) + gap + span(huWords[1]);
  });
  // The sidebar's copy and the opening frame's. One of them going missing is
  // a markup change this script has not been told about.
  if (hits !== 2) missing.push({ ...nameRow, note: `${hits}/2 helyen` });
}

// ---- Texts translated differently in different places.
//
// `in` names the element the row is about (tag.class), and those rows run
// first: whatever they take is no longer there for the general row with the
// same English text to find. "Themes" is the pair this exists for — one
// theme under a number in the hero's statistics, the plural as a skill tag.
const scoped = rows.filter((r) => r.in && r.hu && !/\.js\b/.test(r.source));
for (const r of scoped) {
  const [tag, ...classes] = r.in.split('.');
  const el = `<${tag}\\b[^>]*\\b${esc(classes[classes.length - 1])}\\b[^>]*`;
  // ...as the element's own text (behind any tags it opens with), or as one
  // of its attributes.
  const re = new RegExp(`(${el}>(?:\\s*<[^>]+>)*\\s*|${el}?")${loose(r.en)}(?=\\s*<|")`, 'g');
  let hit = false;
  html = html.replace(re, (m, open) => ((hit = true), open + put(open, r.en === r.hu ? r.en : r.hu)));
  if (!hit) missing.push(r);
}

// ---- Everything else: by its English text, wherever it stands on its own as
// an element's text or as a whole attribute value. Longest first, so a short
// text never bites into a longer one.
const general = rows
  .filter((r) => !r.in && r.hu && r.hu !== r.en && r.source !== 'name' && !/\.js\b/.test(r.source))
  .sort((a, b) => b.en.length - a.en.length);

for (const r of general) {
  const re = new RegExp(`(>|")(\\s*)${loose(r.en)}(\\s*)(?=<|")`, 'g');
  let hit = false;
  html = html.replace(re, (m, open, before, after) => ((hit = true), open + before + put(open, r.hu) + after));
  if (!hit) missing.push(r);
}

// ---- The document itself: the handful of facts that are about the page
// rather than about a sentence on it. These must all land — a page that
// quietly keeps the English canonical is worse than a build that stops.
const must = (from, to) => {
  if (!swap(from, to)) throw new Error('build-hu: not found in index.html: ' + from);
};

must('<html lang="en">', '<html lang="hu">');
must(
  '<link rel="canonical" href="https://danielkiss.hu/" />',
  '<link rel="canonical" href="https://danielkiss.hu/hu/" />',
);
must(
  '<meta property="og:url" content="https://danielkiss.hu/" />',
  '<meta property="og:url" content="https://danielkiss.hu/hu/" />',
);
must('<meta property="og:locale" content="en_US" />', '<meta property="og:locale" content="hu_HU" />');
// The Person in the structured data is described by whichever page carries it.
must('"url": "https://danielkiss.hu/",', '"url": "https://danielkiss.hu/hu/",');
// ...and the language switch in the nav points back the other way.
must(
  '<a href="/hu/" class="nav-lang" hreflang="hu" lang="hu"><span class="nav-inner">HU</span></a>',
  '<a href="/" class="nav-lang" hreflang="en" lang="en"><span class="nav-inner">EN</span></a>',
);

html = html.replace(
  '<!DOCTYPE html>',
  '<!DOCTYPE html>\n<!-- GENERATED from /index.html by tools/i18n/build-hu.mjs — do not edit. -->',
);

mkdirSync(join(ROOT, 'hu'), { recursive: true });
writeFileSync(join(ROOT, 'hu/index.html'), html);

// ---- The scripts' texts. src/i18n.js looks them up by their English string,
// so this is a plain dictionary rather than keys anybody has to invent.
const dict = {};
for (const r of rows.filter((x) => /\.js\b/.test(x.source) && x.hu)) dict[r.en] = r.hu;

writeFileSync(
  join(ROOT, 'src/i18n-hu.js'),
  '// GENERATED by tools/i18n/build-hu.mjs from tools/i18n/hu.json — do not edit.\n'
  + `export const DICT = ${JSON.stringify(dict, null, 2)};\n`,
);

const placed = scoped.length + general.length - missing.filter((r) => r.source !== 'name').length;
console.log(
  `build-hu: hu/index.html written (${placed}/${scoped.length + general.length} texts placed), `
  + `${Object.keys(dict).length} script texts`,
);
for (const r of missing) {
  console.warn(
    '  nincs meg az index.html-ben (megváltozott az angol szöveg?):',
    JSON.stringify(r.en.slice(0, 70)),
    '—',
    r.note || r.source,
  );
}
