/**
 * GAME — Feed the Baby (toddler)
 * "Does Baby need this?" quiz — one item per round, tap Yes or No.
 * Always completes after every item in config.items has been answered.
 */

// Fisher-Yates — see baby-scramble.js for why Array.sort(() => Math.random()-0.5)
// is avoided here.
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function createGame(container, config, callbacks) {

  const items = shuffle(config.items);
  let index = 0;
  let correct = 0;
  let ended = false;
  let locked = false;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1.5rem;padding:1rem;text-align:center;';

  const promptEl = document.createElement('div');
  promptEl.style.cssText = 'font-size:1.1rem;color:var(--text-primary,#F0EAF8);font-weight:600;';
  promptEl.textContent = 'Does Baby need this?';

  const emojiEl = document.createElement('div');
  emojiEl.style.cssText = 'font-size:5rem;';

  const labelEl = document.createElement('div');
  labelEl.style.cssText = 'font-size:1.3rem;color:var(--gold-soft,#C9A84C);font-weight:700;';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:1.25rem;';

  const makeBtn = (text, bg) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.style.cssText = `
      font-size:1.4rem; font-weight:700; min-width:100px; min-height:100px;
      border-radius: var(--radius-lg, 20px); border:none; cursor:pointer;
      background:${bg}; color:#0D0B1E;
    `;
    return btn;
  };

  const yesBtn = makeBtn('Yes 👍', '#7ED957');
  const noBtn  = makeBtn('No 👎', '#FF6B6B');

  btnRow.appendChild(yesBtn);
  btnRow.appendChild(noBtn);

  wrap.appendChild(promptEl);
  wrap.appendChild(emojiEl);
  wrap.appendChild(labelEl);
  wrap.appendChild(btnRow);
  container.appendChild(wrap);

  const loadItem = () => {
    if (index >= items.length) return finish();
    locked = false;
    const item = items[index];
    emojiEl.textContent = item.emoji;
    labelEl.textContent = item.label;
  };

  const onAnswer = (isYes) => {
    if (ended || locked) return;
    locked = true;
    const item = items[index];
    if (isYes === item.answer) correct++;
    index++;
    callbacks.onProgress(Math.round((index / items.length) * 100));
    setTimeout(loadItem, 300);
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    callbacks.onComplete(correct);
  };

  const onYes = () => onAnswer(true);
  const onNo  = () => onAnswer(false);
  yesBtn.addEventListener('click', onYes);
  noBtn.addEventListener('click', onNo);

  return {
    start() { loadItem(); },
    destroy() {
      ended = true;
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      wrap.remove();
    },
  };
}
