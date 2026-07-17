/**
 * GENDER REVEAL PARTY — MASTER CONFIGURATION
 * Edit this file before the party. Keep it secret!
 */

const PARTY_CONFIG = {

  // ─── PARTY DETAILS ──────────────────────────────────────────
  partyName:      "Baby Reveal Party",
  familyName:     "Our Family",           // shown on waiting screen
  partyDate:      "2026-07-25",           // ISO format
  partyLocation:  "Atlanta, GA",

  // ─── SECRET CODE ────────────────────────────────────────────
  // 10 letters, 2-3 words, does NOT directly say gender
  // Winners will collectively reveal these letters
  secretCode:     ["B","A","B","Y","L","O","V","E","I","S"],
  secretWords:    "BABY LOVE IS",         // admin reference only
  lettersNeeded:  7,                      // min to unlock couple game

  // ─── PINS (change before party!) ────────────────────────────
  adminPinHash:   "",   // set via wrangler secret (SHA-256 of your PIN)
  couplePinHash:  "",   // set via wrangler secret

  // ─── VOUCHER RULES ──────────────────────────────────────────
  totalVouchers:        10,    // exactly 10 winners
  vouchersPerDevice:    1,     // max vouchers one device can win
  minPlayersBeforeDraw: 20,    // minimum pool before draw allowed

  // ─── TIMING RULES ───────────────────────────────────────────
  cooldowns: {
    adult:    60 * 1000,       // 60s between adult sessions
    teen:     60 * 1000,       // 60s between teen sessions
    kid:      0,               // no cooldown for kids
    toddler:  0,
  },

  sessionExpiry: {
    toddler:  2 * 60 * 60 * 1000,   // 2 hours
    kid:      2 * 60 * 60 * 1000,
    teen:     1 * 60 * 60 * 1000,   // 1 hour
    adult:    90 * 60 * 1000,       // 90 mins
    couple:   0,                     // never expires
  },

  // ─── SPEED VALIDATION ───────────────────────────────────────
  // Minimum seconds to complete a game (anti-cheat)
  minGameSeconds: {
    toddler:  15,
    kid:      20,
    teen:     30,
    adult:    45,
  },

  // ─── POLLING INTERVALS ──────────────────────────────────────
  partyStatePollMs:  10_000,   // guests check state every 10s
  adminStatsPollMs:   5_000,   // admin refreshes stats every 5s

  // ─── AGE GROUPS ─────────────────────────────────────────────
  ageGroups: {
    toddler: { label: "Little One 🍼",  min: 0,  max: 5,  getsStickers: true,  getsVoucher: false },
    kid:     { label: "Kid 🎈",         min: 5,  max: 10, getsStickers: true,  getsVoucher: false },
    teen:    { label: "Teen 🎮",        min: 10, max: 18, getsStickers: false, getsVoucher: true  },
    adult:   { label: "Adult 🎉",       min: 18, max: 99, getsStickers: false, getsVoucher: true  },
  },

  // ─── STICKER CATALOG ────────────────────────────────────────
  stickers: [
    { id:"balloon",  emoji:"🎈", name:"Happy Balloon",   rarity:"common",    weight:25 },
    { id:"bottle",   emoji:"🍼", name:"Baby Bottle",     rarity:"common",    weight:20 },
    { id:"star",     emoji:"⭐", name:"Shining Star",    rarity:"common",    weight:20 },
    { id:"music",    emoji:"🎵", name:"Lullaby Note",    rarity:"common",    weight:15 },
    { id:"flower",   emoji:"🌸", name:"Baby Blossom",    rarity:"uncommon",  weight:8  },
    { id:"rainbow",  emoji:"🌈", name:"Rainbow Baby",    rarity:"uncommon",  weight:5  },
    { id:"butterfly",emoji:"🦋", name:"Flutter By",      rarity:"uncommon",  weight:4  },
    { id:"duck",     emoji:"🐥", name:"Rubber Ducky",    rarity:"uncommon",  weight:3  },
    { id:"unicorn",  emoji:"🦄", name:"Magic Unicorn",   rarity:"rare",      weight:2  },
    { id:"crown",    emoji:"👑", name:"Royal Baby",      rarity:"rare",      weight:1  },
    { id:"diamond",  emoji:"💎", name:"Diamond Baby",    rarity:"legendary", weight:0.8},
    { id:"crystal",  emoji:"🔮", name:"Crystal Ball",    rarity:"legendary", weight:0.2},
    { id:"reveal",   emoji:"🎀", name:"The Big Reveal!", rarity:"secret",    weight:0  }, // unlocks at reveal
  ],

};

// Freeze config — no accidental mutations
Object.freeze(PARTY_CONFIG);

export default PARTY_CONFIG;
