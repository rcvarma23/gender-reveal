/**
 * PHASE 0 — CONFIG: Game Configuration
 * All timing, scoring and difficulty rules per age group
 */

const GAME_CONFIG = {

  // ─── TODDLER GAMES (under 5) ────────────────────────────────
  toddler: {
    games: ['balloon-pop', 'feed-baby'],
    canReplay:       true,
    replayLimit:     Infinity,
    getsStickers:    true,
    getsVoucher:     false,
    showTimer:       false,      // no clock — toddlers can't read it
    minCompleteSecs: 15,
    tapTargetPx:     100,        // huge targets for small fingers

    'balloon-pop': {
      balloonsTotal:   10,
      balloonsToWin:   8,        // pop 8 of 10 to complete
      spawnIntervalMs: 800,
      balloonSpeedMin: 0.4,
      balloonSpeedMax: 0.9,
      balloonSizePx:   90,
      gameDurationSec: 60,
    },

    'feed-baby': {
      foodItems:       6,
      targetFoods:     ['🍼','🍌','🥛'],
      wrongFoods:      ['🌶️','☕'],
      displayTimeSec:  3,
      rounds:          5,
    },
  },

  // ─── KID GAMES (5–10) ───────────────────────────────────────
  kid: {
    games: ['emoji-match', 'baby-scramble'],
    canReplay:       true,
    replayLimit:     Infinity,
    getsStickers:    true,
    getsVoucher:     false,
    showTimer:       true,
    minCompleteSecs: 20,
    tapTargetPx:     64,

    'emoji-match': {
      gridSize:        4,          // 4×4 = 16 cards = 8 pairs
      emojis:          ['🍼','👶','🎈','🧸','🦄','🌟','🐥','🌸'],
      flipBackMs:      900,
      gameDurationSec: 45,
      pointsPerMatch:  100,
      bonusSpeedSec:   20,         // bonus points if finished under 20s
    },

    'baby-scramble': {
      words:           ['BABY','LOVE','CRIB','MILK','BATH','CUTE','SOFT','PINK','BLUE','STAR'],
      wordCount:       3,          // show 3 words per game
      gameDurationSec: 45,
      pointsPerWord:   150,
    },
  },

  // ─── TEEN GAMES (10–18) ─────────────────────────────────────
  teen: {
    games: ['baby-trivia', 'baby-scramble-hard'],
    canReplay:       false,
    replayLimit:     1,
    getsStickers:    false,
    getsVoucher:     true,
    showTimer:       true,
    minCompleteSecs: 30,
    tapTargetPx:     48,
    cooldownMs:      5 * 60 * 1000,

    'baby-trivia': {
      questionCount:   10,
      secPerQuestion:  20,
      pointsCorrect:   100,
      pointsWrong:     0,
      showAnswer:      true,       // reveal correct answer after wrong pick
    },

    'baby-scramble-hard': {
      words:           ['LULLABY','NURSERY','STROLLER','NEWBORN','PACIFIER','MATERNITY'],
      wordCount:       4,
      gameDurationSec: 60,
      pointsPerWord:   200,
    },
  },

  // ─── ADULT GAMES (20+) ──────────────────────────────────────
  adult: {
    games: ['predictions-quiz'],
    canReplay:       false,
    replayLimit:     1,
    getsStickers:    false,
    getsVoucher:     true,
    showTimer:       true,
    minCompleteSecs: 45,
    tapTargetPx:     52,
    cooldownMs:      3 * 60 * 1000,
    requiresKidFirst: true,       // kid must play on same device first

    'predictions-quiz': {
      questionCount:   8,
      secPerQuestion:  30,
      categories:      ['Cravings','Old Wives Tales','Baby Stats','Parent Instinct'],
      pointsCorrect:   125,
      bonusStreak:     50,        // extra 50 pts per consecutive correct
    },
  },

  // ─── COUPLE FINALE ──────────────────────────────────────────
  couple: {
    games: ['letter-puzzle'],
    minLettersToUnlock: 7,        // need 7/10 letters minimum
    maxAttempts:        3,        // attempt 3 ALWAYS triggers video
    videoUnlocksOn:     3,

    'letter-puzzle': {
      attempt1: {
        durationSec:  60,
        hintsShown:   0,
      },
      attempt2: {
        durationSec:  75,
        hintsShown:   2,          // show 2 letters in correct position
      },
      attempt3: {
        durationSec:  999,        // unlimited — always completes
        hintsShown:   10,         // all letters shown — guaranteed win
        autoComplete: true,       // if they still fail, auto-complete
      },
    },
  },

};

Object.freeze(GAME_CONFIG);
export default GAME_CONFIG;
