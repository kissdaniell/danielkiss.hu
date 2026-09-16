import { defineConfig } from 'vite';

// The comments in index.html are worth having - they are most of what explains
// why the markup is shaped the way it is. They are not worth shipping: the
// document is the first thing on the critical path and every byte of it lands
// before the stylesheet is even discovered. On this page they are 17% of the
// file and, because prose compresses so much worse than markup, 32% of what
// actually goes over the wire.
//
// So: kept in the source, dropped from the build. Script and style bodies are
// lifted out before the pass and put back after, so nothing that only looks
// like a comment to a regular expression is touched.
function stripHtmlComments() {
  // Distinctive enough that it cannot collide with page content - unlike a
  // bare number, which the markup is full of. Asserted below regardless.
  const held = (i) => `__HTML_HELD_${i}__`;
  const HELD = /__HTML_HELD_(\d+)__/g;

  return {
    name: 'strip-html-comments',
    // After Vite has injected its own tags - there is nothing of ours left to
    // reorder by then, and its markers are gone from the output either way.
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // A plain substring test, not HELD.test(): that regex carries /g, and
        // a global regex's test() is stateful through lastIndex.
        if (html.includes('__HTML_HELD_')) {
          throw new Error('strip-html-comments: placeholder collides with page content');
        }

        const bodies = [];
        const parked = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
          bodies.push(match);
          return held(bodies.length - 1);
        });

        const out = parked
          .replace(/<!--[\s\S]*?-->/g, '')
          // The blank lines the comments leave behind, collapsed to one.
          .replace(/\n\s*\n\s*\n+/g, '\n\n')
          .replace(HELD, (_, i) => bodies[Number(i)]);

        if (out.includes('__HTML_HELD_')) {
          throw new Error('strip-html-comments: a parked block was not restored');
        }
        return out;
      },
    },
  };
}

export default defineConfig({
  plugins: [stripHtmlComments()],
  build: {
    // Reported per chunk on every build, which is the only way a regression
    // here gets noticed before a Lighthouse run does.
    reportCompressedSize: true,
  },
});
