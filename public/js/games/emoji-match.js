/**
 * GAME — Emoji Match (kid)
 * Classic memory-match grid. Completes on all pairs matched or timer expiry.
 */

export default function createGame(container, config, callbacks) {

  const totalPairs = (config.gridSize * config.gridSize) / 2;
  let matched = 0;
  let flipped = [];
  let locked = false;
  let elapsed = 0;
  let ended = false;
  let durationTimer = null;
  const startedAt = Date.now();

  const deck = [...config.emojis.slice(0, totalPairs), ...config.emojis.slice(0, totalPairs)]
    .sort(() => Math.random() - 0.5);

  const grid = document.createElement('div');
  grid.style.cssText = `
    display:grid; grid-template-columns: repeat(${config.gridSize}, 1fr);
    gap:.5rem; width:100%; height:100%; padding:.75rem; box-sizing:border-box;
  `;
  container.appendChild(grid);

  const cards = deck.map((emoji, i) => {
    const card = document.createElement('button');
    card.dataset.emoji = emoji;
    card.dataset.index = i;
    card.textContent = '❔';
    card.style.cssText = `
      font-size: 1.75rem; border-radius: var(--radius-md, 12px);
      border: 1.5px solid rgba(255,255,255,.15); background: var(--navy-mid, #2a2660);
      cursor: pointer; aspect-ratio: 1;
    `;
    card.addEventListener('click', () => onFlip(card));
    grid.appendChild(card);
    return card;
  });

  const onFlip = (card) => {
    if (ended || locked || card.classList.contains('matched') || flipped.includes(card)) return;

    card.textContent = card.dataset.emoji;
    flipped.push(card);

    if (flipped.length === 2) {
      locked = true;
      const [a, b] = flipped;
      if (a.dataset.emoji === b.dataset.emoji) {
        a.classList.add('matched');
        b.classList.add('matched');
        matched++;
        flipped = [];
        locked = false;
        callbacks.onProgress(Math.round((matched / totalPairs) * 100));
        if (matched >= totalPairs) finish();
      } else {
        setTimeout(() => {
          a.textContent = '❔';
          b.textContent = '❔';
          flipped = [];
          locked = false;
        }, config.flipBackMs);
      }
    }
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    clearInterval(durationTimer);
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const bonus = elapsedSec <= config.bonusSpeedSec ? config.pointsPerMatch : 0;
    const score = matched * config.pointsPerMatch + bonus;
    callbacks.onComplete(score);
  };

  return {
    start() {
      durationTimer = setInterval(() => {
        elapsed++;
        if (elapsed >= config.gameDurationSec) finish();
      }, 1000);
    },
    destroy() {
      ended = true;
      clearInterval(durationTimer);
      cards.forEach(c => c.replaceWith());
      grid.remove();
    },
  };
}
