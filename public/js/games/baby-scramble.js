/**
 * GAME — Baby Scramble (kid)
 * Tap scrambled letter tiles in order to rebuild each word.
 * Completes after wordCount words solved OR gameDurationSec elapsed.
 */

export default function createGame(container, config, callbacks) {

  const words = [...config.words].sort(() => Math.random() - 0.5).slice(0, config.wordCount);
  let wordIndex = 0;
  let solvedCount = 0;
  let built = '';
  let elapsed = 0;
  let ended = false;
  let durationTimer = null;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1.5rem;padding:1rem;';

  const builtDisplay = document.createElement('div');
  builtDisplay.style.cssText = 'font-size:1.75rem;letter-spacing:.2em;color:var(--gold-soft, #C9A84C);min-height:2.5rem;';

  const tileRow = document.createElement('div');
  tileRow.style.cssText = 'display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;';

  wrap.appendChild(builtDisplay);
  wrap.appendChild(tileRow);
  container.appendChild(wrap);

  const scramble = (word) => word.split('').sort(() => Math.random() - 0.5);

  const loadWord = () => {
    if (wordIndex >= words.length) return finish();
    built = '';
    builtDisplay.textContent = '';
    tileRow.innerHTML = '';
    const letters = scramble(words[wordIndex]);
    letters.forEach((letter) => {
      const tile = document.createElement('button');
      tile.textContent = letter;
      tile.style.cssText = `
        font-size:1.25rem; min-width:64px; min-height:64px;
        border-radius: var(--radius-md, 12px); border: 1.5px solid rgba(255,255,255,.15);
        background: var(--navy-mid, #2a2660); cursor:pointer;
      `;
      tile.addEventListener('click', () => {
        if (ended || tile.disabled) return;
        tile.disabled = true;
        tile.style.opacity = '.3';
        built += letter;
        builtDisplay.textContent = built;
        if (built === words[wordIndex]) {
          solvedCount++;
          wordIndex++;
          callbacks.onProgress(Math.round((wordIndex / words.length) * 100));
          setTimeout(loadWord, 500);
        } else if (built.length >= words[wordIndex].length) {
          setTimeout(() => { wordIndex++; loadWord(); }, 500);
        }
      });
      tileRow.appendChild(tile);
    });
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    clearInterval(durationTimer);
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
      wrap.remove();
    },
  };
}
