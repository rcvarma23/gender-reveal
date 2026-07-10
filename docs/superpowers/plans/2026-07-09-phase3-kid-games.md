# Phase 3: Kid Games, Sticker System, W4 Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the toddler and kid game experiences (4 mini-games), the sticker-earning Worker (W4), and the sticker collection page, per `docs/superpowers/specs/2026-07-09-phase3-kid-games-design.md`.

**Architecture:** A Cloudflare Worker (`workers/sticker-system.js`) owns sticker awarding/storage in KV. Each mini-game is an isolated ES module (`public/js/games/*.js`) with a `createGame(container, config, callbacks)` factory that only computes a score and never touches the network. Two host pages (`game-toddler.html`, `game-kid.html`) own session/API/sticker wiring and mount whichever game the player picks. A collection page (`sticker-book.html`) renders all 13 catalog entries against the device's earned set.

**Tech Stack:** Vanilla JS (ES modules), Cloudflare Workers + KV, no build step, no test framework. This project has no git repository and no automated test suite — verification is manual (`wrangler dev` + browser), per the existing codebase convention. Task steps replace "write failing test / commit" with "write manual verification / confirm output" accordingly.

## Global Constraints

- No frameworks — vanilla HTML/CSS/JS + ES modules only (`CLAUDE.md` Coding Conventions #1).
- Mobile first, 375px baseline (`CLAUDE.md` #3).
- Tap targets: 100×100px toddler, 64×64px kid (`CLAUDE.md` #4, `GAME_CONFIG.toddler.tapTargetPx` / `GAME_CONFIG.kid.tapTargetPx`).
- GPU-only animations — `transform`/`opacity` only, never `width/height/top/left` (`CLAUDE.md` #5).
- Server-side enforcement — the Worker must re-validate `isKid` itself, never trust the client (`CLAUDE.md` #6).
- Reduced motion respected — `Confetti` already checks `prefers-reduced-motion` internally; no extra work needed to satisfy this.
- No external dependencies in the frontend (`CLAUDE.md` #10).
- Pink/blue reserved for the gender reveal only — none of this phase's UI may use `--pink` or `--blue-reveal`.
- All KV values are JSON strings — always `JSON.stringify` on write and `{ type: 'json' }` on read, matching every existing worker.

---

### Task 1: W4 Worker — `workers/sticker-system.js`

**Files:**
- Modify: `workers/sticker-system.js` (currently a 3-line stub returning `{stickers:[]}`)

**Interfaces:**
- Produces: `POST /api/sticker/earn` → `{ success: true, sticker: { id, emoji, name, rarity, color, earnedAt } }`
- Produces: `GET /api/sticker/collection` → `{ success: true, stickers: [...], hasReveal: bool }`
- Produces: `POST /api/sticker/unlock-reveal` → `{ success: true, sticker }` (idempotent)
- Consumes: KV key `session_{sessionId}` (written by `session-manager.js`, shape includes `isKid: bool`, `deviceId`)
- Consumes: `X-Device-Id` header (required on every route, same as `session-manager.js`)

- [ ] **Step 1: Replace the stub with the full worker implementation**

```js
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
      const body = await request.json();
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
```

- [ ] **Step 2: Manual verification with `wrangler dev`**

Run: `npx wrangler dev workers/sticker-system.js --local`

In a second terminal, create a fake kid session directly in local KV isn't
straightforward without the full app running, so verify via the actual
flow once Task 4 (game-toddler.html) is done. For now, confirm the Worker
at least boots and rejects malformed requests:

```bash
curl -s -X POST http://localhost:8787/api/sticker/earn \
  -H "X-Device-Id: test-device" -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"success":false,"error":"Missing sessionId or gameType"}`

```bash
curl -s http://localhost:8787/api/sticker/collection -H "X-Device-Id: test-device"
```

Expected: `{"success":true,"stickers":[],"hasReveal":false}`

Stop the dev server (Ctrl+C) once both responses match.

---

### Task 2: `public/js/games/balloon-pop.js`

**Files:**
- Create: `public/js/games/balloon-pop.js`

**Interfaces:**
- Produces: `export default function createGame(container, config, callbacks)` → `{ start(), destroy() }`
- Consumes: `config` shape from `GAME_CONFIG.toddler['balloon-pop']`: `{ balloonsTotal, balloonsToWin, spawnIntervalMs, balloonSpeedMin, balloonSpeedMax, balloonSizePx, gameDurationSec }`
- Consumes: `callbacks.onProgress(pct)`, `callbacks.onComplete(score)`

- [ ] **Step 1: Write the module**

```js
/**
 * GAME — Balloon Pop (toddler)
 * Tap floating balloons before they drift off-screen.
 * Completes at balloonsToWin popped OR gameDurationSec elapsed.
 */

export default function createGame(container, config, callbacks) {

  const EMOJIS = ['🎈', '🎈', '🎈', '🎈'];
  let popped = 0;
  let spawnTimer = null;
  let durationTimer = null;
  let elapsed = 0;
  let ended = false;
  const balloons = new Set();

  const stageEl = document.createElement('div');
  stageEl.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';
  container.appendChild(stageEl);

  const spawnBalloon = () => {
    if (ended) return;
    const el = document.createElement('button');
    el.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    el.setAttribute('aria-label', 'Pop the balloon');
    const size = config.balloonSizePx;
    const speed = config.balloonSpeedMin + Math.random() * (config.balloonSpeedMax - config.balloonSpeedMin);
    el.style.cssText = `
      position:absolute; left:${Math.random() * 85}%; bottom:-${size}px;
      width:${size}px; height:${size}px; font-size:${size * 0.7}px;
      background:transparent; border:none; cursor:pointer;
      transition: transform ${8 / speed}s linear;
      -webkit-tap-highlight-color: transparent;
    `;
    stageEl.appendChild(el);
    balloons.add(el);

    requestAnimationFrame(() => {
      el.style.transform = `translateY(-${window.innerHeight + size}px)`;
    });

    const cleanup = () => {
      el.remove();
      balloons.delete(el);
    };
    el.addEventListener('transitionend', cleanup);
    el.addEventListener('click', () => {
      if (ended) return;
      popped++;
      cleanup();
      callbacks.onProgress(Math.min(100, Math.round((popped / config.balloonsToWin) * 100)));
      if (popped >= config.balloonsToWin) finish();
    });
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    clearInterval(spawnTimer);
    clearInterval(durationTimer);
    callbacks.onComplete(popped);
  };

  return {
    start() {
      spawnTimer = setInterval(spawnBalloon, config.spawnIntervalMs);
      durationTimer = setInterval(() => {
        elapsed++;
        if (elapsed >= config.gameDurationSec) finish();
      }, 1000);
      spawnBalloon();
    },
    destroy() {
      ended = true;
      clearInterval(spawnTimer);
      clearInterval(durationTimer);
      balloons.forEach(el => el.remove());
      stageEl.remove();
    },
  };
}
```

- [ ] **Step 2: Manual verification**

Create a scratch HTML file to mount it in isolation:

```bash
cat > "C:/Users/ramcv/AppData/Local/Temp/claude/C--Geneder-Reveal-gender-reveal/73276d9a-7379-4c44-9983-44983aa90448/scratchpad/test-balloon.html" << 'EOF'
<!DOCTYPE html><html><body>
<div id="stage" style="width:375px;height:600px;border:1px solid #333;position:relative"></div>
<script type="module">
  import createGame from '../../../../../../../../Geneder_Reveal/gender-reveal/public/js/games/balloon-pop.js';
  const game = createGame(document.getElementById('stage'),
    { balloonsTotal:10, balloonsToWin:2, spawnIntervalMs:400, balloonSpeedMin:0.4, balloonSpeedMax:0.9, balloonSizePx:90, gameDurationSec:60 },
    { onProgress: p => console.log('progress', p), onComplete: s => alert('complete! score=' + s) });
  game.start();
</script>
</body></html>
EOF
```

Open the file in a browser, click 2 balloons, confirm the `alert('complete! score=2')` fires. Delete the scratch file afterward.

---

### Task 3: `public/js/games/feed-baby.js`

**Files:**
- Create: `public/js/games/feed-baby.js`

**Interfaces:**
- Produces: `export default function createGame(container, config, callbacks)` → `{ start(), destroy() }`
- Consumes: `config` shape from `GAME_CONFIG.toddler['feed-baby']`: `{ foodItems, targetFoods, wrongFoods, displayTimeSec, rounds }`
- Consumes: `callbacks.onProgress(pct)`, `callbacks.onComplete(score)`

- [ ] **Step 1: Write the module**

```js
/**
 * GAME — Feed the Baby (toddler)
 * One food emoji per round. Tap the big "feed" button.
 * Correct = target food, wrong = distractor. Always completes after `rounds`.
 */

export default function createGame(container, config, callbacks) {

  let round = 0;
  let correct = 0;
  let roundTimer = null;
  let ended = false;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1.5rem;';

  const foodDisplay = document.createElement('div');
  foodDisplay.style.cssText = 'font-size:5rem;';

  const feedBtn = document.createElement('button');
  feedBtn.textContent = '👶 Feed!';
  feedBtn.style.cssText = 'font-size:1.5rem;padding:1.5rem 2rem;border-radius:9999px;border:none;cursor:pointer;background:#C9A84C;color:#0D0B1E;';

  wrap.appendChild(foodDisplay);
  wrap.appendChild(feedBtn);
  container.appendChild(wrap);

  const allFoods = [...config.targetFoods, ...config.wrongFoods];
  let currentFood = null;

  const nextRound = () => {
    if (round >= config.rounds) return finish();
    currentFood = allFoods[Math.floor(Math.random() * allFoods.length)];
    foodDisplay.textContent = currentFood;
    clearTimeout(roundTimer);
    roundTimer = setTimeout(() => {
      round++;
      callbacks.onProgress(Math.round((round / config.rounds) * 100));
      nextRound();
    }, config.displayTimeSec * 1000);
  };

  const onFeed = () => {
    if (ended || !currentFood) return;
    if (config.targetFoods.includes(currentFood)) correct++;
    round++;
    callbacks.onProgress(Math.round((round / config.rounds) * 100));
    if (round >= config.rounds) return finish();
    nextRound();
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(roundTimer);
    callbacks.onComplete(correct);
  };

  feedBtn.addEventListener('click', onFeed);

  return {
    start() { nextRound(); },
    destroy() {
      ended = true;
      clearTimeout(roundTimer);
      feedBtn.removeEventListener('click', onFeed);
      wrap.remove();
    },
  };
}
```

- [ ] **Step 2: Manual verification**

Same scratch-file technique as Task 2: mount with
`{ foodItems:6, targetFoods:['🍼','🍌','🥛'], wrongFoods:['🌶️','☕'], displayTimeSec:1, rounds:3 }`,
click "Feed!" three times, confirm `onComplete` fires with a score between 0 and 3. Delete the scratch file afterward.

---

### Task 4: `public/pages/game-toddler.html`

**Files:**
- Create: `public/pages/game-toddler.html`

**Interfaces:**
- Consumes: `createGame` default export from `../js/games/balloon-pop.js` and `../js/games/feed-baby.js`
- Consumes: `SessionManager` (`getCurrentSession`, `updateSession`, `markKidPlayed`) from `../js/core/session.js`
- Consumes: `API.session.complete`, `API.stickers.earn` from `../js/core/api.js`
- Consumes: `PartyState.startPolling` from `../js/core/state.js`
- Consumes: `Confetti.burst` from `../js/systems/confetti.js`
- Consumes: `GAME_CONFIG.toddler` from `../../config/game-config.js`

- [ ] **Step 1: Write the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#0D0B1E">
  <title>Little One Games 🍼</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&family=Fredoka+One&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/theme.css">
  <link rel="stylesheet" href="../css/animations.css">
  <link rel="stylesheet" href="../css/layout.css">
  <link rel="stylesheet" href="../css/components.css">

  <style>
    body { background: var(--navy-deepest); overflow-x: hidden; }

    .page-inner {
      position: relative; z-index: 2;
      min-height: 100dvh;
      display: flex; flex-direction: column;
      align-items: center; padding: 1.5rem 1.25rem 3rem;
    }

    .header-row {
      display: flex; align-items: center; justify-content: space-between;
      width: 100%; max-width: 420px; margin-bottom: 1.5rem;
    }

    .picker-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: .875rem;
      width: 100%; max-width: 420px;
    }

    .game-card {
      background: var(--navy-surface); border: 1.5px solid var(--border-subtle);
      border-radius: var(--radius-lg); padding: 1.75rem 1rem;
      text-align: center; cursor: pointer;
      transition: all var(--transition-slow);
      -webkit-tap-highlight-color: transparent;
    }
    .game-card:hover, .game-card:focus {
      border-color: var(--border-gold); background: var(--navy-card);
      transform: translateY(-3px); outline: none;
    }
    .game-card .card-emoji { font-size: 3rem; display: block; margin-bottom: .5rem; }
    .game-card .card-name  { font-size: 1rem; font-weight: 600; color: var(--gold-soft); }

    #gameStage {
      display: none;
      width: 100%; max-width: 420px; height: 60vh;
      background: var(--navy-surface); border-radius: var(--radius-lg);
      border: 1.5px solid var(--border-subtle); position: relative; overflow: hidden;
    }

    .reveal-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: none; align-items: center; justify-content: center;
      background: rgba(8,7,23,.92); text-align: center; padding: 1.5rem;
    }
    .reveal-overlay.visible { display: flex; }
    .reveal-card { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
    .reveal-emoji { font-size: 5rem; }
    .reveal-name  { font-family: var(--font-display); font-size: 1.3rem; color: var(--gold-soft); }
  </style>
</head>
<body>
  <main class="page-inner">
    <div class="header-row">
      <button class="back-btn" onclick="window.location.href='play.html'">← Back</button>
      <a class="badge badge-gold" href="sticker-book.html" style="text-decoration:none">🎀 Sticker Book</a>
    </div>

    <div class="picker-grid" id="pickerGrid">
      <div class="game-card" data-game="balloon-pop" tabindex="0" onclick="playGame('balloon-pop')">
        <span class="card-emoji">🎈</span>
        <span class="card-name">Balloon Pop</span>
      </div>
      <div class="game-card" data-game="feed-baby" tabindex="0" onclick="playGame('feed-baby')">
        <span class="card-emoji">🍼</span>
        <span class="card-name">Feed the Baby</span>
      </div>
    </div>

    <div id="gameStage"></div>
  </main>

  <div class="reveal-overlay" id="revealOverlay">
    <div class="reveal-card">
      <div class="reveal-emoji" id="revealEmoji"></div>
      <div class="reveal-name" id="revealName"></div>
      <div style="display:flex;gap:.75rem">
        <button class="btn btn-secondary" id="playAgainBtn">Play Again</button>
        <button class="btn btn-secondary" id="chooseAnotherBtn">Choose Another Game</button>
      </div>
    </div>
  </div>

  <script type="module">
    import BalloonPop     from '../js/games/balloon-pop.js';
    import FeedBaby       from '../js/games/feed-baby.js';
    import SessionManager from '../js/core/session.js';
    import API            from '../js/core/api.js';
    import PartyState     from '../js/core/state.js';
    import Confetti       from '../js/systems/confetti.js';
    import GAME_CONFIG     from '../../config/game-config.js';

    const GAMES = { 'balloon-pop': BalloonPop, 'feed-baby': FeedBaby };
    const RARITY_PALETTE = { common: 'gold', uncommon: 'gold', rare: 'celebration', legendary: 'celebration', secret: 'celebration' };

    let currentGame = null;
    let currentGameType = null;

    const session = SessionManager.getCurrentSession();
    if (!session || session.ageGroup !== 'toddler') {
      window.location.href = 'play.html';
    }

    PartyState.startPolling((state) => {
      if (state === 'waiting')  window.location.href = 'index.html';
      if (state === 'revealed') window.location.href = 'reveal.html';
    });

    window.playGame = (gameType) => {
      currentGameType = gameType;
      document.getElementById('pickerGrid').style.display = 'none';
      const stage = document.getElementById('gameStage');
      stage.style.display = 'block';
      stage.innerHTML = '';

      const config = GAME_CONFIG.toddler[gameType];
      currentGame = GAMES[gameType](stage, config, {
        onProgress: (pct) => SessionManager.updateSession({ gameProgress: pct }),
        onComplete: (score) => onGameComplete(gameType, score),
      });
      currentGame.start();
    };

    const onGameComplete = async (gameType, score) => {
      SessionManager.updateSession({ gameProgress: 100, score, status: 'completed' });
      SessionManager.markKidPlayed();

      API.session.complete(session.sessionId, { score, gameType, startedAt: session.startedAt });
      const result = await API.stickers.earn(session.sessionId, gameType);

      if (result.success) showReveal(result.sticker);
    };

    const showReveal = (sticker) => {
      document.getElementById('revealEmoji').textContent = sticker.emoji;
      document.getElementById('revealName').textContent = sticker.name;
      document.getElementById('revealOverlay').classList.add('visible');
      Confetti.burst({ palette: RARITY_PALETTE[sticker.rarity] || 'gold' });
    };

    document.getElementById('playAgainBtn').addEventListener('click', () => {
      document.getElementById('revealOverlay').classList.remove('visible');
      if (currentGame) currentGame.destroy();
      window.playGame(currentGameType);
    });

    document.getElementById('chooseAnotherBtn').addEventListener('click', () => {
      document.getElementById('revealOverlay').classList.remove('visible');
      if (currentGame) currentGame.destroy();
      document.getElementById('gameStage').style.display = 'none';
      document.getElementById('pickerGrid').style.display = 'grid';
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Manual verification**

Run `npx wrangler dev` from the project root (serves both `public/` and the
Worker routes per `wrangler.toml`). In a mobile-width browser tab (375px),
navigate through `index.html` → admin START → `play.html` → tap "Little
One" → confirm `game-toddler.html` loads the picker, tapping "Balloon Pop"
mounts the game, popping 8 balloons (or waiting 60s) triggers the reveal
overlay with a sticker and confetti, and "Choose Another Game" returns to
the picker cleanly (no leftover balloons or timers — check DevTools for
console errors).

---

### Task 5: `public/js/games/emoji-match.js`

**Files:**
- Create: `public/js/games/emoji-match.js`

**Interfaces:**
- Produces: `export default function createGame(container, config, callbacks)` → `{ start(), destroy() }`
- Consumes: `config` shape from `GAME_CONFIG.kid['emoji-match']`: `{ gridSize, emojis, flipBackMs, gameDurationSec, pointsPerMatch, bonusSpeedSec }`
- Consumes: `callbacks.onProgress(pct)`, `callbacks.onComplete(score)`

- [ ] **Step 1: Write the module**

```js
/**
 * GAME — Emoji Match (kid)
 * Classic memory-match grid. Completes on all pairs matched or timer expiry.
 */

export default function createGame(container, config, callbacks) {

  const totalPairs = (config.gridSize * config.gridSize) / 2;
  let matched = 0;
  let flipped = [];
  let locked = false;
  let elapsed = 0;
  let ended = false;
  let durationTimer = null;
  const startedAt = Date.now();

  const deck = [...config.emojis.slice(0, totalPairs), ...config.emojis.slice(0, totalPairs)]
    .sort(() => Math.random() - 0.5);

  const grid = document.createElement('div');
  grid.style.cssText = `
    display:grid; grid-template-columns: repeat(${config.gridSize}, 1fr);
    gap:.5rem; width:100%; height:100%; padding:.75rem; box-sizing:border-box;
  `;
  container.appendChild(grid);

  const cards = deck.map((emoji, i) => {
    const card = document.createElement('button');
    card.dataset.emoji = emoji;
    card.dataset.index = i;
    card.textContent = '❔';
    card.style.cssText = `
      font-size: 1.75rem; border-radius: var(--radius-md, 12px);
      border: 1.5px solid rgba(255,255,255,.15); background: var(--navy-mid, #2a2660);
      cursor: pointer; aspect-ratio: 1;
    `;
    card.addEventListener('click', () => onFlip(card));
    grid.appendChild(card);
    return card;
  });

  const onFlip = (card) => {
    if (ended || locked || card.classList.contains('matched') || flipped.includes(card)) return;

    card.textContent = card.dataset.emoji;
    flipped.push(card);

    if (flipped.length === 2) {
      locked = true;
      const [a, b] = flipped;
      if (a.dataset.emoji === b.dataset.emoji) {
        a.classList.add('matched');
        b.classList.add('matched');
        matched++;
        flipped = [];
        locked = false;
        callbacks.onProgress(Math.round((matched / totalPairs) * 100));
        if (matched >= totalPairs) finish();
      } else {
        setTimeout(() => {
          a.textContent = '❔';
          b.textContent = '❔';
          flipped = [];
          locked = false;
        }, config.flipBackMs);
      }
    }
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    clearInterval(durationTimer);
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const bonus = elapsedSec <= config.bonusSpeedSec ? config.pointsPerMatch : 0;
    const score = matched * config.pointsPerMatch + bonus;
    callbacks.onComplete(score);
  };

  return {
    start() {
      durationTimer = setInterval(() => {
        elapsed++;
        if (elapsed >= config.gameDurationSec) finish();
      }, 1000);
    },
    destroy() {
      ended = true;
      clearInterval(durationTimer);
      cards.forEach(c => c.replaceWith());
      grid.remove();
    },
  };
}
```

- [ ] **Step 2: Manual verification**

Scratch-file mount with
`{ gridSize:4, emojis:['🍼','👶','🎈','🧸','🦄','🌟','🐥','🌸'], flipBackMs:900, gameDurationSec:45, pointsPerMatch:100, bonusSpeedSec:20 }`.
Click through pairs, confirm mismatches flip back after ~900ms, matches
stay revealed, and `onComplete` fires with a nonzero score once all 8
pairs are matched. Delete the scratch file afterward.

---

### Task 6: `public/js/games/baby-scramble.js`

**Files:**
- Create: `public/js/games/baby-scramble.js`

**Interfaces:**
- Produces: `export default function createGame(container, config, callbacks)` → `{ start(), destroy() }`
- Consumes: `config` shape from `GAME_CONFIG.kid['baby-scramble']`: `{ words, wordCount, gameDurationSec, pointsPerWord }`
- Consumes: `callbacks.onProgress(pct)`, `callbacks.onComplete(score)`

- [ ] **Step 1: Write the module**

```js
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
```

- [ ] **Step 2: Manual verification**

Scratch-file mount with
`{ words:['BABY','LOVE','CRIB'], wordCount:3, gameDurationSec:45, pointsPerWord:150 }`.
Tap tiles in the correct order for each word, confirm the built word
displays progressively, wrong-order taps still consume the tile (so a
misclick doesn't soft-lock the round — it just fails that word after all
letters used), and `onComplete` fires with `solvedCount * 150` after 3
words. Delete the scratch file afterward.

---

### Task 7: `public/pages/game-kid.html`

**Files:**
- Create: `public/pages/game-kid.html`

**Interfaces:**
- Consumes: `createGame` default export from `../js/games/emoji-match.js` and `../js/games/baby-scramble.js`
- Consumes: same `SessionManager`/`API`/`PartyState`/`Confetti`/`GAME_CONFIG` surface as Task 4

- [ ] **Step 1: Write the page**

Copy `game-toddler.html` structure exactly (Task 4), with these
differences:
- `<title>Kid Games 🎈</title>`
- Picker cards: `data-game="emoji-match"` (emoji 🃏, name "Emoji Match") and
  `data-game="baby-scramble"` (emoji 🔤, name "Word Scramble")
- Imports `EmojiMatch` from `../js/games/emoji-match.js` and
  `BabyScramble` from `../js/games/baby-scramble.js`, mapped in `GAMES` as
  `{ 'emoji-match': EmojiMatch, 'baby-scramble': BabyScramble }`
- `GAME_CONFIG.kid[gameType]` instead of `GAME_CONFIG.toddler[gameType]`
- Session guard checks `session.ageGroup !== 'kid'` instead of `'toddler'`
- `#gameStage` height stays `60vh` — `emoji-match`'s grid and
  `baby-scramble`'s tile row both flex to fill their container, so no
  page-level layout change is needed between the two games

Full file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#0D0B1E">
  <title>Kid Games 🎈</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&family=Fredoka+One&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/theme.css">
  <link rel="stylesheet" href="../css/animations.css">
  <link rel="stylesheet" href="../css/layout.css">
  <link rel="stylesheet" href="../css/components.css">

  <style>
    body { background: var(--navy-deepest); overflow-x: hidden; }
    .page-inner { position: relative; z-index: 2; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; padding: 1.5rem 1.25rem 3rem; }
    .header-row { display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 420px; margin-bottom: 1.5rem; }
    .picker-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .875rem; width: 100%; max-width: 420px; }
    .game-card { background: var(--navy-surface); border: 1.5px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 1.75rem 1rem; text-align: center; cursor: pointer; transition: all var(--transition-slow); -webkit-tap-highlight-color: transparent; }
    .game-card:hover, .game-card:focus { border-color: var(--border-gold); background: var(--navy-card); transform: translateY(-3px); outline: none; }
    .game-card .card-emoji { font-size: 3rem; display: block; margin-bottom: .5rem; }
    .game-card .card-name  { font-size: 1rem; font-weight: 600; color: var(--gold-soft); }
    #gameStage { display: none; width: 100%; max-width: 420px; height: 60vh; background: var(--navy-surface); border-radius: var(--radius-lg); border: 1.5px solid var(--border-subtle); position: relative; overflow: hidden; }
    .reveal-overlay { position: fixed; inset: 0; z-index: 9999; display: none; align-items: center; justify-content: center; background: rgba(8,7,23,.92); text-align: center; padding: 1.5rem; }
    .reveal-overlay.visible { display: flex; }
    .reveal-card { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
    .reveal-emoji { font-size: 5rem; }
    .reveal-name  { font-family: var(--font-display); font-size: 1.3rem; color: var(--gold-soft); }
  </style>
</head>
<body>
  <main class="page-inner">
    <div class="header-row">
      <button class="back-btn" onclick="window.location.href='play.html'">← Back</button>
      <a class="badge badge-gold" href="sticker-book.html" style="text-decoration:none">🎀 Sticker Book</a>
    </div>

    <div class="picker-grid" id="pickerGrid">
      <div class="game-card" data-game="emoji-match" tabindex="0" onclick="playGame('emoji-match')">
        <span class="card-emoji">🃏</span>
        <span class="card-name">Emoji Match</span>
      </div>
      <div class="game-card" data-game="baby-scramble" tabindex="0" onclick="playGame('baby-scramble')">
        <span class="card-emoji">🔤</span>
        <span class="card-name">Word Scramble</span>
      </div>
    </div>

    <div id="gameStage"></div>
  </main>

  <div class="reveal-overlay" id="revealOverlay">
    <div class="reveal-card">
      <div class="reveal-emoji" id="revealEmoji"></div>
      <div class="reveal-name" id="revealName"></div>
      <div style="display:flex;gap:.75rem">
        <button class="btn btn-secondary" id="playAgainBtn">Play Again</button>
        <button class="btn btn-secondary" id="chooseAnotherBtn">Choose Another Game</button>
      </div>
    </div>
  </div>

  <script type="module">
    import EmojiMatch     from '../js/games/emoji-match.js';
    import BabyScramble   from '../js/games/baby-scramble.js';
    import SessionManager from '../js/core/session.js';
    import API            from '../js/core/api.js';
    import PartyState     from '../js/core/state.js';
    import Confetti       from '../js/systems/confetti.js';
    import GAME_CONFIG     from '../../config/game-config.js';

    const GAMES = { 'emoji-match': EmojiMatch, 'baby-scramble': BabyScramble };
    const RARITY_PALETTE = { common: 'gold', uncommon: 'gold', rare: 'celebration', legendary: 'celebration', secret: 'celebration' };

    let currentGame = null;
    let currentGameType = null;

    const session = SessionManager.getCurrentSession();
    if (!session || session.ageGroup !== 'kid') {
      window.location.href = 'play.html';
    }

    PartyState.startPolling((state) => {
      if (state === 'waiting')  window.location.href = 'index.html';
      if (state === 'revealed') window.location.href = 'reveal.html';
    });

    window.playGame = (gameType) => {
      currentGameType = gameType;
      document.getElementById('pickerGrid').style.display = 'none';
      const stage = document.getElementById('gameStage');
      stage.style.display = 'block';
      stage.innerHTML = '';

      const config = GAME_CONFIG.kid[gameType];
      currentGame = GAMES[gameType](stage, config, {
        onProgress: (pct) => SessionManager.updateSession({ gameProgress: pct }),
        onComplete: (score) => onGameComplete(gameType, score),
      });
      currentGame.start();
    };

    const onGameComplete = async (gameType, score) => {
      SessionManager.updateSession({ gameProgress: 100, score, status: 'completed' });
      SessionManager.markKidPlayed();

      API.session.complete(session.sessionId, { score, gameType, startedAt: session.startedAt });
      const result = await API.stickers.earn(session.sessionId, gameType);

      if (result.success) showReveal(result.sticker);
    };

    const showReveal = (sticker) => {
      document.getElementById('revealEmoji').textContent = sticker.emoji;
      document.getElementById('revealName').textContent = sticker.name;
      document.getElementById('revealOverlay').classList.add('visible');
      Confetti.burst({ palette: RARITY_PALETTE[sticker.rarity] || 'gold' });
    };

    document.getElementById('playAgainBtn').addEventListener('click', () => {
      document.getElementById('revealOverlay').classList.remove('visible');
      if (currentGame) currentGame.destroy();
      window.playGame(currentGameType);
    });

    document.getElementById('chooseAnotherBtn').addEventListener('click', () => {
      document.getElementById('revealOverlay').classList.remove('visible');
      if (currentGame) currentGame.destroy();
      document.getElementById('gameStage').style.display = 'none';
      document.getElementById('pickerGrid').style.display = 'grid';
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Manual verification**

Same flow as Task 4's verification but via `play.html` → "Kid" → confirm
both Emoji Match and Word Scramble mount, play, and complete correctly
with stickers awarded.

---

### Task 8: `public/pages/sticker-book.html`

**Files:**
- Create: `public/pages/sticker-book.html`

**Interfaces:**
- Consumes: `STICKER_CATALOG.stickers` from `../../config/sticker-catalog.js` (array of 13, each with `id, emoji, name, rarity`)
- Consumes: `STICKER_CATALOG.getRarityConfig(rarity)` → `{ label, color, glowColor }`
- Consumes: `API.stickers.collection()` → `{ success, stickers, hasReveal }`

- [ ] **Step 1: Write the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#0D0B1E">
  <title>Sticker Book 🎀</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&family=Fredoka+One&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/theme.css">
  <link rel="stylesheet" href="../css/animations.css">
  <link rel="stylesheet" href="../css/layout.css">
  <link rel="stylesheet" href="../css/components.css">

  <style>
    body { background: var(--navy-deepest); overflow-x: hidden; }
    .page-inner { position: relative; z-index: 2; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; padding: 1.5rem 1.25rem 3rem; }
    .header-row { display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 480px; margin-bottom: 1.5rem; }
    .sticker-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; width: 100%; max-width: 480px; }
    .sticker-slot {
      aspect-ratio: 1; border-radius: var(--radius-lg); display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: .35rem; position: relative;
      border: 1.5px solid var(--border-subtle); background: var(--navy-surface);
    }
    .sticker-slot .slot-emoji { font-size: 2rem; }
    .sticker-slot.owned { box-shadow: 0 0 18px var(--slot-glow, transparent); }
    .sticker-slot.locked .slot-emoji { filter: grayscale(1) brightness(.4); }
    .sticker-slot .slot-name { font-size: .6rem; color: var(--text-muted); text-align: center; padding: 0 .25rem; }
    .sticker-slot .slot-count {
      position: absolute; top: .35rem; right: .35rem; font-size: .65rem;
      background: var(--gold-warm); color: #0D0B1E; border-radius: 9999px;
      padding: .1rem .4rem; font-weight: 700;
    }
  </style>
</head>
<body>
  <main class="page-inner">
    <div class="header-row">
      <a class="back-btn" href="play.html" style="text-decoration:none">← Back to Games</a>
      <div class="badge badge-gold" id="countBadge">0 / 13</div>
    </div>

    <div class="sticker-grid" id="stickerGrid"></div>
  </main>

  <script type="module">
    import API             from '../js/core/api.js';
    import STICKER_CATALOG from '../../config/sticker-catalog.js';

    const init = async () => {
      const result = await API.stickers.collection();
      const owned = result.success ? result.stickers : [];
      const hasReveal = result.success ? result.hasReveal : false;

      const countsById = owned.reduce((acc, s) => {
        acc[s.id] = (acc[s.id] || 0) + 1;
        return acc;
      }, {});

      const grid = document.getElementById('stickerGrid');
      const ownedNonSecret = Object.keys(countsById).filter(id => id !== 'reveal').length;
      document.getElementById('countBadge').textContent = `${ownedNonSecret} / 12`;

      grid.innerHTML = STICKER_CATALOG.stickers.map((sticker) => {
        if (sticker.id === 'reveal') {
          if (!hasReveal) {
            return `
              <div class="sticker-slot locked" title="???">
                <span class="slot-emoji">🔒</span>
                <span class="slot-name">???</span>
              </div>`;
          }
          const rarity = STICKER_CATALOG.getRarityConfig('secret');
          return `
            <div class="sticker-slot owned" style="--slot-glow:${rarity.glowColor}">
              <span class="slot-emoji">${sticker.emoji}</span>
              <span class="slot-name">${sticker.name}</span>
            </div>`;
        }

        const count = countsById[sticker.id] || 0;
        const isOwned = count > 0;
        const rarity = STICKER_CATALOG.getRarityConfig(sticker.rarity);

        return `
          <div class="sticker-slot ${isOwned ? 'owned' : 'locked'}" style="${isOwned ? `--slot-glow:${rarity.glowColor}` : ''}">
            ${count > 1 ? `<span class="slot-count">×${count}</span>` : ''}
            <span class="slot-emoji">${isOwned ? sticker.emoji : '❔'}</span>
            <span class="slot-name">${isOwned ? sticker.name : '???'}</span>
          </div>`;
      }).join('');
    };

    init();
  </script>
</body>
</html>
```

- [ ] **Step 2: Manual verification**

With `wrangler dev` running, play a toddler or kid game to earn at least
one sticker, then navigate to `sticker-book.html` directly. Confirm: the
earned sticker renders full-color with a glow, all others render as
grayscale `❔` placeholders, the count badge reads `1 / 12` (or however
many earned), and the secret slot shows `🔒`/`???` since `hasReveal` is
false at this stage. Reload the page and confirm the collection persists
(read from KV, not just in-memory).

---

## Self-Review Notes

- **Spec coverage:** All 7 spec deliverables have a task — Worker (Task 1),
  4 game modules (Tasks 2, 3, 5, 6), 2 host pages (Tasks 4, 7), sticker
  book (Task 8). `scratch-card.js` correctly excluded per spec's Out of
  Scope section.
- **Type consistency checked:** `createGame(container, config, callbacks)`
  signature and `{ start(), destroy() }` return shape are identical across
  all 4 game modules and both host pages that consume them. `onComplete`
  always receives a plain number score; `onProgress` always receives
  0–100. Sticker object shape (`id, emoji, name, rarity, color, earnedAt`)
  is consistent between the Worker response (Task 1) and both host pages'
  `showReveal()` (Tasks 4, 7) and `sticker-book.html` (Task 8).
- **No placeholders:** every step has complete, runnable code; no "add
  error handling" or "TBD" language.
