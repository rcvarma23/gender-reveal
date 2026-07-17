/**
 * "THE BIG GUESS" — QUESTION BANK
 * This is the ONLY file you need to edit to change what's asked during
 * the live Big Guess event. No other code needs to change.
 *
 * HOW TO EDIT — no coding knowledge required:
 *   - To ADD a question: copy one whole `{ ... },` block below and paste
 *     it anywhere in the list, then change the text inside the quotes.
 *   - To REMOVE a question: delete its whole `{ ... },` block.
 *   - `q` is the question text.
 *   - `choices` is the list of answers guests can pick — 2, 3, or 4 is
 *     fine, just keep each one short so it fits on a phone screen.
 *   - Keep the quotes ('...') and commas exactly as shown, or the file
 *     will break. When in doubt, copy an existing block exactly and
 *     just swap the words.
 *
 * Order here is the order questions are asked in. Each question runs
 * for 30 seconds of guessing + 10 seconds of showing results, then
 * automatically moves to the next one (see workers/poll-engine.js).
 */

const BIG_GUESS_QUESTIONS = [

  // ── Gender & name guesses ──────────────────────────────────
  { q: 'What do you think the baby will be?', choices: ['Boy', 'Girl'] },
  { q: "If it's a boy, his name will...", choices: ['End with "Ansh"', 'Be something else'] },
  { q: "If it's a girl, her name will...", choices: ['End with "Anshi"', 'Be something else'] },

  // ── Birth timing/weight guesses ──────────────────────────────
  { q: 'Will the baby arrive...', choices: ['Early', 'Right on the due date', 'Late', 'Whenever they feel like it'] },
  { q: "Guess the baby's birth weight.", choices: ['Under 6 lbs', '6–7 lbs', '7–8 lbs', 'Over 8 lbs'] },

  // ── About Satish & Sanjana ───────────────────────────────────
  { q: 'Who will be more tense on delivery day?', choices: ['Satish', 'Sanjana', 'Neither — N/A'] },
  { q: 'How soon will Satish get back to playing pickleball after the baby arrives?', choices: ['Within 15 days', 'After 1 month'] },
  { q: 'Who will cave first on strict parenting rules?', choices: ['Satish', 'Sanjana', 'None'] },
  { q: 'Who will lose the most sleep in month one?', choices: ['Sanjana', 'Satish', 'Split evenly', 'Depends on the night'] },
  { q: 'What did Sanjana crave most this pregnancy?', choices: ['Sweet', 'Salty', 'Spicy', 'All of the above'] },

  // ── Old wives' tale (just for fun — nobody actually knows!) ──
  { q: "Carrying high vs. low is supposed to predict the gender — what do you think it actually means?", choices: ["It's a boy", "It's a girl", "Just an old wives' tale"] },

  // ── Simple guesses ───────────────────────────────────────────
  { q: "How long will Sanjana be in labor?", choices: ['Under 6 hours', '6–12 hours', '12–24 hours', 'Over 24 hours'] },
  { q: 'Who will the baby look more like at birth?', choices: ['Satish', 'Sanjana', 'Both equally', "Too early to tell"] },

];

export default BIG_GUESS_QUESTIONS;
