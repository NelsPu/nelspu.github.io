const VERTEX = `
attribute vec4 particle;
uniform float clockTime, spin, energy, burst, pixelRatio, softenCenter;
varying mediump vec4 tint;
void main() {
  vec3 p = particle.xyz;
  float seed = particle.w;
  float wave = sin(8.0 * p.y + 4.0 * p.x - clockTime * 1.3)
             * cos(5.0 * p.z + clockTime * 0.75);
  float drift = 0.018 * sin(clockTime * 1.1 + seed * 6.28);
  p *= 1.0 + 0.026 * sin(clockTime * 0.8) + wave * (0.034 + energy * 0.025)
       + drift + burst * (0.16 + seed * 0.24);
  float c = cos(spin), s = sin(spin);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  float tilt = 0.26 + sin(clockTime * 0.4) * 0.09;
  p.yz = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * p.yz;
  float perspective = 3.9 / (3.9 - p.z);
  vec2 screen = p.xy * 0.73 * perspective;
  gl_Position = vec4(screen, 0.0, 1.0);
  float depth = clamp(0.5 + p.z * 0.45, 0.0, 1.0);
  gl_PointSize = (2.2 + depth * 1.9 + seed * 0.75) * perspective * pixelRatio * mix(0.59, 1.0, softenCenter);
  vec3 blue = vec3(0.13, 0.36, 0.84);
  vec3 cyan = vec3(0.06, 0.63, 0.70);
  vec3 violet = vec3(0.49, 0.30, 0.82);
  float band = 0.5 + 0.5 * sin(p.y * 2.4 + p.x * 1.2 + clockTime * 0.24);
  vec3 color = mix(mix(blue, cyan, band), violet, smoothstep(0.0, 0.85, -p.y));
  float shimmer = 0.86 + 0.14 * sin(clockTime * 1.8 + seed * 20.0);
  float readability = mix(1.0, 0.18 + 0.82 * smoothstep(0.27, 0.69, length(screen * vec2(0.92, 1.6))), softenCenter);
  tint = vec4(color, (0.25 + depth * 0.66) * shimmer * readability * (1.0 - burst * 0.24));
}`;

const FRAGMENT = `
precision mediump float;
varying mediump vec4 tint;
void main() {
  float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float halo = (1.0 - smoothstep(0.08, 1.0, r)) * 0.45;
  float core = (1.0 - smoothstep(0.13, 0.49, r)) * 0.55;
  float alpha = tint.a * (halo + core);
  gl_FragColor = vec4(tint.rgb * alpha, alpha);
}`;

function makeRenderer(gl, count) {
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const shaders = [];
  const dispose = () => { gl.deleteBuffer(buffer); gl.deleteProgram(program); };
  try {
    if (!program || !buffer) throw new Error('WebGL allocation failed');
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('WebGL shader allocation failed');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const points = new Float32Array(count * 4);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - 2 * (i + 0.5) / count;
      const radius = Math.sqrt(1 - y * y);
      const angle = i * goldenAngle;
      const seed = (i * 0.754877666) % 1;
      const shell = 0.95 + seed * 0.07;
      points.set([Math.cos(angle) * radius * shell, y * shell, Math.sin(angle) * radius * shell, seed], i * 4);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'particle');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 0, 0);
    const uniforms = ['clockTime', 'spin', 'energy', 'burst', 'pixelRatio', 'softenCenter']
      .map(name => gl.getUniformLocation(program, name));
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return {
      draw(time, spin, energy, burst, scale, soften) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uniforms[0], time);
        gl.uniform1f(uniforms[1], spin);
        gl.uniform1f(uniforms[2], energy);
        gl.uniform1f(uniforms[3], burst);
        gl.uniform1f(uniforms[4], scale);
        gl.uniform1f(uniforms[5], soften);
        gl.drawArrays(gl.POINTS, 0, count);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  } finally {
    for (const shader of shaders) {
      if (program && gl.isProgram(program)) gl.detachShader(program, shader);
      gl.deleteShader(shader);
    }
  }
}

export function mountParticleSphere({ idle, active, timer, progress }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'particle-canvas';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(pointer: coarse)').matches;
  const lowPower = mobile || (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 4;
  const interval = 1000 / (lowPower ? 30 : 60);
  const count = lowPower ? 780 : 1450;
  const events = new AbortController();
  const options = { signal: events.signal };
  let gl, renderer, slot, state, size = 0, frame = 0, last = null;
  let visible = false, suspended = false, destroyed = false;
  let time = 0, spin = 0, speed = 0.54, energy = 0, burst = 0, completion = null;
  let currentRatio = 1;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = null;
  }

  function canDraw() {
    return !destroyed && !suspended && !document.hidden && !motion.matches && !!renderer && visible && size > 0;
  }

  function schedule() {
    if (!canDraw()) stop();
    else if (!frame) frame = requestAnimationFrame(draw);
  }

  function resize() {
    if (!slot) return;
    size = slot.clientWidth;
    const pixels = Math.max(1, Math.round(size * Math.min(devicePixelRatio || 1, lowPower ? 1.35 : 1.75)));
    currentRatio = pixels / Math.max(1, size);
    if (canvas.width !== pixels || canvas.height !== pixels) canvas.width = canvas.height = pixels;
    if (renderer) gl.viewport(0, 0, pixels, pixels);
    schedule();
  }

  function draw(now) {
    frame = 0;
    if (!canDraw()) return stop();
    const elapsed = last === null ? interval : now - last;
    if (elapsed >= interval - 1) {
      const dt = Math.min(elapsed / 1000, 0.05);
      last = now;
      const fraction = Math.min(1, Math.max(0, (parseFloat(progress.style.width) || 0) / 100));
      const target = state === 'running' ? 0.75 + fraction * 0.85 : state === 'paused' ? 0.015 : 0.54;
      const easing = 1 - Math.exp(-dt * 4);
      speed += (target - speed) * easing;
      energy += ((state === 'running' ? 0.35 + fraction * 0.65 : 0) - energy) * easing;
      time += dt * speed;
      spin = (spin + dt * speed * 0.42) % (Math.PI * 2);
      if (completion !== null) {
        completion += dt;
        const phase = Math.min(1, completion / 1.55);
        burst = Math.sin(Math.PI * phase) ** 2;
        if (phase === 1) completion = null;
      } else {
        burst += (0 - burst) * easing;
      }
      renderer.draw(time, spin, energy, burst, currentRatio, slot === active ? 1 : 0);
    }
    schedule();
  }

  const intersection = new IntersectionObserver(([entry]) => {
    if (!entry || entry.target !== slot) return;
    visible = entry.isIntersecting;
    schedule();
  });
  const dimensions = new ResizeObserver(resize);
  function sync() {
    const nextSlot = timer.hidden ? idle : active;
    const nextState = timer.hidden ? 'idle' : timer.classList.contains('phase-done') ? 'done'
      : timer.classList.contains('is-paused') ? 'paused' : 'running';
    if (nextState !== state) {
      completion = nextState === 'done' ? 0 : null;
      state = nextState;
      nextSlot.dataset.particleState = state;
    }
    if (slot !== nextSlot) {
      intersection.disconnect();
      dimensions.disconnect();
      slot?.removeAttribute('data-renderer');
      stop();
      visible = false;
      slot = nextSlot;
      slot.append(canvas);
      slot.dataset.particleState = state;
      intersection.observe(slot);
      dimensions.observe(slot);
      resize();
    }
    if (renderer && !motion.matches) slot.dataset.renderer = 'webgl';
    else slot.removeAttribute('data-renderer');
    schedule();
  }

  function initialize() {
    if (motion.matches || renderer || destroyed) return;
    try {
      gl ||= canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true });
      if (gl && !gl.isContextLost()) renderer = makeRenderer(gl, count);
    } catch (error) {
      console.warn('Particle sphere is using CSS fallback.', error);
    }
    sync();
    resize();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    events.abort();
    mutations.disconnect();
    intersection.disconnect();
    dimensions.disconnect();
    renderer?.dispose();
    renderer = null;
    if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    gl = null;
    slot?.removeAttribute('data-renderer');
    canvas.remove();
  }

  const mutations = new MutationObserver(sync);
  mutations.observe(timer, { attributes: true, attributeFilter: ['hidden', 'class'] });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); renderer = null; sync(); }, options);
  canvas.addEventListener('webglcontextrestored', initialize, options);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) initialize(); schedule(); }, options);
  motion.addEventListener('change', () => {
    if (motion.matches) { renderer?.dispose(); renderer = null; }
    else initialize();
    sync();
  }, options);
  window.addEventListener('pagehide', event => {
    if (event.persisted) { suspended = true; stop(); }
    else destroy();
  }, options);
  window.addEventListener('pageshow', () => { suspended = false; initialize(); sync(); }, options);
  sync();
  initialize();
  return destroy;
}

// Decorative enhancement: initialization failures must never block timer controls.
try {
  if ('IntersectionObserver' in window && 'ResizeObserver' in window) {
    mountParticleSphere({ idle: document.querySelector('#idle-particles'), active: document.querySelector('#timer-particles'),
      timer: document.querySelector('#timer-view'), progress: document.querySelector('#progress-bar') });
  }
} catch (error) {
  console.warn('Particle sphere is using CSS fallback.', error);
}
