# Phase 3 — Kid Games, Sticker System, W4 Worker

Date: 2026-07-09
Status: Approved for planning

## Goal

Build out Phase 3 per `CLAUDE.md`: the toddler and kid game experiences, the
sticker-earning backend (W4), and the sticker collection page. Teen/adult
games, vouchers, and scratch cards remain out of scope (Phases 4–5).

## Scope

In scope:
- `workers/sticker-system.js` (W4 worker)
- `public/js/games/balloon-pop.js`
- `public/js/games/feed-baby.js`
- `public/js/games/emoji-match.js`
- `public/js/games/baby-scramble.js`
- `public/pages/game-toddler.html`
- `public/pages/game-kid.html`
- `public/pages/sticker-book.html`

Out of scope (explicitly deferred):
- `public/js/systems/scratch-card.js` — belongs to Phase 5 (voucher/letter
  reveal), not sticker awarding. CLAUDE.md's "what to build next" ordering
  listed it under Phase 3 by mistake; the file-tree TODO phase (Phase 5) is
  correct and takes precedence.
- Real sticker art assets (`public/assets/webp/stickers/`) — catalog already
  defines emoji as the visual representation; no image generation needed.
- Teen/adult games, `result.html`, voucher logic — Phase 4/5.

## Backend: `workers/sticker-system.js` (W4)

Follows the exact structural pattern already established in
`workers/party-state.js` and `workers/session-manager.js`: CORS headers,
`json()`/`error()` response helpers, `X-Device-Id` header required on every
request. Worker scripts in this codebase duplicate small constant tables
inline rather than importing shared config modules (see `session-manager.js`
duplicating `COOLDOWNS`/`MIN_GAME_SECONDS` instead of importing
`game-config.js`) — `sticker-system.js` follows the same convention and
inlines its own copy of the sticker catalog/weights.

### Routes

**`POST /api/sticker/earn`**
- Body: `{ sessionId, gameType }`
- Loads `session_{sessionId}` from KV. 404s if missing.
- Rejects (400) if `session.isKid !== true` — adults/teens cannot earn
  stickers even if the client is manipulated to call this route directly.
- Picks a weighted-random sticker from the inline catalog, filtered to
  stickers valid for `gameType` (or tagged `'all'`), excluding the
  `weight: 0` secret sticker.
- Appends `{ id, emoji, name, rarity, color, earnedAt }` to
  `stickers_{deviceId}` (reads existing array, pushes, writes back — no
  read-modify-write race protection needed since one device plays one game
  at a time per the tab-guard system already in place).
- Returns `{ success: true, sticker }`.

**`GET /api/sticker/collection`**
- Reads `X-Device-Id`.
- Returns `{ stickers: [...], hasReveal: bool }` where `hasReveal` is
  `stickers.some(s => s.id === 'reveal')`.

**`POST /api/sticker/unlock-reveal`**
- Idempotent: if `stickers_{deviceId}` already contains the `reveal`
  sticker, no-op and return success.
- Otherwise appends the secret sticker `{ id: 'reveal', emoji: '🎀', name:
  'The Big Reveal!', rarity: 'secret', earnedAt, gender }` (gender passed
  in body, optional).
- This route isn't called by anything built in Phase 3 — it exists now so
  the Phase 6 reveal flow has a stable contract to call against, matching
  `API.stickers.unlockReveal()` which already exists in `core/api.js`.

### KV shape

`stickers_{deviceId}` → JSON array of sticker records. This matches the
shape `Storage.stickers` (client-side, `core/storage.js`) already expects,
confirming the client was built anticipating this exact contract.

## Frontend: Game Module Interface

New directory `public/js/games/`. Each mini-game is an ES module with a
single default export — a factory function, not a class, matching the
functional-module style used elsewhere (`core/session.js`, `systems/
confetti.js` are both IIFE-returned plain objects):

```js
export default function createGame(container, config, callbacks) {
  // container: DOM element to mount into
  // config: the relevant GAME_CONFIG slice, e.g. GAME_CONFIG.toddler['balloon-pop']
  // callbacks: { onProgress(pct), onComplete(score) }
  return {
    start()   { /* begin game loop, wire up input */ },
    destroy() { /* clear timers/intervals, remove listeners */ },
  };
}
```

The host page (`game-toddler.html`/`game-kid.html`) owns all
session/API/sticker wiring. Game modules only compute a score and call
`onComplete(score)` — they never import `SessionManager` or `API`
directly. This keeps each game independently testable and swappable.

## Frontend: Page Flow

`game-toddler.html` and `game-kid.html` share the same structure (each is
self-contained, following `play.html`'s pattern of embedding page logic in
a `<script type="module">` rather than a separate page-controller file):

1. **Guard on load**: verify a session exists for this age group via
   `SessionManager.getCurrentSession()`; redirect to `play.html` if not.
   Start `PartyState.startPolling()` with the same waiting/revealed
   redirects `play.html` uses.
2. **Picker screen**: two cards (visual language borrowed from
   `play.html`'s `.age-card-item`), one per game for that age group.
3. Tapping a card mounts the chosen module into `#gameStage`, sized per
   `GAME_CONFIG[ageGroup].tapTargetPx` (100px toddler / 64px kid).
4. **`onComplete(score)` handler** (on the host page, shared by both
   games on that page):
   - `SessionManager.updateSession({ gameProgress: 100, score })`
   - `SessionManager.markKidPlayed()` — this is the missing piece that
     actually sets `kidPlayedFirst` on the device; `play.html`'s
     kid-first notice already reads this flag but nothing currently
     writes it.
   - `API.session.complete(sessionId, { score, gameType, startedAt })`
     (fire-and-forget, matches existing pattern of not blocking UI on
     network calls)
   - `API.stickers.earn(sessionId, gameType)` → on success, show the
     reveal overlay using the sticker data returned in the response.
5. **Reveal overlay**: full-screen modal — sticker emoji large, rarity-
   colored glow (color/rarity comes from the `/sticker/earn` response, no
   client-side catalog duplication needed), `Confetti.burst()` colored by
   rarity tier (map rarity → an existing `Confetti.PALETTES` entry: common/
   uncommon → `gold`, rare/legendary/secret → `celebration`). Two buttons:
   **Play Again** (remount same game) and **Choose Another Game** (return
   to picker). Persistent "🎀 Sticker Book" link in the header, always
   visible, navigating to `sticker-book.html`.

Both games are toddler/kid — no fail state, no timer-driven "you lose."
Every completion path (target reached OR time/rounds exhausted) ends in
`onComplete`.

## Frontend: The Four Mini-Games

All tuning values come directly from `GAME_CONFIG` (`config/game-config.js`)
— already fully specified, no new config needed.

- **`balloon-pop.js`** (toddler): balloons spawn every `spawnIntervalMs`,
  float upward at a random speed between `balloonSpeedMin`/`Max`, sized
  `balloonSizePx`. Tap/click pops with a small particle burst. Completes
  when `balloonsToWin` popped OR `gameDurationSec` elapses — score is
  balloons popped either way.
- **`feed-baby.js`** (toddler): one food emoji shown per round from
  `targetFoods`/`wrongFoods`, big tap-to-feed button, `displayTimeSec` per
  item, `rounds` total. Score = correct feeds; always completes after all
  rounds.
- **`emoji-match.js`** (kid): memory-match grid, `gridSize`×`gridSize` from
  the `emojis` list, `flipBackMs` mismatch delay, countdown from
  `gameDurationSec`. Completes on all pairs matched or timer expiry —
  score reflects matches found, with `bonusSpeedSec` awarding extra points
  if finished early.
- **`baby-scramble.js`** (kid): `wordCount` scrambled words from the
  `words` list, letter-tile tap-to-build UI sized to `tapTargetPx`,
  `pointsPerWord` per solve, countdown from `gameDurationSec`.

Each module computes `score` internally and calls `onComplete(score)` on
its end condition — no direct API/SessionManager access (see module
interface above).

## Frontend: `sticker-book.html`

Grid of all 13 entries from `STICKER_CATALOG.stickers`
(`config/sticker-catalog.js`, imported client-side the same way other
config files are consumed). On load, calls `API.stickers.collection()`.
Owned stickers render full-color with the rarity glow token
(`STICKER_CATALOG.getRarityConfig(rarity).glowColor`); unowned stickers
render as grayscale silhouettes with a "?" placeholder. Duplicate earns
show a small count badge. The secret `reveal` slot stays hidden/locked
until `hasReveal` is true (from the collection response). Includes a
"← Back to Games" link to `play.html`.

## Testing

No formal test framework in this project (vanilla JS, no build step).
Verification is manual: run `wrangler dev`, play through both age-group
flows on a mobile viewport, confirm stickers accumulate in the sticker
book across reloads (KV persistence) and that `kidPlayedFirst` correctly
unlocks the adult voucher notice on `play.html`.
