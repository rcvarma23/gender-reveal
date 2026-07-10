/**
 * CLOUDFLARE WORKER W4 — Sticker System
 * Routes:
 *   POST /api/sticker/earn          → award a weighted-random sticker to a kid session
 *   GET  /api/sticker/collection    → list all stickers earned by this device
 *   POST /api/sticker/unlock-reveal → append the secret reveal sticker (idempotent)
 */

const STICKER_CATALOG = [
  { id: 'balloon',   emoji: '🎈', name: 'Happy Balloon',   rarity: 'common',    weight: 22,  games: ['balloon-pop', 'feed-baby', 'emoji-match', 'baby-scramble'], color: '#E57373' },
  { id: 'bottle',    emoji: '🍼', name: 'Baby Bottle',     rarity: 'common',    weight: 20,  games: ['feed-baby', 'emoji-match'],                                  color: '#90CAF9' },
  { id: 'star',      emoji: '⭐', name: 'Shining Star',    rarity: 'common',    weight: 18,  games: ['all'],                                                        color: '#FFD700' },
  { id: 'butterfly', emoji: '🦋', name: 'Flutter By',      rarity: 'uncommon',  weight: 10,  games: ['emoji-match', 'baby-scramble'],                              color: '#CE93D8' },
  { id: 'rainbow',   emoji: '🌈', name: 'Rainbow Baby',    rarity: 'uncommon',  weight: 8,   games: ['all'],                                                        color: '#FF8A65' },
  { id: 'duck',      emoji: '🐥', name: 'Rubber Ducky',    rarity: 'uncommon',  weight: 6,   games: ['feed-baby', 'emoji-match'],                                  color: '#FFF176' },
  { id: 'flower',    emoji: '🌸', name: 'Baby Blossom',    rarity: 'uncommon',  weight: 4,   games: ['balloon-pop'],                                                color: '#F48FB1' },
  { id: 'unicorn',   emoji: '🦄', name: 'Magic Unicorn',   rarity: 'rare',      weight: 6,   games: ['all'],                                                        color: '#B39DDB' },
  { id: 'crown',     emoji: '👑', name: 'Royal Baby',      rarity: 'rare',      weight: 4,   games: ['all'],                                                        color: '#FFD700' },
  { id: 'diamond',   emoji: '💎', name: 'Diamond Baby',    rarity: 'legendary', weight: 1.2, games: ['all'],                                                        color: '#80DEEA' },
  { id: 'crystal',   emoji: '🔮', name: 'Crystal Ball',    rarity: 'legendary', weight: 0.8, games: ['all'],                                                        color: '#9575CD' },
];

const REVEAL_STICKER = { id: 'reveal', emoji: '🎀', name: 'The Big Reveal!', rarity: 'secret', color: '#C9A84C' };

function pickForGame(gameType) {
  const pool = STICKER_CATALOG.filter(s => s.games.includes('all') || s.games.includes(gameType));
  const totalWeight = pool.reduce((sum, s) => sum + s.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const sticker of pool) {
    rand -= sticker.weight;
    if (rand <= 0) return sticker;
  }
  return pool[0];
}

export default {
  async fetch(request, env) {

    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    const cors = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id, X-Fingerprint, X-Is-Mobile',
    };

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const json  = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json', ...cors },
      });
    const error = (msg, status = 400) => json({ success: false, error: msg }, status);

    const deviceId = request.headers.get('X-Device-Id');
    if (!deviceId) return error('Missing device ID', 401);

    // ── POST /api/sticker/earn ───────────────────────────────
    if (method === 'POST' && path === '/api/sticker/earn') {
      const body = await request.json().catch(() => ({}));
      const { sessionId, gameType } = body;
      if (!sessionId || !gameType) return error('Missing sessionId or gameType');

      const sessionData = await env.GR_KV.get(`session_${sessionId}`, { type: 'json' });
      if (!sessionData) return error('Session not found', 404);
      if (sessionData.isKid !== true) return error('Session is not eligible for stickers', 403);

      const sticker = { ...pickForGame(gameType), earnedAt: Date.now() };

      const stickersKey = `stickers_${deviceId}`;
      const existing     = await env.GR_KV.get(stickersKey, { type: 'json' }) || [];
      existing.push(sticker);
      await env.GR_KV.put(stickersKey, JSON.stringify(existing));

      return json({ success: true, sticker });
    }

    // ── GET /api/sticker/collection ──────────────────────────
    if (method === 'GET' && path === '/api/sticker/collection') {
      const stickers = await env.GR_KV.get(`stickers_${deviceId}`, { type: 'json' }) || [];
      const hasReveal = stickers.some(s => s.id === 'reveal');
      return json({ success: true, stickers, hasReveal });
    }

    // ── POST /api/sticker/unlock-reveal ──────────────────────
    if (method === 'POST' && path === '/api/sticker/unlock-reveal') {
      const body = await request.json().catch(() => ({}));
      const stickersKey = `stickers_${deviceId}`;
      const existing     = await env.GR_KV.get(stickersKey, { type: 'json' }) || [];

      if (existing.some(s => s.id === 'reveal')) {
        return json({ success: true, sticker: existing.find(s => s.id === 'reveal'), alreadyUnlocked: true });
      }

      const sticker = { ...REVEAL_STICKER, earnedAt: Date.now(), gender: body.gender || null };
      existing.push(sticker);
      await env.GR_KV.put(stickersKey, JSON.stringify(existing));

      return json({ success: true, sticker });
    }

    return error('Not found', 404);
  },
};