/**
 * GAME — Emoji Match (kid)
 * Classic memory-match grid. Completes on all pairs matched or timer expiry.
 */

export default function createGame(container, config, callbacks) {

  // Rectangular grids (gridCols x gridRows) take priority; gridSize (a
  // single number) is kept as a fallback for a square N×N grid.
  const gridCols   = config.gridCols || config.gridSize;
  const gridRows   = config.gridRows || config.gridSize;
  const totalPairs = (gridCols * gridRows) / 2;
  let matched = 0;
  let flipped = [];
  let locked = false;
  let elapsed = 0;
  let ended = false;
  let durationTimer = null;
  let mismatchTimer = null;
  const startedAt = Date.now();

  // Fisher-Yates — Array.sort(() => Math.random() - 0.5) uses an
  // inconsistent comparator, which some engines' sort implementations can
  // respond to by dropping or duplicating elements (root cause of the
  // "a card never finds its partner" report — a dropped emoji left one
  // tile without a match anywhere in the deck).
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const deck = shuffle([...config.emojis.slice(0, totalPairs), ...config.emojis.slice(0, totalPairs)]);

  const grid = document.createElement('div');
  // Rows must also be constrained to 1fr (not left to auto-size off each
  // card's aspect-ratio) — otherwise the grid's natural height can exceed
  // its fixed-height, overflow:hidden container on shorter phone screens,
  // silently clipping the last row and making a card look like it has no
  // partner even though the full pair set exists in the DOM.
  grid.style.cssText = `
    display:grid; grid-template-columns: repeat(${gridCols}, 1fr);
    grid-template-rows: repeat(${gridRows}, 1fr);
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
      cursor: pointer; width:100%; height:100%; min-height:0;
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
        mismatchTimer = setTimeout(() => {
          a.textContent = '❔';
          b.textContent = '❔';
          flipped = [];
          locked = false;
          mismatchTimer = null;
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
      clearTimeout(mismatchTimer);
      cards.forEach(c => c.replaceWith());
      grid.remove();
    },
  };
}
