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
      // No pop target — always runs the full 60s, timer visible, kid pops
      // as many balloons as they want. Spawn tiers: calm for the first
      // 10s, then a noticeable jump in both speed and how many spawn per
      // tick, ramping further from there.
      gameDurationSec: 60,
      spawnTiers: [
        { afterSec: 0,  intervalMs: 1100, count: 1 },  // calm start
        { afterSec: 10, intervalMs: 500,  count: 2 },  // after 10s: lots more balloons
        { afterSec: 20, intervalMs: 420,  count: 2 },
        { afterSec: 30, intervalMs: 350,  count: 3 },
        { afterSec: 40, intervalMs: 300,  count: 3 },
        { afterSec: 50, intervalMs: 260,  count: 3 },
      ],
      balloonSpeedMin: 0.6,
      balloonSpeedMax: 1.2,
      balloonSizePx:   90,
    },

    'feed-baby': {
      // "Does Baby need this?" — Yes/No quiz. answer = the correct choice.
      items: [
        { label: 'Milk',   emoji: '🍼', answer: true  },
        { label: 'Sleep',  emoji: '😴', answer: true  },
        { label: 'Play',   emoji: '🧸', answer: true  },
        { label: 'Bath',   emoji: '🛁', answer: true  },
        { label: 'Coffee', emoji: '☕', answer: false },
        { label: 'Spicy',  emoji: '🌶️', answer: false },
        { label: 'Bike',   emoji: '🚲', answer: false },
      ],
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
      gridCols:        2,
      gridRows:        3,          // 2×3 = 6 cards = 3 pairs
      emojis:          ['🍼','👶','🎈','🧸','🦄','🌟','🐥','🌸'],
      flipBackMs:      900,
      gameDurationSec: 45,
      pointsPerMatch:  100,
      bonusSpeedSec:   20,         // bonus points if finished under 20s
    },

    'baby-scramble': {
      words:           ['BABY','LOVE','CRIB','MILK','BATH','CUTE','SOFT','PINK','BLUE','STAR'],
      wordCount:       5,          // find 5 words per game
      secPerWord:      30,         // 30s countdown per word card — card auto-advances on expiry
      gameDurationSec: 999,        // overall safety cap only; per-word timer is the real gate
      pointsPerWord:   150,
    },
  },

  // ─── TEEN GAMES (10–18) ─────────────────────────────────────
  teen: {
    games: ['baby-trivia', 'baby-scramble-hard', 'emoji-match'],
    canReplay:       false,
    replayLimit:     1,
    getsStickers:    false,
    getsVoucher:     true,
    showTimer:       true,
    minCompleteSecs: 30,
    tapTargetPx:     48,
    cooldownMs:      60 * 1000,

    'baby-trivia': {
      questionCount:   10,
      secPerQuestion:  20,
      pointsCorrect:   100,
      pointsWrong:     0,
      showAnswer:      true,       // reveal correct answer after wrong pick
    },

    'baby-scramble-hard': {
      // sizeBalanced spreads wordCount evenly across small (<=4 letters),
      // medium (5-6) and large (>6) buckets — for 5 words that's 2/2/1.
      words: [
        'CRIB', 'BURP', 'BABY', 'NAPS',                    // small
        'DIAPER', 'RATTLE', 'CRADLE',                      // medium
        'NURSERY', 'STROLLER', 'NEWBORN', 'PACIFIER', 'MATERNITY', // large
      ],
      sizeBalanced:    true,
      wordCount:       5,
      secPerWord:      30,        // 30s countdown per word card — card auto-advances on expiry
      gameDurationSec: 999,       // overall safety cap only; per-word timer is the real gate
      pointsPerWord:   200,
    },

    'emoji-match': {
      gridCols:        3,
      gridRows:        4,          // 3×4 = 12 cards = 6 pairs
      emojis:          ['🍼','👶','🎈','🧸','🦄','🌟'],
      flipBackMs:      700,
      gameDurationSec: 120,
      pointsPerMatch:  100,
      bonusSpeedSec:   40,
    },
  },

  // ─── ADULT GAMES (20+) ──────────────────────────────────────
  adult: {
    // predictions-quiz removed — its questions were merged into the
    // live "Big Guess" event (public/config/big-guess-questions.js);
    // Emoji Match is now the adult's one-turn voucher game.
    games: ['emoji-match'],
    canReplay:       false,
    replayLimit:     1,
    getsStickers:    false,
    getsVoucher:     true,
    showTimer:       true,
    minCompleteSecs: 45,
    tapTargetPx:     52,
    cooldownMs:      60 * 1000,
    // requiresKidFirst removed — any adult who plays is voucher-eligible
    // regardless of whether a kid played on the same device first

    'emoji-match': {
      gridCols:        4,
      gridRows:        4,          // 4×4 = 16 cards = 8 pairs
      emojis:          ['🍼','👶','🎈','🧸','🦄','🌟','🐥','🌸'],
      flipBackMs:      700,
      gameDurationSec: 120,
      pointsPerMatch:  100,
      bonusSpeedSec:   45,
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
