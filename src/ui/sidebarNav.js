import { ScrollSmoother } from 'gsap/ScrollSmoother';

// Plain in-page anchors don't scroll correctly once ScrollSmoother owns the
// page's scroll — route them through its own scrollTo so the animation stays
// in sync with the transform it applies.
export function initSidebarNav() {
  const links = document.querySelectorAll('.sidebar-nav a[href^="#"]');

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;

      event.preventDefault();
      const smoother = ScrollSmoother.get();
      if (smoother) {
        smoother.scrollTo(target, true, 'top top');
      } else {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

// Which section lights which nav link. Usually one-to-one, but #wpkoi has
// no nav entry of its own — it's the second half of the Works story the
// portfolio section starts (it opens on the same WPKoi mark that one ends
// on), so it keeps "Works" lit rather than leaving the nav dark for a whole
// pinned section. #hero is deliberately absent: it's just the scroll spacer
// driving the hero-to-sidebar transition, not a real section, so
// "Introduce" never gets this treatment.
const SPY_TARGETS = [
  { id: 'skills', nav: 'skills' },
  { id: 'portfolio', nav: 'portfolio' },
  { id: 'wpkoi', nav: 'portfolio' },
  { id: 'awards', nav: 'awards' },
  // The passage between the two lights Contact, the same way #wpkoi lights
  // Works: it is the approach to that section, not a place of its own.
  { id: 'transition', nav: 'contact' },
  { id: 'contact', nav: 'contact' },
];

// The visible label out of a nav link, without its leading index number —
// read from the markup rather than kept as a second list here, so the
// readout can never drift out of step with what the nav actually says.
function navLabel(link) {
  // The visible words sit inside .nav-inner now — the box ui/heroHeader.js
  // breaks up, which the link itself could not be because heroTransition.js
  // already owns its transform. Falls back to the link for anything that
  // hasn't got one.
  const box = link.querySelector('.nav-inner') || link;
  return Array.from(box.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join('')
    .trim();
}

// Highlights whichever real section is currently in view, and names it in
// the fixed readout down the right-hand edge. That readout is otherwise
// ruler.js's, but this is the module that already knows which section is in
// view — and it has to name the hero, which the scrollspy below deliberately
// never lights in the nav itself.
export function initNavScrollspy() {
  const sections = SPY_TARGETS.map(({ id, nav }) => ({
    el: document.getElementById(id),
    link: document.querySelector(`.sidebar-nav a[href="#${nav}"]`),
  })).filter((s) => s.el && s.link);
  if (!sections.length) return;

  const readout = document.querySelector('.fixed-datas-section');
  const heroLink = document.querySelector('.sidebar-nav a[href="#hero"]');
  // Whatever the nav calls the hero ("Introduce"). It's what the readout
  // falls back to whenever no real section is in view — which, above the
  // fold, is exactly the hero.
  const heroLabel = heroLink ? navLabel(heroLink) : 'Introduce';

  // Tracked as a set of currently-visible sections rather than toggling
  // each link straight from its own entry: two sections can share one link
  // now, and a single callback carrying "portfolio left" plus "wpkoi
  // entered" would otherwise flip Works off or on depending purely on which
  // entry the browser happened to list second.
  const visible = new Set();

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      });

      const inView = sections.filter((s) => visible.has(s.el));
      const activeLinks = new Set(inView.map((s) => s.link));
      sections.forEach((s) => s.link.classList.toggle('is-active', activeLinks.has(s.link)));

      if (readout) {
        // The first entry still in view, in document order — SPY_TARGETS is
        // listed that way, so on the brief overlap between two sections this
        // names the upper one rather than whichever the browser happened to
        // report last.
        const label = inView.length ? navLabel(inView[0].link) : heroLabel;
        readout.textContent = `s:${label}`;
      }
    },
    { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
  );

  sections.forEach((s) => observer.observe(s.el));
}
