/**
 * PHASE 1 — SYSTEM: Confetti Engine
 * Lightweight canvas-based confetti particle system
 * Used for: sticker reveals, letter reveals, couple finale, gender reveal
 *
 * Design principles:
 * - Max 80 particles — never tanks low-end Android
 * - GPU-accelerated canvas — no DOM particle spam
 * - Auto-cleans up — no memory leaks
 * - Respects prefers-reduced-motion
 */

const Confetti = (() => {

  let canvas    = null;
  let ctx       = null;
  let particles = [];
  let raf       = null;
  let running   = false;

  // Check user's motion preference
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── PARTICLE SHAPES ───────────────────────────────────────

  const SHAPES = ['rect', 'circle', 'star'];

  // ─── COLOR PALETTES ────────────────────────────────────────

  const PALETTES = {
    gold: [
      '#FFD700','#C9A84C','#FFE082','#F9A825','#FFF176','#E8C97A',
    ],
    celebration: [
      '#FFD700','#FF80AB','#40C4FF','#69F0AE','#FF6E40','#EA80FC',
    ],
    pink: [
      '#FF80AB','#F48FB1','#FCE4EC','#E91E63','#FF4081','#FF80AB',
    ],
    blue: [
      '#40C4FF','#29B6F6','#E1F5FE','#0288D1','#81D4FA','#4FC3F7',
    ],
  };

  // ─── SETUP ─────────────────────────────────────────────────

  const ensureCanvas = () => {
    if (canvas && document.contains(canvas)) return;

    canvas = document.createElement('canvas');
    canvas.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9998;
    `;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');

    window.addEventListener('resize', () => {
      if (canvas) {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    });
  };

  // ─── PARTICLE FACTORY ──────────────────────────────────────

  const makeParticle = (options = {}) => {
    const palette = PALETTES[options.palette || 'celebration'];
    const side    = options.side || 'top';  // top | left | right | both

    let x;
    if (side === 'left')  x = -10;
    else if (side === 'right') x = canvas.width + 10;
    else if (side === 'both')  x = Math.random() < 0.5 ? -10 : canvas.width + 10;
    else x = Math.random() * canvas.width;  // top

    const y = side === 'top' ? -10 : Math.random() * canvas.height * 0.3;

    const angle = side === 'left'  ? (Math.random() * 0.5)
                : side === 'right' ? (Math.PI - Math.random() * 0.5)
                : (Math.random() * Math.PI);

    const speed = 3 + Math.random() * 4;

    return {
      x,
      y,
      vx:      Math.cos(angle) * speed,
      vy:      Math.abs(Math.sin(angle)) * speed + 2,  // always falls down
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.15,
      size:     6 + Math.random() * 8,
      color:    palette[Math.floor(Math.random() * palette.length)],
      shape:    SHAPES[Math.floor(Math.random() * SHAPES.length)],
      opacity:  1,
      life:     1,
      decay:    0.008 + Math.random() * 0.006,  // fade out speed
      gravity:  0.12 + Math.random() * 0.06,
    };
  };

  // ─── DRAW PARTICLE ─────────────────────────────────────────

  const drawParticle = (p) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle   = p.color;

    if (p.shape === 'rect') {
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);

    } else if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();

    } else if (p.shape === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const outer = p.size / 2;
        const inner = outer * 0.4;
        const a1    = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const a2    = ((i * 4 + 2) * Math.PI) / 5 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
        else         ctx.lineTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
        ctx.lineTo(Math.cos(a2) * inner, Math.sin(a2) * inner);
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  };

  // ─── ANIMATION LOOP ────────────────────────────────────────

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // Physics
      p.x        += p.vx;
      p.y        += p.vy;
      p.vy       += p.gravity;
      p.vx       *= 0.99;       // slight air resistance
      p.rotation += p.rotSpeed;
      p.life     -= p.decay;
      p.opacity   = Math.max(0, p.life);

      // Remove when dead or off-screen
      if (p.life <= 0 || p.y > canvas.height + 20) {
        particles.splice(i, 1);
        continue;
      }

      drawParticle(p);
    }

    if (particles.length > 0) {
      raf = requestAnimationFrame(animate);
    } else {
      stop();
    }
  };

  // ─── PUBLIC METHODS ────────────────────────────────────────

  /**
   * Fire a burst of confetti from a specific point
   * Great for: sticker reveal, letter reveal
   */
  const burst = (options = {}) => {
    if (reducedMotion) return;
    ensureCanvas();

    const count   = Math.min(options.count || 50, 80);
    const cx      = options.x || canvas.width  / 2;
    const cy      = options.y || canvas.height / 2;
    const palette = PALETTES[options.palette || 'celebration'];

    for (let i = 0; i < count; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 3 + Math.random() * 8;
      particles.push({
        x:        cx,
        y:        cy,
        vx:       Math.cos(angle) * speed,
        vy:       Math.sin(angle) * speed - 3,  // upward bias
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        size:     5 + Math.random() * 9,
        color:    palette[Math.floor(Math.random() * palette.length)],
        shape:    SHAPES[Math.floor(Math.random() * SHAPES.length)],
        opacity:  1,
        life:     1,
        decay:    0.01 + Math.random() * 0.008,
        gravity:  0.15,
      });
    }

    if (!running) startLoop();
  };

  /**
   * Rain confetti from the top of the screen
   * Great for: winner announcement
   */
  const rain = (options = {}) => {
    if (reducedMotion) return;
    ensureCanvas();

    const count = Math.min(options.count || 60, 80);
    for (let i = 0; i < count; i++) {
      particles.push(makeParticle({ palette: options.palette, side: 'top' }));
    }
    if (!running) startLoop();
  };

  /**
   * Cannon burst from both sides — gender reveal moment
   * Maximum drama
   */
  const cannon = (options = {}) => {
    if (reducedMotion) return;
    ensureCanvas();

    const palette = options.palette || 'celebration';
    const count   = Math.min(options.count || 80, 80);

    for (let i = 0; i < count; i++) {
      particles.push(makeParticle({
        palette,
        side: i < count / 2 ? 'left' : 'right',
      }));
    }
    if (!running) startLoop();
  };

  /**
   * Continuous shower — keep spawning until stop() called
   */
  let showerInterval = null;
  const shower = (options = {}) => {
    if (reducedMotion) return;
    ensureCanvas();

    const spawnBatch = () => {
      if (particles.length < 60) {
        for (let i = 0; i < 8; i++) {
          particles.push(makeParticle({ palette: options.palette, side: 'top' }));
        }
      }
    };

    spawnBatch();
    showerInterval = setInterval(spawnBatch, 400);
    if (!running) startLoop();
  };

  const stopShower = () => {
    if (showerInterval) {
      clearInterval(showerInterval);
      showerInterval = null;
    }
  };

  const startLoop = () => {
    running = true;
    raf     = requestAnimationFrame(animate);
  };

  const stop = () => {
    running    = false;
    particles  = [];
    if (raf)   cancelAnimationFrame(raf);
    if (canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
      canvas = null;
      ctx    = null;
    }
    stopShower();
  };

  // ─── PUBLIC API ────────────────────────────────────────────

  return {
    burst,
    rain,
    cannon,
    shower,
    stopShower,
    stop,
    PALETTES,
  };

})();

export default Confetti;
