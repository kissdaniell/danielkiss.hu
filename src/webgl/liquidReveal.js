import { onViewportResize } from '../utils/viewport.js';

// Ported from a WPKoi "interactive liquid reveal" widget (jQuery + Elementor)
// to vanilla JS. Same WebGL fluid-sim technique (Pavel Dogreat style double-FBO
// solver) used as a reveal mask: the canvas paints an opaque bg-color layer and
// only turns transparent where the pointer has disturbed the "dye" field, so a
// video sitting underneath it peeks through and slowly heals back over.

const SHADERS = {
  vert: `
precision highp float;

attribute vec2 aPosition;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 u_vertex_texel;

void main () {
  vUv = aPosition * .5 + .5;
  vL = vUv - vec2(u_vertex_texel.x, 0.);
  vR = vUv + vec2(u_vertex_texel.x, 0.);
  vT = vUv + vec2(0., u_vertex_texel.y);
  vB = vUv - vec2(0., u_vertex_texel.y);
  gl_Position = vec4(aPosition, 0., 1.);
}
`,

  fragAdvection: `
precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D u_velocity_txr;
uniform sampler2D u_input_txr;
uniform vec2 u_vertex_texel;
uniform vec2 u_output_textel;
uniform float u_dt;
uniform float u_dissipation;

vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}

void main () {
  vec2 coord = vUv - u_dt * bilerp(u_velocity_txr, vUv, u_vertex_texel).xy * u_vertex_texel;
  gl_FragColor = u_dissipation * bilerp(u_input_txr, coord, u_output_textel);
  gl_FragColor.a = 1.;
}
`,

  fragDivergence: `
precision highp float;
precision highp sampler2D;

varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D u_velocity_txr;

void main () {
  float L = texture2D(u_velocity_txr, vL).x;
  float R = texture2D(u_velocity_txr, vR).x;
  float T = texture2D(u_velocity_txr, vT).y;
  float B = texture2D(u_velocity_txr, vB).y;
  float div = .5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0., 0., 1.);
}
`,

  fragPressure: `
precision highp float;
precision highp sampler2D;

varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D u_pressure_txr;
uniform sampler2D u_divergence_txr;

void main () {
  float L = texture2D(u_pressure_txr, vL).x;
  float R = texture2D(u_pressure_txr, vR).x;
  float T = texture2D(u_pressure_txr, vT).x;
  float B = texture2D(u_pressure_txr, vB).x;
  float divergence = texture2D(u_divergence_txr, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0., 0., 1.);
}
`,

  fragGradientSubtract: `
precision highp float;
precision highp sampler2D;

varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D u_pressure_txr;
uniform sampler2D u_velocity_txr;

void main () {
  float L = texture2D(u_pressure_txr, vL).x;
  float R = texture2D(u_pressure_txr, vR).x;
  float T = texture2D(u_pressure_txr, vT).x;
  float B = texture2D(u_pressure_txr, vB).x;
  vec2 velocity = texture2D(u_velocity_txr, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0., 1.);
}
`,

  fragPoint: `
precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D u_input_txr;
uniform float u_ratio;
uniform vec3 u_point_value;
uniform vec2 u_point;
uniform float u_point_size;

void main () {
  vec2 p = vUv - u_point.xy;
  p.x *= u_ratio;
  vec3 splat = pow(2., -dot(p, p) / u_point_size) * u_point_value;
  vec3 base = texture2D(u_input_txr, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.);
}
`,

  fragDisplay: `
precision highp float;
precision highp sampler2D;

varying vec2 vUv;
uniform sampler2D u_output_texture;
uniform vec3 u_bg_color;

void main () {
  vec3 C = texture2D(u_output_texture, vUv).rgb;
  float a = dot(C, vec3(0.333));
  a = pow(a, .4);
  a = clamp(a, 0., 1.);
  gl_FragColor = vec4(max(u_bg_color - C, 0.0), 1. - a);
}
`,
};

// Ambient drops: the layer disturbs itself now and then, so it is never inert
// for a reader who hasn't moved the pointer — or who has no pointer at all.
// `size` is a multiplier on the pointer's own splat radius and `force` is in
// the same units the pointer's dx/dy carry; both are ranges, so no two drops
// land alike. `arms` is the ring of outward impulses that turns the landing
// from a hole into a splash, and `armReach` is how far out that ring sits as
// a fraction of the drop's own visible radius.
//
// Scaling these: a drop's visible radius goes with the *square root* of
// `size` (see queueDrop), so a drop 40% smaller across wants size × 0.36, not
// × 0.6. `force` is a velocity and so scales linearly with the same 0.6 —
// leaving it alone would keep flinging a now-smaller drop just as far, and
// the spread is most of what the eye reads as the drop's size. `armReach` is
// already relative, so it takes care of itself.
const DROP = {
  size: [1.8, 5.8],
  force: [84, 204],
  arms: 8,
  armReach: 0.9,
};

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((x) => x + x).join('');
  }
  const num = parseInt(hex, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

export function initLiquidReveal(container, options = {}) {
  if (!container) return;

  const video = container.querySelector('.hero-liquid-video');
  const canvas = container.querySelector('.hero-liquid-canvas');
  if (!canvas) return;

  const rootStyles = getComputedStyle(document.documentElement);
  const bgColor = hexToRgb(options.bgColor || rootStyles.getPropertyValue('--color-bg').trim() || '#ffffff');
  const liquidColor = hexToRgb(options.liquidColor || rootStyles.getPropertyValue('--color-text').trim() || '#1a1815');
  const fluidDetail = options.fluidDetail || 'medium';
  const renderQuality = options.renderQuality || 'high';

  let simResolution;
  switch (fluidDetail) {
    case 'low':
      simResolution = 64;
      break;
    case 'high':
      simResolution = 256;
      break;
    default:
      simResolution = 128;
  }

  // The dye field is where nearly all of this simulation's cost sits: it is
  // the one buffer sized off the *display* rather than off the coarse
  // velocity grid, and getResolution below turns this number into the short
  // edge of a landscape buffer — so 1024 on a 16:9 window meant advecting a
  // 1806x1024 field, twice a frame, with a four-tap bilinear fetch per texel.
  // Close to two million texels of work per pass for a soft, slow-healing
  // mask that is drawn into a canvas well under half that size and (below the
  // hero) sits at 0.3 opacity behind everything else on the page.
  //
  // 512 puts the dye at roughly one texel per rendered pixel instead of four,
  // which is where a blurry field like this stops being able to show the
  // difference.
  let dyeResolution;
  switch (renderQuality) {
    case 'low':
      dyeResolution = 384;
      break;
    case 'ultra':
      dyeResolution = 1024;
      break;
    default:
      dyeResolution = 512;
  }

  let pressureIterations;
  switch (fluidDetail) {
    case 'low':
      pressureIterations = 6;
      break;
    case 'high':
      pressureIterations = 12;
      break;
    default:
      pressureIterations = 8;
  }

  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    simResolution = 64;
    dyeResolution = 384;
    pressureIterations = 5;
  }

  // The drawing buffer is deliberately smaller than the box it fills, and the
  // browser scales it back up. Everything this canvas ever draws is a soft
  // gradient — the dye's own edges are the output of pow(a, 0.4) on a diffused
  // field — so bilinear upscaling from three-quarter size has nothing crisp to
  // lose, while the final full-viewport blit gets a little under half as much
  // to shade.
  const RENDER_SCALE = 0.75;
  // Pointer positions and drop placements are in CSS pixels of the container,
  // so they are normalized against these rather than against the (now
  // differently sized) drawing buffer.
  let cssW = Math.max(1, canvas.clientWidth);
  let cssH = Math.max(1, canvas.clientHeight);

  const listeners = [];
  function addListener(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  }

  let isVisible = true;
  const observer = new IntersectionObserver(
    (entries) => {
      isVisible = entries[0].isIntersecting;
    },
    { threshold: 0.1 },
  );
  observer.observe(container);

  function sizeCanvas() {
    cssW = Math.max(1, canvas.clientWidth);
    cssH = Math.max(1, canvas.clientHeight);
    canvas.width = Math.max(1, Math.round(cssW * RENDER_SCALE));
    canvas.height = Math.max(1, Math.round(cssH * RENDER_SCALE));
  }

  sizeCanvas();

  const radiusMultiplier = (options.radius || 16) / 30;
  const dissipationInput = options.dissipation ?? 35;
  const dissipationMapped = 0.95 + (dissipationInput / 99) * 0.049;

  const params = {
    SIM_RESOLUTION: simResolution,
    DYE_RESOLUTION: dyeResolution,
    DENSITY_DISSIPATION: dissipationMapped,
    VELOCITY_DISSIPATION: 0.9,
    PRESSURE_ITERATIONS: pressureIterations,
    SPLAT_RADIUS: (3 * radiusMultiplier) / window.innerHeight,
    color: liquidColor,
  };

  let prevTimestamp = Date.now();

  // Where the pointer is taken to be until the first real event reaches it.
  // Only that first event's own delta is measured against this, so it needs
  // to be somewhere plausible rather than anywhere in particular.
  const pointer = {
    x: 0.65 * window.innerWidth,
    y: 0.5 * window.innerHeight,
    dx: 0,
    dy: 0,
    moved: false,
  };

  const gl = canvas.getContext('webgl', {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    console.warn('WPKoi Liquid: WebGL not supported');
    return;
  }

  const floatExt = gl.getExtension('OES_texture_float') || gl.getExtension('OES_texture_half_float');
  if (!floatExt) {
    console.warn('WPKoi Liquid: no float texture support');
    return;
  }

  let outputColor;
  let velocity;
  let divergence;
  let pressure;

  function createShader(sourceCode, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, sourceCode);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('WPKoi Liquid: shader compile error: ' + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createShaderProgram(vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('WPKoi Liquid: program link error: ' + gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  function getUniforms(program) {
    const uniforms = [];
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const uniformName = gl.getActiveUniform(program, i).name;
      uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
  }

  const vertexShader = createShader(SHADERS.vert, gl.VERTEX_SHADER);

  function createProgram(shaderKey) {
    const shader = createShader(SHADERS[shaderKey], gl.FRAGMENT_SHADER);
    const program = createShaderProgram(vertexShader, shader);
    const uniforms = getUniforms(program);
    return { program, uniforms };
  }

  const splatProgram = createProgram('fragPoint');
  const divergenceProgram = createProgram('fragDivergence');
  const pressureProgram = createProgram('fragPressure');
  const gradientSubtractProgram = createProgram('fragGradientSubtract');
  const advectionProgram = createProgram('fragAdvection');
  const displayProgram = createProgram('fragDisplay');

  // Re-measured on the shared viewport pass rather than a private debounce
  // (see src/utils/viewport.js), so the simulation buffer is already the
  // right size when ScrollTrigger re-measures everything around it.
  listeners.push(onViewportResize(() => {
    params.SPLAT_RADIUS = (3 * radiusMultiplier) / window.innerHeight;
    sizeCanvas();
    initFBOs();
  }));

  // The container is `position: fixed; inset: 0`, so its box is the viewport
  // and its origin is (0, 0) — always. Every one of the handlers below used to
  // call getBoundingClientRect() to rediscover that, which forces a
  // synchronous layout; a mousemove handler on window is about the worst place
  // on a page to put one, because a high-polling-rate mouse fires it well over
  // a hundred times a second and each call has to flush whatever the frame's
  // animations have just written.
  //
  // Nothing here scrolls it either — it is fixed — so the origin only moves
  // when the viewport itself changes, which is the pass sizeCanvas already
  // runs on.
  let originX = 0;
  let originY = 0;
  listeners.push(onViewportResize(() => {
    const rect = container.getBoundingClientRect();
    originX = rect.left;
    originY = rect.top;
  }));

  // Pointer events, filtered on pointerType — not mouse events, and not a
  // media query either.
  //
  // Removing the touchmove listener was not enough to get the layer to stop
  // reacting to a finger: a tap still produces a synthesised `click`, and
  // usually a synthesised `mousemove` with it, so every tap on the page was
  // still landing a splat. Asking `(hover: hover)` instead would get the
  // common cases right and a hybrid laptop wrong — there the mouse should
  // splash and the touchscreen should not, and only the event knows which one
  // it came from.
  //
  // `pointerType` is that answer, per event: mouse and pen disturb the dye,
  // touch is left to scroll the page. See the note where the touch handler
  // used to be for why.
  const fromPointerDevice = (e) => e.pointerType !== 'touch';

  addListener(window, 'pointerdown', (e) => {
    if (!fromPointerDevice(e)) return;
    pointer.dx = 10;
    pointer.dy = 10;
    pointer.x = e.clientX - originX;
    pointer.y = e.clientY - originY;
  });

  addListener(window, 'pointermove', (e) => {
    if (!fromPointerDevice(e)) return;
    const x = e.clientX - originX;
    const y = e.clientY - originY;
    pointer.moved = true;
    const mouseMultiplier = isMobile ? 3 : 5;
    pointer.dx = mouseMultiplier * (x - pointer.x);
    pointer.dy = mouseMultiplier * (y - pointer.y);
    pointer.x = x;
    pointer.y = y;
  });

  // No touch handler, and that is the whole of it.
  //
  // There is nothing on this page a finger does except scroll. Feeding the
  // solver from touchmove meant every scroll gesture was also a splash: a
  // full-viewport fluid step, at touch sampling rate, competing with the
  // scroll it was triggered by. On a mid-range phone that is what made the
  // first scroll feel like it had been dropped — the gesture was registering,
  // it was just behind a frame of fluid the reader had not asked for.
  //
  // A pointer is a different thing: it moves without committing to anything,
  // and disturbing the dye is the whole point of moving it. That handler is
  // untouched above, so a mouse — on a touchscreen laptop too — still works
  // exactly as it did.
  //
  // The layer does not go inert without it. The ambient drops (see DROP) run
  // regardless, and were written for precisely this case: a reader who has
  // not moved a pointer, or who has none.

  const quad = (() => {
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    return { vertexBuffer, indexBuffer };
  })();

  function blit(target) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quad.indexBuffer);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;

    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
      return { width: max, height: min };
    }
    return { width: min, height: max };
  }

  function createFBO(w, h, type = gl.RGBA) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, type, w, h, 0, type, gl.FLOAT, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      fbo,
      width: w,
      height: h,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
      // Reallocating on resize would otherwise orphan the previous
      // texture/framebuffer pair on the GPU, once per resize, for the life
      // of the page.
      dispose() {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(fbo);
      },
    };
  }

  function createDoubleFBO(w, h, type) {
    let fbo1 = createFBO(w, h, type);
    let fbo2 = createFBO(w, h, type);
    return {
      width: w,
      height: h,
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
      read: () => fbo1,
      write: () => fbo2,
      swap() {
        const temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
      dispose() {
        fbo1.dispose();
        fbo2.dispose();
      },
    };
  }

  function initFBOs() {
    // getResolution derives the simulation grid from the drawing buffer's
    // aspect ratio, so these have to be rebuilt whenever the canvas is
    // resized — otherwise the fluid keeps simulating on the previous
    // window's grid shape and renders stretched into the new one.
    if (outputColor) outputColor.dispose();
    if (velocity) velocity.dispose();
    if (divergence) divergence.dispose();
    if (pressure) pressure.dispose();

    const simRes = getResolution(params.SIM_RESOLUTION);
    const dyeRes = getResolution(params.DYE_RESOLUTION);

    outputColor = createDoubleFBO(dyeRes.width, dyeRes.height);
    velocity = createDoubleFBO(simRes.width, simRes.height);
    divergence = createFBO(simRes.width, simRes.height, gl.RGB);
    pressure = createDoubleFBO(simRes.width, simRes.height, gl.RGB);
  }

  let isReady = false;
  let rafId;

  // One stamp: an impulse into the velocity field at (x, y) in canvas pixels,
  // and the same stamp into the dye, which is what actually opens the canvas
  // up. Lifted out of render() so the ambient drops below can reuse it rather
  // than reimplementing the uniform dance.
  function splat(x, y, dx, dy, size) {
    const minInfluence = 0.02;

    gl.useProgram(splatProgram.program);
    gl.uniform1i(splatProgram.uniforms.u_input_txr, velocity.read().attach(0));
    gl.uniform1f(splatProgram.uniforms.u_ratio, cssW / cssH);
    // x and y arrive in CSS pixels of the container, which is no longer the
    // same ruler as the drawing buffer (see RENDER_SCALE).
    gl.uniform2f(splatProgram.uniforms.u_point, x / cssW, 1 - y / cssH);
    gl.uniform3f(splatProgram.uniforms.u_point_value, dx, -dy, 1);
    gl.uniform1f(splatProgram.uniforms.u_point_size, size);
    blit(velocity.write());
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.u_input_txr, outputColor.read().attach(0));
    gl.uniform3f(
      splatProgram.uniforms.u_point_value,
      Math.max(1 - params.color.r, minInfluence),
      Math.max(1 - params.color.g, minInfluence),
      Math.max(1 - params.color.b, minInfluence),
    );
    blit(outputColor.write());
    outputColor.swap();
  }

  // Drops are scheduled off a timer but applied from inside render(), through
  // this queue: everything else that touches GL state does so on the frame
  // clock, and a timer firing mid-frame (or between the FBO swaps a resize
  // does) has no business writing into a buffer the loop is part-way through.
  const pendingSplats = [];

  function queueDrop(x, y) {
    const scale = DROP.size[0] + Math.random() * (DROP.size[1] - DROP.size[0]);
    const size = params.SPLAT_RADIUS * scale;
    // fragPoint falls off as pow(2, -d^2 / u_point_size), so the stamp's
    // visible radius goes with the square root of that uniform, not with the
    // uniform itself — and d is measured against the canvas's height.
    const radius = Math.sqrt(size) * cssH * DROP.armReach;
    const force = DROP.force[0] + Math.random() * (DROP.force[1] - DROP.force[0]);
    const spin = Math.random() * Math.PI * 2;

    // The landing: no velocity, just a wide stamp.
    pendingSplats.push({ x, y, dx: 0, dy: 0, size });

    // Then a ring pushing outward from it. Without this the drop is a hole
    // that heals straight over; with it the dye gets dragged out along with
    // the velocity, which is what reads as a splash rather than a fade.
    // Rotated by a random offset each time so the ring's own spokes don't
    // land in the same eight places on every drop.
    for (let i = 0; i < DROP.arms; i++) {
      const angle = spin + (i / DROP.arms) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      pendingSplats.push({
        x: x + cos * radius,
        y: y + sin * radius,
        dx: cos * force,
        dy: sin * force,
        size: size * 0.45,
      });
    }
  }

  // One at a time with a fresh random gap rather than a fixed interval, so
  // the drops never fall into a rhythm the eye can predict. The gap is a
  // range the caller can swap out (see setDropRate): the hero wants one every
  // few seconds, the rest of the page wants them rare.
  let dropGap = options.dropGap || [2200, 4200];
  let dropTimer = null;

  function scheduleDrop() {
    clearTimeout(dropTimer);
    if (paused) return;
    const [min, max] = dropGap;
    dropTimer = setTimeout(() => {
      // Skipped while the layer is off-screen or before the sim has produced
      // a frame: a drop nobody can see costs a full disturbance, and it would
      // still be healing by the time anyone looked.
      if (isVisible && isReady) {
        queueDrop(
          // Kept off the very edges — a drop centred on the border only ever
          // shows half of itself, and half a ring doesn't read as a splash.
          (0.1 + Math.random() * 0.8) * cssW,
          (0.1 + Math.random() * 0.8) * cssH,
        );
      }
      scheduleDrop();
    }, min + Math.random() * (max - min));
  }

  // How often the simulation is allowed to step. The hero is the one place
  // anybody is looking at this layer directly — and the one place a pointer is
  // being answered — so it runs on every frame there. Below it the layer is a
  // slow-healing texture at 0.3 opacity behind the whole page, disturbed by
  // one ambient drop every few seconds; stepping it half as often is not
  // something the eye has anything to catch it by, and it hands the frame
  // budget back to whatever section the reader is actually in.
  //
  // Switched by hero.js off the same ScrollTrigger that already decides the
  // drop cadence, so there is one boundary between "this is the hero" and
  // "this is background", not two.
  let minFrameMs = 0;
  let lastFrame = 0;

  // Switched off for good once the page has no further use for this layer
  // (see ui/liquidRetire.js). Distinct from isVisible, which is the layer's
  // own answer about whether it is on screen — this one is the page's.
  let paused = false;

  function render(now = performance.now()) {
    rafId = requestAnimationFrame(render);
    if (paused || !isVisible) return;
    if (minFrameMs && now - lastFrame < minFrameMs) return;
    lastFrame = now;

    let dt = (Date.now() - prevTimestamp) / 1000;
    // Clamped an order wider than the old flat 0.016 so a step that really is
    // 33ms long is simulated as 33ms rather than as 16 — and every rate below
    // is now taken to the power of how many 60fps frames this step stands in
    // for, so the dye dissipates and the velocity decays at the same speed in
    // real seconds whatever the frame rate. Without that, halving the frame
    // rate halved how fast the reveal healed.
    dt = Math.min(dt, 0.05);
    prevTimestamp = Date.now();
    const steps = dt / 0.016;
    const densityDissipation = Math.pow(params.DENSITY_DISSIPATION, steps);
    const velocityDissipation = Math.pow(params.VELOCITY_DISSIPATION, steps);

    if (pointer.moved) {
      pointer.moved = false;
      splat(pointer.x, pointer.y, pointer.dx, pointer.dy, params.SPLAT_RADIUS);
    }

    while (pendingSplats.length) {
      const s = pendingSplats.shift();
      splat(s.x, s.y, s.dx, s.dy, s.size);
    }

    gl.useProgram(divergenceProgram.program);
    gl.uniform2f(divergenceProgram.uniforms.u_vertex_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.u_velocity_txr, velocity.read().attach(0));
    blit(divergence);

    gl.useProgram(pressureProgram.program);
    gl.uniform2f(pressureProgram.uniforms.u_vertex_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.u_divergence_txr, divergence.attach(0));
    for (let i = 0; i < params.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.u_pressure_txr, pressure.read().attach(1));
      blit(pressure.write());
      pressure.swap();
    }

    gl.useProgram(gradientSubtractProgram.program);
    gl.uniform2f(gradientSubtractProgram.uniforms.u_vertex_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.uniforms.u_pressure_txr, pressure.read().attach(0));
    gl.uniform1i(gradientSubtractProgram.uniforms.u_velocity_txr, velocity.read().attach(1));
    blit(velocity.write());
    velocity.swap();

    gl.useProgram(advectionProgram.program);
    gl.uniform2f(advectionProgram.uniforms.u_vertex_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform2f(advectionProgram.uniforms.u_output_textel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.u_velocity_txr, velocity.read().attach(0));
    gl.uniform1i(advectionProgram.uniforms.u_input_txr, velocity.read().attach(0));
    gl.uniform1f(advectionProgram.uniforms.u_dt, dt);
    gl.uniform1f(advectionProgram.uniforms.u_dissipation, velocityDissipation);
    blit(velocity.write());
    velocity.swap();

    gl.uniform2f(advectionProgram.uniforms.u_output_textel, outputColor.texelSizeX, outputColor.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.u_velocity_txr, velocity.read().attach(0));
    gl.uniform1i(advectionProgram.uniforms.u_input_txr, outputColor.read().attach(1));
    gl.uniform1f(advectionProgram.uniforms.u_dissipation, densityDissipation);
    blit(outputColor.write());
    outputColor.swap();

    isReady = true;

    gl.useProgram(displayProgram.program);
    gl.uniform3f(displayProgram.uniforms.u_bg_color, bgColor.r, bgColor.g, bgColor.b);
    gl.uniform1i(displayProgram.uniforms.u_output_texture, outputColor.read().attach(0));
    blit();
  }

  initFBOs();
  render();
  scheduleDrop();

  if (video && video.paused) {
    video.play().catch(() => {
      /* autoplay can be blocked until a user gesture; poster stays visible */
    });
  }

  return {
    // Reschedules immediately rather than letting the pending timer run out
    // first — otherwise a switch to a much rarer cadence would still owe the
    // page one drop at the old one.
    setDropRate(min, max) {
      dropGap = [min, max];
      scheduleDrop();
    },
    // 0 for "every frame the browser offers". See the note on minFrameMs.
    setFrameRate(fps) {
      minFrameMs = fps > 0 ? 1000 / fps : 0;
    },
    // Stops the solver, the display pass and the ambient drops without
    // throwing anything away, so scrolling back up brings the layer back
    // exactly as it was rather than rebuilding it.
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      if (paused) {
        clearTimeout(dropTimer);
        return;
      }
      // However long it has been away, the solver must not be handed a dt
      // measured from whenever it last ran.
      prevTimestamp = Date.now();
      lastFrame = 0;
      scheduleDrop();
    },
    destroy() {
      listeners.forEach((off) => off());
      observer.disconnect();
      clearTimeout(dropTimer);
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}
