/**
 * GAME — Balloon Pop (toddler)
 * Tap floating balloons before they drift off-screen.
 * Completes at balloonsToWin popped OR gameDurationSec elapsed.
 */

export default function createGame(container, config, callbacks) {

  const EMOJIS = ['🎈', '🎈', '🎈', '🎈'];
  let popped = 0;
  let spawnTimer = null;
  let durationTimer = null;
  let elapsed = 0;
  let ended = false;
  const balloons = new Set();

  const stageEl = document.createElement('div');
  stageEl.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';
  container.appendChild(stageEl);

  const spawnBalloon = () => {
    if (ended) return;
    const el = document.createElement('button');
    el.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    el.setAttribute('aria-label', 'Pop the balloon');
    const size = config.balloonSizePx;
    const speed = config.balloonSpeedMin + Math.random() * (config.balloonSpeedMax - config.balloonSpeedMin);
    el.style.cssText = `
      position:absolute; left:${Math.random() * 85}%; bottom:-${size}px;
      width:${size}px; height:${size}px; font-size:${size * 0.7}px;
      background:transparent; border:none; cursor:pointer;
      transition: transform ${8 / speed}s linear;
      -webkit-tap-highlight-color: transparent;
    `;
    stageEl.appendChild(el);
    balloons.add(el);

    requestAnimationFrame(() => {
      el.style.transform = `translateY(-${window.innerHeight + size}px)`;
    });

    const cleanup = () => {
      el.remove();
      balloons.delete(el);
    };
    el.addEventListener('transitionend', cleanup);
    el.addEventListener('click', () => {
      if (ended) return;
      popped++;
      cleanup();
      callbacks.onProgress(Math.min(100, Math.round((popped / config.balloonsToWin) * 100)));
      if (popped >= config.balloonsToWin) finish();
    });
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    clearInterval(spawnTimer);
    clearInterval(durationTimer);
    callbacks.onComplete(popped);
  };

  return {
    start() {
      spawnTimer = setInterval(spawnBalloon, config.spawnIntervalMs);
      durationTimer = setInterval(() => {
        elapsed++;
        if (elapsed >= config.gameDurationSec) finish();
      }, 1000);
      spawnBalloon();
    },
    destroy() {
      ended = true;
      clearInterval(spawnTimer);
      clearInterval(durationTimer);
      balloons.forEach(el => el.remove());
      stageEl.remove();
    },
  };
}
