# 🎀 Gender Reveal Party App — CLAUDE.md
> Claude Code reads this file at the start of every session.
> This is the single source of truth for the entire project.

---

## 🎯 What This Project Is

An interactive web app for a gender reveal party in Atlanta, GA (~100–300 guests).
Guests play age-appropriate mini-games on their own devices. 10 random winners
receive secret letter vouchers. The couple combines all letters into a code,
plays a timed puzzle game, and on the 3rd attempt a 30-second gender reveal
video plays.

**You are the developer. Ram is the product owner and party host.**

---

## 📐 Architecture

```
Cloudflare Pages    → static frontend hosting (FREE)
Cloudflare Workers  → serverless API logic (FREE)
Cloudflare KV       → key-value state store (FREE)
Cloudflare R2       → video file storage (FREE)

No database. No framework. Vanilla HTML/CSS/JS + ES modules.
```

---

## 📁 Project Structure

```
gender-reveal/
├── CLAUDE.md                        ← YOU ARE HERE
├── wrangler.toml                    ← Cloudflare deployment config (main = workers/index.js)
│
├── public/
│   ├── config/                      ← moved under public/ so Wrangler's [assets] can serve it
│   │   │                               to the browser (config/ at repo root is unreachable —
│   │   │                               only ./public is served; see wrangler.toml [assets])
│   │   ├── party-config.js          ← Human-reference config; NOT imported by any code —
│   │   │                               Workers/session/sticker logic hardcode their own
│   │   │                               constants independently. Keep both in sync by hand.
│   │   ├── game-config.js           ✅ DONE — Game timing/difficulty per age group
│   │   ├── sticker-catalog.js       ✅ DONE — 12 earnable + 1 secret sticker, rarity weights
│   │   └── big-guess-questions.js   ✅ DONE — The Big Guess's question bank. Imported by
│   │                                   workers/poll-engine.js (Wrangler bundles main=
│   │                                   workers/index.js and freely resolves relative
│   │                                   imports anywhere in the repo, not just workers/) —
│   │                                   THIS is the one actually-imported exception to the
│   │                                   "config/ is docs-only" rule above. Edit this file
│   │                                   to add/remove/reword Big Guess questions; no other
│   │                                   code needs to change.
│   │
│   ├── pages/
│   │   ├── index.html               ✅ DONE — Waiting screen (celestial starfield)
│   │   ├── play.html                ✅ DONE — Age group selector + 5th standalone
│   │   │                               "The Big Guess" tile (not an age group; admin
│   │   │                               enable/start-gated, links to guess.html)
│   │   ├── game-toddler.html        ✅ DONE — Balloon pop + feed baby
│   │   ├── game-kid.html            ✅ DONE — Emoji match + scramble
│   │   ├── game-teen.html           ✅ DONE — Trivia + hard scramble, one turn only
│   │   ├── game-adult.html          ✅ DONE — Emoji Match, one turn only (Predictions
│   │   │                               Quiz removed — its questions merged into The Big
│   │   │                               Guess, see big-guess-questions.js)
│   │   ├── result.html              ✅ DONE — dedicated non-winner recap page (resume
│   │   │                               flow from play.html routes completed non-winner
│   │   │                               sessions here instead of the game's own overlay)
│   │   ├── sticker-book.html        ✅ DONE — Kid sticker collection
│   │   ├── scratch.html             ✅ DONE — Scratch card canvas
│   │   ├── letter.html              ✅ DONE — Letter reveal screen (resumable)
│   │   ├── couple.html              ✅ DONE — PIN entry + collected-letters check
│   │   ├── couple-game.html         ✅ DONE — Timed letter puzzle + video + gender confirm
│   │   ├── reveal.html              ✅ DONE — Gender flood screen + secret sticker unlock
│   │   ├── admin.html               ✅ DONE — Admin control panel (incl. The Big Guess controls)
│   │   ├── guess.html               ✅ DONE — Guest-facing "The Big Guess" live guessing
│   │   │                               game; standalone, no age group/session dependency,
│   │   │                               reachable via play.html's 5th tile
│   │   └── poll-host.html           ✅ DONE — TV/laptop display for the live "Big Guess";
│   │                                   admin opens this manually, no PIN gate (read-only,
│   │                                   just renders GET /api/poll/state)
│   │
│   ├── css/
│   │   ├── theme.css                ✅ DONE — Design tokens, typography
│   │   ├── animations.css           ✅ DONE — All keyframes
│   │   ├── layout.css               ✅ DONE — Grid, spacing, responsive
│   │   └── components.css           ✅ DONE — Cards, buttons, scratch card etc
│   │
│   ├── js/
│   │   ├── core/
│   │   │   ├── device.js            ✅ DONE — Device ID + fingerprinting
│   │   │   ├── session.js           ✅ DONE — Player session manager
│   │   │   ├── state.js             ✅ DONE — Party state polling + auto-redirect to
│   │   │   │                           scratch.html/letter.html when isWinner turns true;
│   │   │   │                           also detects the server's reset_epoch bump and
│   │   │   │                           wipes local gr_* storage on admin reset-party
│   │   │   ├── storage.js           ✅ DONE — localStorage wrapper
│   │   │   ├── api.js               ✅ DONE — All Worker API calls
│   │   │   └── logger.js            ✅ DONE — Tagged debug logger, ring-buffer +
│   │   │                               window.GRLog console helper (?debug=1 or
│   │   │                               localStorage gr_debug=true to enable verbose output)
│   │   │
│   │   ├── systems/
│   │   │   ├── fingerprint.js       ✅ DONE — Browser fingerprinting
│   │   │   ├── tab-guard.js         ✅ DONE — Multi-tab farming detection
│   │   │   ├── confetti.js          ✅ DONE — Particle confetti engine
│   │   │   └── scratch-card.js      ✅ DONE — Canvas scratch-off, threshold-based reveal
│   │   │
│   │   ├── games/                   ✅ DONE — all 5 (predictions.js removed —
│   │   │                               Predictions Quiz was retired as an adult
│   │   │                               voucher game and its questions merged into
│   │   │                               The Big Guess, see big-guess-questions.js)
│   │   │   ├── balloon-pop.js
│   │   │   ├── feed-baby.js
│   │   │   ├── emoji-match.js
│   │   │   ├── baby-scramble.js       (shared by kid + teen-hard, config-driven)
│   │   │   └── trivia.js
│   │   │       (couple's letter puzzle lives inline in couple-game.html, not a
│   │   │        separate games/ module — it's tightly coupled to attempt/hint
│   │   │        state from the couple-game.js Worker, unlike the replayable
│   │   │        mini-games above. The Big Guess follows the same pattern —
│   │   │        inline in guess.html + poll-host.html, not a games/ module,
│   │   │        since it's a synced multi-question live event driven by
│   │   │        server timestamps rather than a single playthrough)
│   │   │
│   │   └── admin/                   ⚠️ SKIPPED — logic lives inline in admin.html
│   │       ├── dashboard.js             (matches index.html/play.html precedent
│   │       ├── controls.js               of embedding page JS in <script type="module">)
│   │       └── realtime.js
│   │
│   └── assets/
│       ├── lottie/                  ❌ TODO — Download from lottiefiles.com
│       ├── webp/stickers/           ❌ TODO — Create/source sticker images
│       └── fonts/                   ⚠️ PARTIAL — playfair-display.woff2 only
│
└── workers/
    ├── index.js                     ✅ DONE — single Worker entrypoint; dispatches by path
    │                                   prefix to the modules below (wrangler.toml can only
    │                                   point `main` at one file — [[routes]] with a `script`
    │                                   field is for zone-routed multi-worker deployments,
    │                                   not sub-path routing within one project)
    ├── party-state.js               ✅ DONE — W1: GET/POST /api/party-state
    ├── session-manager.js           ✅ DONE — W2: /api/session/*
    ├── voucher-engine.js            ✅ DONE — W3: /api/voucher/*
    ├── sticker-system.js            ✅ DONE — W4: /api/sticker/*
    ├── admin-controls.js            ✅ DONE — W5: /api/admin/* (incl. /api/admin/poll/*)
    ├── couple-game.js               ✅ DONE — W6: /api/couple/*
    └── poll-engine.js               ✅ DONE — W7: /api/poll/* (live Opinion Poll)
```

---

## 🏗️ Build Phases

| Phase | What | Status |
|-------|------|--------|
| **Phase 0** | Project scaffold, config files, wrangler | ✅ COMPLETE |
| **Phase 1** | Core JS modules, CSS system, waiting screen, age selector, W1+W2 | ✅ COMPLETE |
| **Phase 2** | Admin panel (admin.html + W5 worker) | ✅ COMPLETE |
| **Phase 3** | Kid games (toddler + kid), sticker system, W4 worker | ✅ COMPLETE |
| **Phase 4** | Teen + adult games, handoff flow | ✅ COMPLETE (result.html recap page still TODO) |
| **Phase 5** | Voucher system, scratch card, letter reveal, W3 worker | ✅ COMPLETE |
| **Phase 6** | Couple finale game, video reveal, W6 worker | ✅ COMPLETE (no reveal video file uploaded to R2 yet) |
| **Phase 7** | Testing, deploy, pre-party checklist | ❌ NEXT |

---

## 🎨 Design System

**Theme: Celestial Midnight**

| Token | Value | Use |
|-------|-------|-----|
| `--navy-deepest` | `#080717` | Page background |
| `--navy-deep` | `#0D0B1E` | Body background |
| `--navy-card` | `#211E4E` | Card surfaces |
| `--gold-warm` | `#C9A84C` | Primary accent |
| `--gold-bright` | `#FFD700` | Highlights |
| `--text-primary` | `#F0EAF8` | Main text |
| `--pink` | `#FF80AB` | ONLY at reveal |
| `--blue-reveal` | `#40C4FF` | ONLY at reveal |

**Fonts:**
- Headers: `Playfair Display` (serif, elegant)
- Body: `DM Sans` (clean, readable)
- Kids games: `Fredoka One` (playful, rounded)

**Rule: Pink and blue appear ONLY at the gender reveal moment.**

---

## 👥 Guest Segmentation

| Group | Age | Games | Reward | Notes |
|-------|-----|-------|--------|-------|
| Toddler | 0–5 | Balloon pop, Feed baby | Stickers ⭐ | No timer shown, replay forever |
| Kid | 5–10 | Emoji match, Scramble | Stickers ⭐ | Replay forever |
| Teen | 10–18 | Trivia, Hard scramble | Voucher 🎟️ | 1 turn, 60s cooldown |
| Adult | 20+ | Emoji Match | Voucher 🎟️ | 1 turn, 60s cooldown |

**No kid-first gate:** Removed — any adult who plays and clears speed/tab-farming checks is
voucher-eligible immediately, regardless of whether a kid played on the same device first.
Admin manually triggers the winner draw whenever they choose (typically ~10–15 min into the
party) so it doesn't matter who played in what order.

**The Big Guess (all ages, admin-triggered):** A separate live guessing game, not a voucher
game — its own tile on `play.html` (outside the four age-group cards), grayed out until the
admin presses "Enable"; guessing only opens once the admin presses "Start". Question count is
however many are in `public/config/big-guess-questions.js` (15 as of this merge — the original
7 guess questions plus the former Predictions Quiz's 8, personalized and folded in when that
game was retired as an adult voucher option). Each question runs 30s to guess + 10s to see
results, auto-advancing off a server timestamp (`workers/poll-engine.js`, internal key/route
names still say "poll") so every phone and the TV host display (`pages/poll-host.html`) stay in
sync without a manual "next" click. Lives at `pages/guess.html`.

---

## 🎟️ Voucher System

- **Exactly 10 winners** randomly selected from eligible pool
- **Each winner gets 1 voucher → 1 scratch card → 1 secret letter**
- **Draw triggered manually** by admin (not automatic)
- **Letter pool:** 10 letters forming a 2–3 word phrase (e.g. `BABY LOVE IS`)
- **Couple needs 7/10 letters** to unlock their game

### Anti-Cheat Layers (ALL server-enforced in W2 + W3)

| Layer | What it catches |
|-------|----------------|
| 1 | Session lock — completed sessions cannot replay |
| 2 | Speed check — too fast = silently disqualified |
| 3 | Device cooldown — 60s adults, 60s teens |
| 4 | Tab farming — BroadcastChannel detects parallel tabs |
| 5 | Fingerprinting — survives incognito/cache clear |
| 6 | Device cap — max 1 voucher per physical device |
| 7 | *(removed)* — kid-first gate. Adults no longer need a kid to have played first on the same device |
| 8 | Global pool cap — atomic KV write, hard limit 10 |

**Principle: Cheaters are silently disqualified, never told why. Looks like bad luck.**

---

## 🔄 Party State Machine

```
WAITING → ACTIVE → FINALE → REVEALED
```

- `WAITING` — default when site goes live. All guests see welcome screen.
- `ACTIVE` — admin presses START. Games open for everyone.
- `FINALE` — admin presses LOCK. Games closed. Couple's game only.
- `REVEALED` — video played. All screens show gender colour.

**State stored in Cloudflare KV. Guests poll `/api/party-state` every 10 seconds.**

---

## 📱 Same-Phone Multi-Player

Each physical device tracks:
- `deviceId` — permanent, never resets
- `playerSessions[]` — one per human turn (P1, P2, P3...)

Rules:
- Kids (under 10) earn stickers, NEVER vouchers
- Adults eligible for vouchers as soon as they play (no kid-first requirement — removed)
- Max 1 voucher per device total
- 60s cooldown between adult/teen sessions on same device
- Resume screen shows all sessions — anyone can pick up where they left off

---

## 🔐 Admin Panel

URL: `/pages/admin.html`
- Protected by 6-digit PIN (set as Cloudflare Worker secret)
- Controls: START / LOCK / TRIGGER DRAW / NUDGE / FORCE REVEAL / RESET
- Shows live stats: guests online, games done, letters revealed (X/10)
- Letter board shows which letters scratched vs pending
- All actions logged to KV with timestamp

---

## 🎬 Couple's Finale

1. Couple enters PIN at `/pages/couple.html`
2. They enter all collected letters
3. Server checks: 7/10 match against `SECRET_CODE` (the voucher/scratch-card
   phrase) → Stage 1 unlocks
4. Three sequential mini-games. Each stage has its OWN secret phrase — a
   separate env var/secret from `SECRET_CODE` and from each other, lengths
   can differ — and its own 3-attempt/hint/duration schedule (3rd attempt
   ALWAYS auto-completes so the party never stalls):
   - **Stage 1 — Word Scramble** (`COUPLE_STAGE1_WORD`): drag shuffled
     letter tiles into slots in the correct order. Attempt 1: 60s/0 hints.
     Attempt 2: 75s/~25% hints. Attempt 3: auto-completes.
   - **Stage 2 — Memory Match** (`COUPLE_STAGE2_WORD`): flip cards (one set
     of letters, one set of matching position numbers) to pair each letter
     with its correct slot. Unlike stages 1/3, this stage's phrase is shown
     openly in a banner up front — the challenge is finding matching pairs
     by memory, not guessing an unknown phrase. Attempt 1: 90s/0 pre-matched.
     Attempt 2: 100s/~30% pre-matched. Attempt 3: auto-completes.
   - **Stage 3 — Puzzle Assembly** (`COUPLE_STAGE3_WORD`): same order-matching
     mechanic as Stage 1, jigsaw-piece styled tiles, its own freshly-shuffled
     tile set. Attempt 1: 60s/0 hints. Attempt 2: 75s/~25% hints. Attempt 3:
     auto-completes.
   Winning Stage 1 or 2 just advances to the next stage (attempts reset to 0).
   Only winning Stage 3 sets `video_unlocked`.
5. Signed R2 URL returned once Stage 3 is won → video plays
6. After video: ALL guest screens flood with gender colour
7. Secret 🎀 sticker unlocks on every kid's sticker book simultaneously

---

## 🌐 Cloudflare Worker API Reference

| Route | Worker | Description |
|-------|--------|-------------|
| `GET /api/party-state` | party-state.js | Poll state (guests, every 10s). Only reveals a winner's `letter` once their voucher's `status` is `revealed` — never leaks it early |
| `POST /api/party-state` | party-state.js | Change state (admin only) |
| `POST /api/session/create` | session-manager.js | Register new player |
| `POST /api/session/complete` | session-manager.js | Lock session + anti-cheat. Only sets `device.lastCompletionByGroup[ageGroup]` (cooldown clock, keyed per age group so adult/teen cooldowns never cross-block each other) for adult/teen — a kid finishing must never cooldown-block the very next adult attempt on the same phone |
| `GET /api/session/resume/:id` | session-manager.js | Resume state |
| `POST /api/voucher/request` | voucher-engine.js | Check/claim this device's voucher (post-draw only — winner selection itself happens in `admin/draw`) |
| `POST /api/voucher/scratch` | voucher-engine.js | Reveal letter (only the winning device may scratch its own code) |
| `GET /api/voucher/status/:code` | voucher-engine.js | Read-only status check, used by letter.html to recover a revealed letter after reload |
| `POST /api/sticker/earn` | sticker-system.js | Kid earns sticker (weighted random, independent per call — not tied to game content) |
| `GET /api/sticker/collection` | sticker-system.js | Get sticker collection |
| `POST /api/sticker/unlock-reveal` | sticker-system.js | Adds the secret 🎀 sticker; called by reveal.html for kid-played devices |
| `POST /api/admin/login` | admin-controls.js | Admin PIN verify |
| `GET /api/admin/stats` | admin-controls.js | Live dashboard data |
| `POST /api/admin/draw` | admin-controls.js | Trigger winner draw (device dedupe + hard 10 cap) |
| `POST /api/admin/nudge` / `force-reveal` / `reset-attempts` / `force-video` / `reset-party` | admin-controls.js | Admin overrides — see file header for each. Note: `reset-party` does NOT clear `device_{id}` cooldown/history records |
| `POST /api/couple/verify-pin` | couple-game.js | Couple PIN check — only succeeds while `party_state === finale` |
| `POST /api/couple/check-letters` | couple-game.js | Checks collected letters against the real `SECRET_CODE`; ≥ `LETTERS_NEEDED` matches unlocks Stage 1 and generates its shuffled tile set |
| `GET /api/couple/status` | couple-game.js | Resume state: current `stage` (1–3) + `stageName`, attempt in progress, hints for that attempt, stage-specific puzzle data (`puzzleLetters` / `memoryLayout` / `assemblyLetters`, lazily generated on first read of that stage), video-unlocked flag |
| `POST /api/couple/attempt` | couple-game.js | Submit an attempt for the *current* stage (3 max per stage — attempt 3 always wins). All 3 stages validate identically: client submits a 10-letter `guess` array in position order, server compares to `SECRET_CODE`. Winning stage 1/2 returns `stageComplete`/`nextStage` and advances without unlocking video; winning stage 3 returns `finalStage` and sets `video_unlocked`. Wrong attempts return hints for the *next* attempt in the same stage |
| `POST /api/couple/reveal` | couple-game.js | Couple confirms gender (girl/boy) → flips `party_state` to `revealed`, which every guest's own poll picks up independently |
| `GET /api/couple/video` | couple-game.js | Streams the reveal video from R2, gated on `video_unlocked`. 404s until a video file is actually uploaded |
| `GET /api/poll/state` | poll-engine.js | Current Opinion Poll status/phase/question/timer/tally — guest phones and the TV host display both poll this. Lazily advances `poll_current_index` off elapsed time; no cron needed |
| `POST /api/poll/vote` | poll-engine.js | Cast a vote for the active question (1 per device per question, silently deduped) |
| `GET /api/poll/final` | poll-engine.js | Final per-question tallies once the poll is `complete` |
| `POST /api/admin/poll/enable` | admin-controls.js | Un-gray the Opinion Poll card on the adult game screen |
| `POST /api/admin/poll/start` | admin-controls.js | Begin question 1 — timing from here on is fully server-derived |
| `POST /api/admin/poll/reset` | admin-controls.js | Clear votes/results, back to `disabled` |

---

## ⚙️ Cloudflare KV Keys Reference

```
"party_state"             → waiting | active | finale | revealed
"party_started_at"        → timestamp
"party_gender"            → girl | boy (set by couple/reveal)
"gender_revealed"         → bool
"active_players"          → count
"games_completed"         → count
"eligible_pool"           → JSON array of { sessionId, deviceId, ageGroup, addedAt }
"draw_status"             → pending | complete
"winner_device_{id}"      → { voucherCode, letter, position }
"voucher_{code}"          → { code, letter, position, status, deviceId, sessionId,
                              ageGroup, issuedAt, scratchedAt }
"session_{id}"            → full session object (voucherCode/letterRevealed/letter
                              get filled in by voucher-engine.js on scratch)
"device_{id}"             → device record (sessions, vouchersIssued, kidPlayedFirst,
                              lastCompletionByGroup: { adult?, teen? } — only set by
                              adult/teen completions, keyed per age group so an
                              adult's play never cooldown-blocks a teen's turn or vice
                              versa on a shared phone)
"stickers_{deviceId}"     → array of sticker objects
"letters_revealed"        → JSON array of { position, letter }
"admin_session_token"     → short-lived admin auth token
"admin_action_log"        → rolling JSON array of last 30 admin/couple actions
"couple_session_token"    → couple's auth token (6h TTL)
"couple_letters_confirmed"→ 'true' once ≥ LETTERS_NEEDED letters matched
"couple_stage"            → 1 | 2 | 3 — which finale mini-game is currently active
                              (1=Word Scramble, 2=Memory Match, 3=Puzzle Assembly)
"couple_puzzle_letters"   → JSON array — Stage 1 shuffled tile set (fixed once generated)
"couple_memory_layout"    → JSON array — Stage 2 shuffled 20-card layout
                              ({type:'letter'|'position', value, pairId, id})
"couple_assembly_letters" → JSON array — Stage 3 shuffled tile set (fresh shuffle,
                              independent from Stage 1's)
"couple_attempts"         → 0 | 1 | 2 | 3 — attempts used in the CURRENT stage only;
                              resets to 0 each time a stage is won and the next begins
"video_unlocked"          → bool, set only once Stage 3 is won
"reset_epoch"             → timestamp string, bumped by admin/reset-party; guests'
                              party-state poll compares it against their locally
                              cached value and auto-clears gr_* localStorage/
                              sessionStorage (except device identity) on mismatch
"poll_status"              → disabled | ready | active | complete
"poll_current_index"       → 0-based index of the live/most-recent poll question
"poll_question_started_at" → timestamp ms; the 30s-vote + 10s-results cycle is
                              computed lazily from this on every /api/poll/state
                              read, since Workers have no background timer
"poll_votes_q{n}"          → JSON array of { deviceId, choiceIndex, at }, one
                              per question index, deduped by deviceId
"poll_final_results"       → JSON array of { question, choices, totalVotes },
                              written once when the poll completes
```

---

## 🚀 Setup Commands (run once)

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create KV namespace
wrangler kv:namespace create "GR_KV"
wrangler kv:namespace create "GR_KV" --preview
# → Copy IDs into wrangler.toml

# Create R2 bucket
wrangler r2 bucket create gender-reveal-video

# Set secrets (never commit these)
wrangler secret put ADMIN_PIN_HASH      # SHA-256 of your 6-digit admin PIN
wrangler secret put COUPLE_PIN_HASH     # SHA-256 of your 6-digit couple PIN
wrangler secret put SECRET_CODE         # The voucher/scratch-card phrase
wrangler secret put COUPLE_STAGE1_WORD  # Finale Stage 1 (Word Scramble) phrase
wrangler secret put COUPLE_STAGE2_WORD  # Finale Stage 2 (Memory Match) phrase
wrangler secret put COUPLE_STAGE3_WORD  # Finale Stage 3 (Puzzle Assembly) phrase

# Deploy
wrangler deploy

# Local dev — reads secrets from .dev.vars (git-ignored), no real Cloudflare
# resources needed. Currently seeded with test values: admin PIN 123456,
# couple PIN 112233, SECRET_CODE + the three COUPLE_STAGE*_WORD phrases.
# Replace with real values in a separate .dev.vars before rehearsing with
# the real party's phrases.
wrangler dev
```

---

## 📋 Coding Conventions

1. **No frameworks** — vanilla HTML/CSS/JS + ES modules only
2. **Module pattern** — every JS file uses IIFE or ES module export
3. **Mobile first** — design for 375px, scale up
4. **Tap targets** — minimum 48×48px for adults, 64×64px for kids, 100×100px for toddlers
5. **GPU animations only** — use `transform` and `opacity`, never `width/height/top/left`
6. **Server-side enforcement** — never trust client for anti-cheat, voucher logic, or state
7. **Silent failures** — anti-cheat disqualifies silently, never tells user why
8. **iOS safe areas** — use `env(safe-area-inset-*)` for all pages
9. **Reduced motion** — all animations respect `prefers-reduced-motion`
10. **No external dependencies** — no npm packages in frontend (Cloudflare Workers only)

---

## 🎯 What To Build Next (Phase 7)

All 6 build phases of game/voucher/couple logic are done. What's left before
the real party:

1. **Upload the actual reveal video** to R2: `wrangler r2 object put
   gender-reveal-video/reveal-video.mp4 --file=<your-video>`. Without it,
   `GET /api/couple/video` 404s and couple-game.html shows a graceful
   "no video uploaded yet" fallback instead of playing anything.
2. **Set real secrets before the party** — `.dev.vars` only has test values
   for `ADMIN_PIN_HASH`/`COUPLE_PIN_HASH` (PIN `123456`/`112233`), `SECRET_CODE`,
   and the three `COUPLE_STAGE1_WORD`/`COUPLE_STAGE2_WORD`/`COUPLE_STAGE3_WORD`
   finale phrases. Run the `wrangler secret put` commands below with real
   values, and create the real KV namespace (wrangler.toml still has
   placeholder `YOUR_KV_ID_HERE` / `YOUR_PREVIEW_KV_ID`).
3. Missing asset polish: lottie animations, sticker webp art, self-hosted
   DM Sans/Fredoka One font files (only Playfair Display is self-hosted
   today — the rest load from Google Fonts CDN, which needs connectivity
   at the venue). Background music was explicitly deferred — no audio
   asset exists yet, add one + wire an `<audio>` loop into index.html
   when ready.
4. Work through the **Testing Checklist** below on real devices.
5. Debug logging: `public/js/core/logger.js` now backs `PartyState`,
   `SessionManager`, `DeviceManager`, and `play.html`. Enable verbose
   console output with `?debug=1` on any page URL or
   `localStorage.setItem('gr_debug','true')`; dump recent activity with
   `GRLog.dump()` in devtools console. Worker-side `console.log` lines
   (tagged `[SessionManager]` etc.) show up in the `wrangler dev` terminal.

---

## 🧪 Testing Checklist Before Party

```
□ Open site on iPhone Safari — waiting screen shows
□ Admin presses START — all waiting screens flip
□ Select age group — navigates to correct game
□ Toddler plays — earns sticker, can replay
□ Kid plays — earns sticker, can replay
□ Adult plays (kid first) — eligible for draw
□ Admin triggers draw — 10 winners selected
□ Winner sees scratch card — scratches to reveal letter
□ Letter shown — recoverable on return visit
□ Kid closes browser — resumes from same point
□ Same phone: kid then adult — both sessions isolated
□ Multiple tabs — second tab shows warning
□ Incognito attempt — fingerprint caught, no voucher
□ Couple enters PIN — valid only in FINALE state
□ Couple enters 7+ letters — Stage 1 (Word Scramble) unlocks
□ Stage 1 attempt 3 — auto-completes, advances to Stage 2 (Memory Match)
□ Stage 2 attempt 3 — auto-completes, advances to Stage 3 (Puzzle Assembly)
□ Stage 3 attempt 3 — auto-completes, video plays
□ Video ends — all screens turn gender colour
□ Kids sticker book — 🎀 appears on all screens
□ Admin force video — works as override
□ Full flow on 4G mobile — loads under 2 seconds
□ Admin enables + starts The Big Guess — 5th tile on play.html un-grays, TV display (poll-host.html) and guest phones show question 1 in sync
□ The Big Guess — guess submitted, results shown after 30s, auto-advances through every question in big-guess-questions.js, final results shown on completion
□ Adult plays without a kid playing first on the same phone — still voucher-eligible
```

---

*Last updated: Phases 0–6 complete — all game/voucher/couple-finale logic built and tested*
*Next session: Phase 7 — real video upload, real secrets, result.html, asset polish, device testing*
