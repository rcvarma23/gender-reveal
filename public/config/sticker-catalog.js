/**
 * PHASE 0 — CONFIG: Sticker Catalog
 * All 13 stickers — 12 earnable + 1 secret reveal sticker
 * Weights are used for weighted random selection (relative, not required to sum to 100)
 */

const STICKER_CATALOG = {

  stickers: [

    // ─── COMMON (total weight: 74) ─────────────────────────
    {
      id:          'balloon',
      emoji:       '🎈',
      name:        'Happy Balloon',
      description: 'Pop! You\'re having a ball!',
      rarity:      'common',
      weight:      22,
      games:       ['balloon-pop', 'feed-baby', 'emoji-match', 'baby-scramble'],
      color:       '#E57373',
    },
    {
      id:          'bottle',
      emoji:       '🍼',
      name:        'Baby Bottle',
      description: 'Feeding time, all the time!',
      rarity:      'common',
      weight:      20,
      games:       ['feed-baby', 'emoji-match'],
      color:       '#90CAF9',
    },
    {
      id:          'star',
      emoji:       '⭐',
      name:        'Shining Star',
      description: 'Every baby is a star!',
      rarity:      'common',
      weight:      18,
      games:       ['all'],
      color:       '#FFD700',
    },
    {
      id:          'teddy',
      emoji:       '🧸',
      name:        'Cuddly Teddy',
      description: 'Squishy and huggable, just like baby!',
      rarity:      'common',
      weight:      14,
      games:       ['all'],
      color:       '#A1887F',
    },

    // ─── UNCOMMON (total weight: 28) ───────────────────────
    {
      id:          'butterfly',
      emoji:       '🦋',
      name:        'Flutter By',
      description: 'Beautiful things are coming!',
      rarity:      'uncommon',
      weight:      10,
      games:       ['emoji-match', 'baby-scramble'],
      color:       '#CE93D8',
    },
    {
      id:          'rainbow',
      emoji:       '🌈',
      name:        'Rainbow Baby',
      description: 'After the rain comes a rainbow!',
      rarity:      'uncommon',
      weight:      8,
      games:       ['all'],
      color:       '#FF8A65',
    },
    {
      id:          'duck',
      emoji:       '🐥',
      name:        'Rubber Ducky',
      description: 'Squeaky clean and adorable!',
      rarity:      'uncommon',
      weight:      6,
      games:       ['feed-baby', 'emoji-match'],
      color:       '#FFF176',
    },
    {
      id:          'flower',
      emoji:       '🌸',
      name:        'Baby Blossom',
      description: 'Blooming with excitement!',
      rarity:      'uncommon',
      weight:      4,
      games:       ['balloon-pop'],
      color:       '#F48FB1',
    },

    // ─── RARE (total weight: 10) ───────────────────────────
    {
      id:          'unicorn',
      emoji:       '🦄',
      name:        'Magic Unicorn',
      description: 'This baby is one of a kind!',
      rarity:      'rare',
      weight:      6,
      games:       ['all'],
      color:       '#B39DDB',
    },
    {
      id:          'crown',
      emoji:       '👑',
      name:        'Royal Baby',
      description: 'All hail the tiny monarch!',
      rarity:      'rare',
      weight:      4,
      games:       ['all'],
      color:       '#FFD700',
    },

    // ─── LEGENDARY (total weight: 2) ──────────────────────
    {
      id:          'diamond',
      emoji:       '💎',
      name:        'Diamond Baby',
      description: 'Rarest of the rare — wow!',
      rarity:      'legendary',
      weight:      1.2,
      games:       ['all'],
      color:       '#80DEEA',
    },
    {
      id:          'crystal',
      emoji:       '🔮',
      name:        'Crystal Ball',
      description: 'The future is bright!',
      rarity:      'legendary',
      weight:      0.8,
      games:       ['all'],
      color:       '#9575CD',
    },

    // ─── SECRET — unlocks at gender reveal ────────────────
    {
      id:          'reveal',
      emoji:       '🎀',
      name:        'The Big Reveal!',
      description: 'You were here for the magic moment!',
      rarity:      'secret',
      weight:      0,           // never randomly awarded — event-triggered only
      games:       [],
      color:       '#C9A84C',
      unlockedBy:  'gender_revealed',
      unlocksAll:  true,        // given to EVERY kid device simultaneously
    },
  ],

  // ─── RARITY CONFIG ──────────────────────────────────────
  rarities: {
    common:    { label: 'Common',    color: '#9E9E9E', glowColor: 'rgba(158,158,158,0.3)' },
    uncommon:  { label: 'Uncommon',  color: '#4CAF50', glowColor: 'rgba(76,175,80,0.4)'  },
    rare:      { label: 'Rare',      color: '#2196F3', glowColor: 'rgba(33,150,243,0.4)' },
    legendary: { label: 'Legendary', color: '#FF9800', glowColor: 'rgba(255,152,0,0.5)'  },
    secret:    { label: 'Secret ✨', color: '#C9A84C', glowColor: 'rgba(201,168,76,0.6)' },
  },

  // ─── HELPER FUNCTIONS ───────────────────────────────────

  /**
   * Pick a random sticker using weighted probability
   * Excludes secret sticker (weight 0)
   */
  pickRandom() {
    const pool = this.stickers.filter(s => s.weight > 0);
    const totalWeight = pool.reduce((sum, s) => sum + s.weight, 0);
    let rand = Math.random() * totalWeight;

    for (const sticker of pool) {
      rand -= sticker.weight;
      if (rand <= 0) return sticker;
    }
    return pool[0]; // fallback
  },

  /**
   * Pick a random sticker appropriate for a specific game
   */
  pickForGame(gameType) {
    const pool = this.stickers.filter(s =>
      s.weight > 0 && (s.games.includes('all') || s.games.includes(gameType))
    );
    const totalWeight = pool.reduce((sum, s) => sum + s.weight, 0);
    let rand = Math.random() * totalWeight;

    for (const sticker of pool) {
      rand -= sticker.weight;
      if (rand <= 0) return sticker;
    }
    return pool[0];
  },

  getById(id) {
    return this.stickers.find(s => s.id === id);
  },

  getRevealSticker() {
    return this.stickers.find(s => s.id === 'reveal');
  },

  getRarityConfig(rarity) {
    return this.rarities[rarity] || this.rarities.common;
  },
};

export default STICKER_CATALOG;
