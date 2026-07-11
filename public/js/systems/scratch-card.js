/**
 * PHASE 5 — SYSTEM: Scratch Card
 * Draws a metallic gold overlay on a canvas and lets the guest scratch
 * it off with touch/mouse. Fires onThreshold() once enough of the
 * canvas has been cleared, then fades the whole overlay out.
 *
 * Markup contract (see components.css):
 *   <div class="scratch-card-wrap">
 *     <div class="scratch-letter"><span class="scratch-letter-text">?</span></div>
 *     <canvas class="scratch-canvas"></canvas>
 *   </div>
 */

const ScratchCard = (() => {

  const init = (canvasEl, options = {}) => {
    const {
      onThreshold = () => {},
      thresholdPct = 55,
      brushRadius  = 22,
      label        = 'SCRATCH HERE',
    } = options;

    const ctx = canvasEl.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let scratching = false;
    let done = false;

    const rect = canvasEl.getBoundingClientRect();
    const cssWidth  = rect.width;
    const cssHeight = rect.height;
    canvasEl.width  = Math.round(cssWidth * dpr);
    canvasEl.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const paintForeground = () => {
      ctx.globalCompositeOperation = 'source-over';
      const gradient = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
      gradient.addColorStop(0,   '#8B7A3F');
      gradient.addColorStop(0.5, '#C9A84C');
      gradient.addColorStop(1,   '#8B7A3F');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      ctx.font = '700 1rem "DM Sans", sans-serif';
      ctx.fillStyle = 'rgba(13,11,30,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cssWidth / 2, cssHeight / 2);
    };

    const scratchAt = (x, y) => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, brushRadius, 0, Math.PI * 2);
      ctx.fill();
    };

    const getScratchedPct = () => {
      const data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
      const sampleStep = 8; // sample a grid instead of every pixel — keeps this cheap
      let total = 0, cleared = 0;
      for (let i = 3; i < data.length; i += 4 * sampleStep) {
        total++;
        if (data[i] === 0) cleared++;
      }
      return total ? (cleared / total) * 100 : 0;
    };

    let checkScheduled = false;
    const scheduleCheck = () => {
      if (checkScheduled || done) return;
      checkScheduled = true;
      requestAnimationFrame(() => {
        checkScheduled = false;
        if (!done && getScratchedPct() >= thresholdPct) {
          done = true;
          revealAll();
          onThreshold();
        }
      });
    };

    const revealAll = () => {
      canvasEl.style.transition = 'opacity .6s ease';
      canvasEl.style.opacity = '0';
      setTimeout(() => { canvasEl.style.display = 'none'; }, 650);
    };

    const posFromEvent = (e) => {
      const r = canvasEl.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onPointerDown = (e) => {
      scratching = true;
      canvasEl.setPointerCapture?.(e.pointerId);
      onPointerMove(e);
    };
    const onPointerUp = () => { scratching = false; };
    const onPointerMove = (e) => {
      if (!scratching || done) return;
      const { x, y } = posFromEvent(e);
      scratchAt(x, y);
      scheduleCheck();
    };

    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerup',   onPointerUp);
    canvasEl.addEventListener('pointercancel', onPointerUp);

    paintForeground();

    return {
      destroy() {
        canvasEl.removeEventListener('pointerdown', onPointerDown);
        canvasEl.removeEventListener('pointermove', onPointerMove);
        canvasEl.removeEventListener('pointerup',   onPointerUp);
        canvasEl.removeEventListener('pointercancel', onPointerUp);
      },
      forceReveal() {
        if (done) return;
        done = true;
        revealAll();
      },
    };
  };

  return { init };

})();

export default ScratchCard;
