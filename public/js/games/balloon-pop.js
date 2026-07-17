/**
 * GAME — Balloon Pop (toddler)
 * Tap floating balloons before they drift off-screen.
 * Always runs the full gameDurationSec, however many get popped — spawn
 * rate/count ramps up in tiers (config.spawnTiers) so it starts calm and
 * gets noticeably busier partway through.
 */

export default function createGame(container, config, callbacks) {

  const EMOJIS = ['🎈', '🎈', '🎈', '🎈'];
  let popped = 0;
  let spawnTimer = null;
  let durationTimer = null;
  let elapsed = 0;
  let ended = false;
  let currentTier = null;
  const balloons = new Set();

  const stageEl = document.createElement('div');
  stageEl.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';
  container.appendChild(stageEl);

  const countEl = document.createElement('div');
  countEl.style.cssText = `
    position:absolute; top:.5rem; left:50%; transform:translateX(-50%); z-index:2;
    font-family: var(--font-display, serif); font-size:1.1rem; font-weight:700;
    color: var(--gold-soft, #C9A84C); background: rgba(8,7,23,.55);
    padding:.3rem .9rem; border-radius: var(--radius-full, 999px);
  `;
  const updateCount = () => { countEl.textContent = `🎈 ${popped} popped!`; };
  updateCount();
  stageEl.appendChild(countEl);

  const timerEl = document.createElement('div');
  timerEl.style.cssText = `
    position:absolute; top:.5rem; right:.5rem; z-index:2;
    font-family: var(--font-display, serif); font-size:1rem; font-weight:700;
    color: var(--gold-bright, #FFD700); background: rgba(8,7,23,.55);
    padding:.3rem .8rem; border-radius: var(--radius-full, 999px);
  `;
  const updateTimer = () => { timerEl.textContent = `⏱ ${Math.max(0, config.gameDurationSec - elapsed)}s`; };
  updateTimer();
  stageEl.appendChild(timerEl);

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
      updateCount();
      // No pop target — the game only ends when time runs out, so kids
      // can pop as many (or as few) balloons as they want.
      callbacks.onProgress(Math.min(100, Math.round((elapsed / config.gameDurationSec) * 100)));
    });
  };

  // config.spawnTiers is a list of { afterSec, intervalMs, count } sorted
  // ascending by afterSec — pick the last tier whose afterSec has passed.
  // Lets the game start calm and then get noticeably busier at a given
  // mark (e.g. a lot more balloons right after the first 10 seconds).
  const tierForElapsed = () => {
    let tier = config.spawnTiers[0];
    for (const t of config.spawnTiers) {
      if (elapsed >= t.afterSec) tier = t;
    }
    return tier;
  };

  const spawnTick = () => {
    for (let i = 0; i < (currentTier.count || 1); i++) spawnBalloon();
  };

  const rescheduleSpawnIfNeeded = () => {
    const nextTier = tierForElapsed();
    if (nextTier === currentTier) return;
    currentTier = nextTier;
    clearInterval(spawnTimer);
    spawnTimer = setInterval(spawnTick, currentTier.intervalMs);
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
      currentTier = tierForElapsed();
      spawnTimer = setInterval(spawnTick, currentTier.intervalMs);
      durationTimer = setInterval(() => {
        elapsed++;
        updateTimer();
        rescheduleSpawnIfNeeded();
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
