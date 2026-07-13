/**
 * GAME — Baby Trivia (teen)
 * Multiple-choice questions, one at a time, each with its own countdown.
 * Completes after questionCount answered (or time runs out on each).
 */

const QUESTION_BANK = [
  { q: 'How many bones does a newborn baby have (before some fuse together)?', choices: ['206', 'About 300', '150', '450'], correct: 1 },
  { q: 'How many weeks is a full-term human pregnancy?', choices: ['32 weeks', '36 weeks', '40 weeks', '44 weeks'], correct: 2 },
  { q: 'What is the soft spot on a baby\'s head called?', choices: ['Fontanelle', 'Cranium gap', 'Suture line', 'Molera only'], correct: 0 },
  { q: 'By about what age do most babies double their birth weight?', choices: ['1 month', '5-6 months', '12 months', '18 months'], correct: 1 },
  { q: 'What is a newborn\'s first bowel movement called?', choices: ['Colostrum', 'Meconium', 'Vernix', 'Lanugo'], correct: 1 },
  { q: 'About how many hours a day do most newborns sleep?', choices: ['8-9 hours', '12-13 hours', '16-17 hours', '20-22 hours'], correct: 2 },
  { q: 'What vitamin is commonly given to newborns via injection right after birth?', choices: ['Vitamin C', 'Vitamin D', 'Vitamin K', 'Vitamin B12'], correct: 2 },
  { q: 'What\'s the medical term for the common yellowish newborn skin tone?', choices: ['Jaundice', 'Eczema', 'Cyanosis', 'Erythema'], correct: 0 },
  { q: 'What is the waxy coating that protects a baby\'s skin in the womb called?', choices: ['Lanugo', 'Vernix', 'Meconium', 'Amnion'], correct: 1 },
  { q: 'What reflex makes a newborn grip a finger placed in their palm?', choices: ['Moro reflex', 'Rooting reflex', 'Palmar grasp reflex', 'Babinski reflex'], correct: 2 },
  { q: 'About how many diapers does a newborn typically go through per day?', choices: ['2-3', '5-6', '10 or more', '1'], correct: 2 },
  { q: 'What is the fine, soft hair sometimes covering a newborn\'s body called?', choices: ['Lanugo', 'Vernix', 'Down', 'Peach fuzz only'], correct: 0 },
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
  let locked = false;
  let ended = false;
  let tickTimer = null;
  let secLeft = 0;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;padding:1.25rem;box-sizing:border-box;gap:1rem;';

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;justify-content:space-between;font-size:.8rem;color:var(--text-muted);';

  const progressLabel = document.createElement('span');
  const timerLabel = document.createElement('span');
  topRow.appendChild(progressLabel);
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
    progressLabel.textContent = `Question ${qIndex + 1} / ${questions.length}`;
    questionEl.textContent = question.q;
    choicesEl.innerHTML = '';

    shuffle(question.choices.map((text, i) => ({ text, isCorrect: i === question.correct })))
      .forEach((choice) => {
        const btn = document.createElement('button');
        btn.textContent = choice.text;
        btn.style.cssText = `
          padding:.85rem 1rem; border-radius:var(--radius-md,12px);
          border:1.5px solid rgba(255,255,255,.15); background:var(--navy-mid,#2a2660);
          color:var(--text-primary); font-size:.95rem; text-align:left; cursor:pointer;
        `;
        btn.addEventListener('click', () => handleAnswer(btn, choice.isCorrect));
        choicesEl.appendChild(btn);
      });

    secLeft = config.secPerQuestion;
    timerLabel.textContent = `⏱ ${secLeft}s`;
    clearTick();
    tickTimer = setInterval(() => {
      secLeft--;
      timerLabel.textContent = `⏱ ${Math.max(0, secLeft)}s`;
      if (secLeft <= 0) handleAnswer(null, false);
    }, 1000);
  };

  const handleAnswer = (btnEl, isCorrect) => {
    if (ended || locked) return;
    locked = true;
    clearTick();

    if (isCorrect) score += config.pointsCorrect;
    else score += config.pointsWrong;

    if (config.showAnswer) {
      [...choicesEl.children].forEach((btn, i) => {
        btn.disabled = true;
        if (btn === btnEl) btn.style.borderColor = isCorrect ? 'var(--gold-bright,#FFD700)' : '#E57373';
      });
    }

    callbacks.onProgress(Math.round(((qIndex + 1) / questions.length) * 100));

    qIndex++;
    setTimeout(loadQuestion, config.showAnswer ? 700 : 200);
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
