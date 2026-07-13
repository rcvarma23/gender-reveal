/**
 * GAME — Predictions Quiz (adult)
 * Fun opinion questions about the baby/pregnancy — there's no "wrong"
 * answer here (nobody knows yet!), so every answered question scores
 * pointsCorrect, with a small bonusStreak for answering quickly in a
 * row. Completes after questionCount answered (or time runs out).
 */

const QUESTION_BANK = [
  { category: 'Cravings', q: 'What do you think Mom craved most this pregnancy?', choices: ['Sweet', 'Salty', 'Spicy', 'All of the above'] },
  { category: 'Old Wives Tales', q: 'Carrying high vs. low is supposed to predict the gender. What do you think it actually means?', choices: ["It's a boy", "It's a girl", 'Just an old wives\' tale', 'Depends on the mom\'s body'] },
  { category: 'Baby Stats', q: "Guess the baby's birth weight range.", choices: ['Under 6 lbs', '6-7 lbs', '7-8 lbs', 'Over 8 lbs'] },
  { category: 'Parent Instinct', q: 'Who do you think caves first on strict parenting rules?', choices: ['Mom', 'Dad', 'The grandparents', 'Everyone, immediately'] },
  { category: 'Old Wives Tales', q: 'Bad heartburn during pregnancy supposedly means the baby will have...', choices: ['Lots of hair', 'No hair at all', 'Curly hair', "It's just an old wives' tale"] },
  { category: 'Cravings', q: "A sweet tooth during pregnancy is an old wives' sign of...", choices: ['A girl', 'A boy', 'Nothing really', 'Just good taste'] },
  { category: 'Baby Stats', q: 'Will the baby arrive...', choices: ['Early', 'Right on the due date', 'Late', 'Whenever they feel like it'] },
  { category: 'Parent Instinct', q: 'Which parent do you think loses the most sleep in month one?', choices: ['Mom', 'Dad', 'Split evenly', 'Depends on the night'] },
];

// Fisher-Yates — Array.sort(() => Math.random() - 0.5) uses an
// inconsistent comparator, which some engines' sort implementations can
// respond to by dropping or duplicating elements.
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function createGame(container, config, callbacks) {

  const questions = shuffle(QUESTION_BANK).slice(0, config.questionCount);
  let qIndex = 0;
  let score = 0;
  let streak = 0;
  let locked = false;
  let ended = false;
  let tickTimer = null;
  let secLeft = 0;
  const fastAnswerThreshold = () => config.secPerQuestion / 2;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;padding:1.25rem;box-sizing:border-box;gap:1rem;';

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;justify-content:space-between;font-size:.8rem;color:var(--text-muted);';
  const categoryLabel = document.createElement('span');
  const timerLabel = document.createElement('span');
  topRow.appendChild(categoryLabel);
  topRow.appendChild(timerLabel);

  const questionEl = document.createElement('div');
  questionEl.style.cssText = 'font-size:1.1rem;font-weight:600;color:var(--text-primary);min-height:3.5rem;';

  const choicesEl = document.createElement('div');
  choicesEl.style.cssText = 'display:flex;flex-direction:column;gap:.65rem;';

  wrap.appendChild(topRow);
  wrap.appendChild(questionEl);
  wrap.appendChild(choicesEl);
  container.appendChild(wrap);

  const clearTick = () => { if (tickTimer) clearInterval(tickTimer); tickTimer = null; };

  const loadQuestion = () => {
    if (qIndex >= questions.length) return finish();

    locked = false;
    const question = questions[qIndex];
    categoryLabel.textContent = `${question.category} · ${qIndex + 1} / ${questions.length}`;
    questionEl.textContent = question.q;
    choicesEl.innerHTML = '';

    shuffle(question.choices).forEach((text) => {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.style.cssText = `
        padding:.85rem 1rem; border-radius:var(--radius-md,12px);
        border:1.5px solid rgba(255,255,255,.15); background:var(--navy-mid,#2a2660);
        color:var(--text-primary); font-size:.95rem; text-align:left; cursor:pointer;
      `;
      btn.addEventListener('click', () => handleAnswer(btn));
      choicesEl.appendChild(btn);
    });

    secLeft = config.secPerQuestion;
    timerLabel.textContent = `⏱ ${secLeft}s`;
    clearTick();
    tickTimer = setInterval(() => {
      secLeft--;
      timerLabel.textContent = `⏱ ${Math.max(0, secLeft)}s`;
      if (secLeft <= 0) handleAnswer(null);
    }, 1000);
  };

  const handleAnswer = (btnEl) => {
    if (ended || locked) return;
    locked = true;
    const answeredFast = secLeft >= fastAnswerThreshold();
    clearTick();

    if (btnEl) {
      score += config.pointsCorrect;
      if (answeredFast) { streak++; score += streak > 1 ? config.bonusStreak : 0; }
      else streak = 0;
      [...choicesEl.children].forEach((btn) => {
        btn.disabled = true;
        if (btn === btnEl) btn.style.borderColor = 'var(--gold-bright,#FFD700)';
      });
    } else {
      streak = 0; // timed out — no points, no penalty either
    }

    callbacks.onProgress(Math.round(((qIndex + 1) / questions.length) * 100));

    qIndex++;
    setTimeout(loadQuestion, btnEl ? 350 : 100);
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    clearTick();
    callbacks.onComplete(score);
  };

  return {
    start() { loadQuestion(); },
    destroy() {
      ended = true;
      clearTick();
      wrap.remove();
    },
  };
}
