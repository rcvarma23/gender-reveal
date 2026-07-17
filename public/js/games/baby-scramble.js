/**
 * GAME — Baby Scramble (kid / teen-hard, config-driven)
 * Tap scrambled letter tiles to fill answer slots in order.
 * Wrong full-length attempts shake and reset the slots for a retry —
 * they do NOT silently advance to the next word.
 * Completes after wordCount words solved OR gameDurationSec elapsed.
 */

// Fisher-Yates — Array.sort(() => Math.random() - 0.5) uses an
// inconsistent comparator, which some engines' sort implementations can
// respond to by dropping or duplicating elements (e.g. a scrambled word
// silently missing one of its own letters, making it unsolvable).
const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Picks `count` words spread as evenly as possible across small (<=4
// letters), medium (5-6) and large (>6) buckets so every round has a mix
// of difficulty, instead of a flat random slice that could hand back
// several same-length words. Any remainder is given to the small/medium
// buckets first (e.g. count=5 -> 2 small, 2 medium, 1 large).
const pickSizeBalanced = (wordList, count) => {
  const small  = wordList.filter(w => w.length <= 4);
  const medium = wordList.filter(w => w.length >= 5 && w.length <= 6);
  const large  = wordList.filter(w => w.length > 6);

  const base = Math.floor(count / 3);
  const remainder = count - base * 3;
  const take = [base + (remainder > 0 ? 1 : 0), base + (remainder > 1 ? 1 : 0), base];

  return shuffleArray([
    ...shuffleArray(small).slice(0, take[0]),
    ...shuffleArray(medium).slice(0, take[1]),
    ...shuffleArray(large).slice(0, take[2]),
  ]);
};

export default function createGame(container, config, callbacks) {

  const words = config.sizeBalanced
    ? pickSizeBalanced(config.words, config.wordCount)
    : shuffleArray(config.words).slice(0, config.wordCount);
  let wordIndex = 0;
  let solvedCount = 0;
  let placed = [];          // ordered list of tile elements currently placed into slots
  let elapsed = 0;
  let ended = false;
  let durationTimer = null;
  let cardSecLeft = 0;
  let cardTimer = null;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1.5rem;padding:1rem;';

  const cardTimerEl = document.createElement('div');
  cardTimerEl.style.cssText = 'font-family:var(--font-display, serif);font-size:1.1rem;font-weight:700;color:var(--gold-soft, #C9A84C);';

  const slotRow = document.createElement('div');
  slotRow.style.cssText = 'display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;min-height:64px;';

  const tileRow = document.createElement('div');
  tileRow.style.cssText = 'display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;';

  wrap.appendChild(cardTimerEl);
  wrap.appendChild(slotRow);
  wrap.appendChild(tileRow);
  container.appendChild(wrap);

  const scramble = (word) => shuffleArray(word.split(''));

  const tileStyle = `
    font-size:1.25rem; min-width:56px; min-height:56px;
    border-radius: var(--radius-md, 12px); border: 1.5px solid rgba(255,255,255,.15);
    background: var(--navy-mid, #2a2660); color: #FFFFFF; font-weight: 600;
    cursor:pointer; font-family: inherit;
  `;

  const slotStyle = `
    width:52px; height:56px;
    border-radius: var(--radius-md, 12px);
    border: 1.5px dashed rgba(255,255,255,.25);
    display:flex; align-items:center; justify-content:center;
    font-size:1.25rem; color:#FFFFFF; font-weight:600;
    cursor:default;
  `;

  const startCardTimer = () => {
    clearInterval(cardTimer);
    cardSecLeft = config.secPerWord || 30;
    cardTimerEl.textContent = `⏱ ${cardSecLeft}s`;
    cardTimer = setInterval(() => {
      cardSecLeft--;
      cardTimerEl.textContent = `⏱ ${Math.max(cardSecLeft, 0)}s`;
      if (cardSecLeft <= 0) {
        clearInterval(cardTimer);
        onCardExpired();
      }
    }, 1000);
  };

  const onCardExpired = () => {
    if (ended) return;
    // Card ran out of time — move on without crediting a solve.
    wordIndex++;
    callbacks.onProgress(Math.round((wordIndex / words.length) * 100));
    loadWord();
  };

  const loadWord = () => {
    if (wordIndex >= words.length) return finish();
    placed = [];
    slotRow.innerHTML = '';
    tileRow.innerHTML = '';
    if (config.secPerWord) startCardTimer();

    const word    = words[wordIndex];
    const letters = scramble(word);

    // Empty answer slots — one per letter, filled left-to-right as tiles are tapped
    for (let i = 0; i < word.length; i++) {
      const slot = document.createElement('div');
      slot.style.cssText = slotStyle;
      slot.addEventListener('click', () => onSlotTap(i));
      slotRow.appendChild(slot);
    }

    letters.forEach((letter) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.textContent = letter;
      tile.style.cssText = tileStyle;
      tile.addEventListener('click', () => onTileTap(tile, letter, word));
      tileRow.appendChild(tile);
    });
  };

  const renderSlots = () => {
    Array.from(slotRow.children).forEach((slot, i) => {
      const isLastPlaced = i === placed.length - 1;
      slot.textContent = placed[i] ? placed[i].letter : '';
      slot.style.cursor = isLastPlaced ? 'pointer' : 'default';
      slot.style.borderStyle = isLastPlaced ? 'solid' : 'dashed';
    });
  };

  // Tap the most-recently-filled slot to undo it — lets a kid fix a
  // misplaced letter immediately instead of waiting for the full-word
  // mismatch check to shake-and-reset everything.
  const onSlotTap = (i) => {
    if (ended || i !== placed.length - 1) return;
    const removed = placed.pop();
    removed.tile.disabled = false;
    removed.tile.style.opacity = '1';
    renderSlots();
  };

  const onTileTap = (tile, letter, word) => {
    if (ended || tile.disabled || placed.length >= word.length) return;
    tile.disabled = true;
    tile.style.opacity = '.3';
    placed.push({ tile, letter });
    renderSlots();

    if (placed.length === word.length) {
      const attempt = placed.map(p => p.letter).join('');
      if (attempt === word) {
        clearInterval(cardTimer);
        solvedCount++;
        wordIndex++;
        callbacks.onProgress(Math.round((wordIndex / words.length) * 100));
        setTimeout(loadWord, 500);
      } else {
        // Wrong attempt — flash the slots red, then return tiles and
        // let them try again. Previously this fell through and advanced
        // to the next word even on a wrong answer.
        slotRow.style.animation = 'none';
        void slotRow.offsetWidth; // restart animation
        slotRow.style.borderColor = '';
        Array.from(slotRow.children).forEach(s => s.style.borderColor = 'rgba(255,90,90,.8)');
        setTimeout(() => {
          placed.forEach(p => { p.tile.disabled = false; p.tile.style.opacity = '1'; });
          placed = [];
          Array.from(slotRow.children).forEach(s => { s.style.borderColor = 'rgba(255,255,255,.25)'; });
          renderSlots();
        }, 700);
      }
    }
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    clearInterval(durationTimer);
    clearInterval(cardTimer);
    callbacks.onComplete(solvedCount * config.pointsPerWord);
  };

  return {
    start() {
      loadWord();
      durationTimer = setInterval(() => {
        elapsed++;
        if (elapsed >= config.gameDurationSec) finish();
      }, 1000);
    },
    destroy() {
      ended = true;
      clearInterval(durationTimer);
      clearInterval(cardTimer);
      wrap.remove();
    },
  };
}
