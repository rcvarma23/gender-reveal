/**
 * GAME — Feed the Baby (toddler)
 * One food emoji per round. Tap the big "feed" button.
 * Correct = target food, wrong = distractor. Always completes after `rounds`.
 */

export default function createGame(container, config, callbacks) {

  let round = 0;
  let correct = 0;
  let roundTimer = null;
  let ended = false;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1.5rem;';

  const foodDisplay = document.createElement('div');
  foodDisplay.style.cssText = 'font-size:5rem;';

  const feedBtn = document.createElement('button');
  feedBtn.textContent = '👶 Feed!';
  feedBtn.style.cssText = 'font-size:1.5rem;padding:1.5rem 2rem;border-radius:9999px;border:none;cursor:pointer;background:#C9A84C;color:#0D0B1E;';

  wrap.appendChild(foodDisplay);
  wrap.appendChild(feedBtn);
  container.appendChild(wrap);

  const allFoods = [...config.targetFoods, ...config.wrongFoods];
  let currentFood = null;

  const nextRound = () => {
    if (round >= config.rounds) return finish();
    currentFood = allFoods[Math.floor(Math.random() * allFoods.length)];
    foodDisplay.textContent = currentFood;
    clearTimeout(roundTimer);
    roundTimer = setTimeout(() => {
      round++;
      callbacks.onProgress(Math.round((round / config.rounds) * 100));
      nextRound();
    }, config.displayTimeSec * 1000);
  };

  const onFeed = () => {
    if (ended || !currentFood) return;
    if (config.targetFoods.includes(currentFood)) correct++;
    round++;
    callbacks.onProgress(Math.round((round / config.rounds) * 100));
    if (round >= config.rounds) return finish();
    nextRound();
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(roundTimer);
    callbacks.onComplete(correct);
  };

  feedBtn.addEventListener('click', onFeed);

  return {
    start() { nextRound(); },
    destroy() {
      ended = true;
      clearTimeout(roundTimer);
      feedBtn.removeEventListener('click', onFeed);
      wrap.remove();
    },
  };
}
