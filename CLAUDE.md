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
├── wrangler.toml                    ← Cloudflare deployment config
│
├── config/
│   ├── party-config.js              ← Master config: secret code, PINs, rules
│   ├── game-config.js               ← Game timing/difficulty per age group
│   └── sticker-catalog.js           ← All 13 stickers with rarity weights
│
├── public/
│   ├── pages/
│   │   ├── index.html               ✅ DONE — Waiting screen (celestial starfield)
│   │   ├── play.html                ✅ DONE — Age group selector
│   │   ├── game-toddler.html        ❌ TODO Phase 3 — Balloon pop + feed baby
│   │   ├── game-kid.html            ❌ TODO Phase 3 — Emoji match + scramble
│   │   ├── game-teen.html           ❌ TODO Phase 4 — Trivia + hard scramble
│   │   ├── game-adult.html          ❌ TODO Phase 4 — Predictions quiz
│   │   ├── result.html              ❌ TODO Phase 4 — Win/lose + handoff
│   │   ├── sticker-book.html        ❌ TODO Phase 3 — Kid sticker collection
│   │   ├── scratch.html             ❌ TODO Phase 5 — Scratch card canvas
│   │   ├── letter.html              ❌ TODO Phase 5 — Letter reveal screen
│   │   ├── couple.html              ❌ TODO Phase 6 — PIN entry
│   │   ├── couple-game.html         ❌ TODO Phase 6 — Timed letter puzzle
│   │   ├── reveal.html              ❌ TODO Phase 6 — Video reveal
│   │   └── admin.html               ✅ DONE — Admin control panel
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
│   │   │   ├── state.js             ✅ DONE — Party state polling
│   │   │   ├── storage.js           ✅ DONE — localStorage wrapper
│   │   │   └── api.js               ✅ DONE — All Worker API calls
│   │   │
│   │   ├── systems/
│   │   │   ├── fingerprint.js       ✅ DONE — Browser fingerprinting
│   │   │   ├── tab-guard.js         ✅ DONE — Multi-tab farming detection
│   │   │   ├── confetti.js          ✅ DONE — Particle confetti engine
│   │   │   └── scratch-card.js      ❌ TODO Phase 5
│   │   │
│   │   ├── games/                   ❌ TODO Phase 3 & 4
│   │   │   ├── balloon-pop.js
│   │   │   ├── feed-baby.js
│   │   │   ├── emoji-match.js
│   │   │   ├── baby-scramble.js
│   │   │   ├── trivia.js
│   │   │   ├── predictions.js
│   │   │   └── couple-puzzle.js
│   │   │
│   │   └── admin/                   ⚠️ SKIPPED — logic lives inline in admin.html
│   │       ├── dashboard.js             (matches index.html/play.html precedent
│   │       ├── controls.js               of embedding page JS in <script type="module">)
│   │       └── realtime.js
│   │
│   └── assets/
│       ├── lottie/                  ❌ TODO — Download from lottiefiles.com
│       ├── webp/stickers/           ❌ TODO — Create/source sticker images
│       └── fonts/                   ❌ TODO — Self-host if needed
│
└── workers/
    ├── party-state.js               ✅ DONE — W1: GET/POST /api/party-state
    ├── session-manager.js           ✅ DONE — W2: /api/session/*
    ├── voucher-engine.js            ❌ TODO Phase 5 — W3: /api/voucher/*
    ├── sticker-system.js            ❌ TODO Phase 3 — W4: /api/sticker/*
    ├── admin-controls.js            ✅ DONE — W5: /api/admin/*
    └── couple-game.js               ❌ TODO Phase 6 — W6: /api/couple/*
```

---

## 🏗️ Build Phases

| Phase | What | Status |
|-------|------|--------|
| **Phase 0** | Project scaffold, config files, wrangler | ✅ COMPLETE |
| **Phase 1** | Core JS modules, CSS system, waiting screen, age selector, W1+W2 | ✅ COMPLETE |
| **Phase 2** | Admin panel (admin.html + W5 worker) | ✅ COMPLETE |
| **Phase 3** | Kid games (toddler + kid), sticker system, W4 worker | ❌ NEXT |
| **Phase 4** | Teen + adult games, result screen, handoff flow | ❌ TODO |
| **Phase 5** | Voucher system, scratch card, letter reveal, W3 worker | ❌ TODO |
| **Phase 6** | Couple finale game, video reveal, W6 worker | ❌ TODO |
| **Phase 7** | Testing, deploy, pre-party checklist | ❌ TODO |

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
| Teen | 10–18 | Trivia, Hard scramble | Voucher 🎟️ | 1 turn, 5-min cooldown |
| Adult | 20+ | Predictions quiz | Voucher 🎟️ | 1 turn, 3-min cooldown, kid-first gate |

**Kid-first gate:** Adults only get voucher eligibility AFTER a kid plays on the same phone.

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
| 3 | Device cooldown — 3 min adults, 5 min teens |
| 4 | Tab farming — BroadcastChannel detects parallel tabs |
| 5 | Fingerprinting — survives incognito/cache clear |
| 6 | Device cap — max 1 voucher per physical device |
| 7 | Kid-first gate — adult voucher requires prior kid play |
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
- Adults eligible for vouchers AFTER kid plays on same device
- Max 1 voucher per device total
- 3-min cooldown between adult sessions on same device
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
3. Server checks: 7/10 match → puzzle unlocks
4. Timed letter puzzle — 3 attempts:
   - Attempt 1: 60s, no hints
   - Attempt 2: 75s, 2 hints
   - Attempt 3: ALWAYS triggers video (unlimited time, auto-complete)
5. Signed R2 URL returned on attempt 3 → video plays
6. After video: ALL guest screens flood with gender colour
7. Secret 🎀 sticker unlocks on every kid's sticker book simultaneously

---

## 🌐 Cloudflare Worker API Reference

| Route | Worker | Description |
|-------|--------|-------------|
| `GET /api/party-state` | party-state.js | Poll state (guests, every 10s) |
| `POST /api/party-state` | party-state.js | Change state (admin only) |
| `POST /api/session/create` | session-manager.js | Register new player |
| `POST /api/session/complete` | session-manager.js | Lock session + anti-cheat |
| `GET /api/session/resume/:id` | session-manager.js | Resume state |
| `POST /api/voucher/request` | voucher-engine.js | Request voucher (all 8 checks) |
| `POST /api/voucher/scratch` | voucher-engine.js | Reveal letter |
| `POST /api/sticker/earn` | sticker-system.js | Kid earns sticker |
| `GET /api/sticker/collection` | sticker-system.js | Get sticker collection |
| `POST /api/admin/login` | admin-controls.js | Admin PIN verify |
| `GET /api/admin/stats` | admin-controls.js | Live dashboard data |
| `POST /api/admin/draw` | admin-controls.js | Trigger winner draw |
| `POST /api/couple/verify-pin` | couple-game.js | Couple PIN check |
| `POST /api/couple/check-letters` | couple-game.js | 7/10 match check |
| `POST /api/couple/attempt` | couple-game.js | Record attempt + unlock video |

---

## ⚙️ Cloudflare KV Keys Reference

```
"party_state"           → waiting | active | finale | revealed
"party_started_at"      → timestamp
"party_gender"          → girl | boy (set at reveal)
"active_players"        → count
"games_completed"       → count
"eligible_pool"         → JSON array of eligible sessions
"draw_status"           → pending | complete
"winner_device_{id}"    → { voucherCode, letter }
"voucher_{code}"        → { letter, status, winnerId, scratchedAt }
"session_{id}"          → full session object
"device_{id}"           → device record (sessions, vouchersIssued, kidPlayedFirst)
"stickers_{deviceId}"   → array of sticker objects
"letters_revealed"      → array of revealed letters
"couple_attempts"       → 0 | 1 | 2 | 3
"video_unlocked"        → bool
"admin_session_token"   → short-lived admin auth token
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
wrangler secret put ADMIN_PIN_HASH    # SHA-256 of your 6-digit admin PIN
wrangler secret put COUPLE_PIN_HASH   # SHA-256 of your 6-digit couple PIN
wrangler secret put SECRET_CODE       # The 10 letters e.g. "BABYLOVEIS"

# Deploy
wrangler deploy

# Local dev
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

## 🎯 What To Build Next (Phase 2)

Start with: **`public/pages/admin.html`** and **`workers/admin-controls.js`**

Admin panel needs:
1. PIN login screen (6-digit, SHA-256 verified against Worker secret)
2. Live stats dashboard (polls every 5s)
3. Party state controls: START / LOCK / TRIGGER DRAW / FORCE VIDEO
4. Letter board showing which of 10 letters are revealed
5. Winner table with voucher status
6. All actions logged to KV

Then follow with Phase 3 (kid games) in this order:
1. `workers/sticker-system.js` (W4)
2. `public/js/games/balloon-pop.js`
3. `public/pages/game-toddler.html`
4. `public/js/systems/scratch-card.js`
5. `public/pages/sticker-book.html`

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
□ Couple enters 7+ letters — puzzle unlocks
□ Couple attempt 3 — video plays
□ Video ends — all screens turn gender colour
□ Kids sticker book — 🎀 appears on all screens
□ Admin force video — works as override
□ Full flow on 4G mobile — loads under 2 seconds
```

---

*Last updated: Phase 1 complete — 20 files, ~5,700 lines*
*Next session: Start Phase 2 (Admin Panel)*
