// The background follows the timer view; it never reads or sets the clock.
function mountFlow(timer, canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 4) <= 4;
  const interval = 1000 / 30;
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let seed = 31297;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const points = Array.from({ length: compact ? 950 : 1350 }, () => [random(), random(), random(), random()]);
  const dust = Array.from({ length: 90 }, () => [random(), random(), random()]);
  const colors = ['24,127,171', '64,106,187', '111,81,181'];
  let width = 0, height = 0, frame = 0, last = null, suspended = false, destroyed = false;
  let time = 0, speed = 1, completion = null, done = false, spread = 0;

  function paint() {
    ctx.clearRect(0, 0, width, height);
    for (const [u, v, n] of dust) {
      ctx.fillStyle = `rgba(${colors[n > .65 ? 2 : 0]},${.10 + n * .13})`;
      ctx.fillRect(((u + time * .008) % 1) * width, (v + .012 * Math.sin(time + u * 15)) * height, 1 + n, 1 + n);
    }
    for (const [u, v, n, r] of points) {
      const second = r > .68;
      const travel = ((u + time * (second ? .031 : .046)) % 1) * 1.48 - .24;
      if (travel < -.03 || travel > 1.03) continue;
      const ripple = Math.sin(travel * 6.1 + time * .55 + v * 2.9);
      const fold = Math.cos(travel * 5.3 - time * .36 + v * 4.7);
      const x = travel * width;
      const y = height * ((second ? .30 : .68) - (travel - .5) * (second ? -.42 : .54)
        + ripple * (second ? .082 : .107) + (v - .5) * (.12 + .07 * fold) + spread * (v - .5) * .28);
      const depth = .5 + .5 * fold;
      const away = Math.min(1, Math.hypot((x - width * .5) / (width * .34), (y - height * .49) / (height * .155)));
      const alpha = (.15 + .48 * depth) * (.19 + .81 * away) * (second ? .65 : 1);
      const radius = .48 + depth * .86 + n * .55;
      const rgb = colors[second ? 2 : n > .65 ? 1 : 0];
      ctx.fillStyle = `rgba(${rgb},${alpha * .20})`;
      ctx.beginPath(); ctx.arc(x, y, radius * 2.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(${rgb},${alpha})`;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    }
  }

  function visible() { return !destroyed && !suspended && !document.hidden && !timer.hidden && width > 0 && height > 0; }
  function stop() { cancelAnimationFrame(frame); frame = 0; last = null; }
  function schedule() {
    if (!visible() || motion.matches) stop();
    else if (!frame) frame = requestAnimationFrame(draw);
  }
  function draw(now) {
    frame = 0;
    if (!visible() || motion.matches) return stop();
    const elapsed = last === null ? interval : now - last;
    if (elapsed >= interval - 1) {
      const dt = Math.min(.06, elapsed / 1000);
      last = now;
      const target = timer.classList.contains('is-paused') ? .025 : done ? .24 : 1.06;
      speed += (target - speed) * (1 - Math.exp(-dt * 4));
      time += dt * speed;
      if (completion !== null) {
        completion += dt;
        const progress = Math.min(1, completion / 1.6);
        spread = Math.sin(progress * Math.PI) ** 2;
        if (progress === 1) completion = null;
      } else spread *= Math.exp(-dt * 4);
      paint();
    }
    schedule();
  }
  function sync() {
    const nextDone = !timer.hidden && timer.classList.contains('phase-done');
    if (nextDone !== done) {
      done = nextDone;
      completion = done && !motion.matches ? 0 : null;
    }
    schedule();
  }
  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!visible()) return stop();
    const scale = Math.min(devicePixelRatio || 1, compact ? 1.25 : 1.5);
    const pixelsWide = Math.max(1, Math.round(width * scale));
    const pixelsHigh = Math.max(1, Math.round(height * scale));
    if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
      canvas.width = pixelsWide; canvas.height = pixelsHigh;
    }
    ctx.setTransform(pixelsWide / width, 0, 0, pixelsHigh / height, 0, 0);
    paint();
    schedule();
  }
  const layout = new ResizeObserver(resize);
  const state = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'hidden')) resize();
    sync();
  });
  layout.observe(canvas);
  state.observe(timer, { attributes: true, attributeFilter: ['hidden', 'class'] });
  document.addEventListener('visibilitychange', resize, options);
  motion.addEventListener('change', () => { completion = null; spread = 0; resize(); }, options);
  window.addEventListener('pageshow', () => { suspended = false; resize(); }, options);
  window.addEventListener('pagehide', event => {
    stop();
    if (event.persisted) { suspended = true; return; }
    destroyed = true;
    state.disconnect(); layout.disconnect(); listeners.abort();
    canvas.width = canvas.height = 1;
  }, options);
  timer.dataset.flowBackground = 'ready';
  resize();
}

try {
  const timer = document.querySelector('#timer-view');
  const canvas = timer?.querySelector('.timer-flow-background');
  if (canvas && 'ResizeObserver' in window) mountFlow(timer, canvas);
} catch (error) {
  console.warn('Training background unavailable.', error);
}
