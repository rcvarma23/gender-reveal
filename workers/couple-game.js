/**
 * CLOUDFLARE WORKER W6 — Couple's Finale Game
 * Routes:
 *   POST /api/couple/verify-pin     → PIN check, returns couple session token
 *   POST /api/couple/check-letters  → 7/10 letter match check (against SECRET_CODE,
 *                                      the same voucher/scratch-card phrase), unlocks stage 1
 *   GET  /api/couple/status         → resume state for the couple's device
 *   POST /api/couple/attempt        → submit an attempt for the CURRENT stage
 *   POST /api/couple/reveal         → flips party to REVEALED. Called automatically by
 *                                      tv-mode.html's fixed timer after the reveal video
 *                                      starts — gender comes from env.PARTY_GENDER (set
 *                                      once ahead of the party) unless body.gender is
 *                                      explicitly passed, so nothing is chosen live
 *   GET  /api/couple/video          → streams the reveal video from R2 (gated on video_unlocked)
 *
 * The finale is three sequential mini-games, EACH WITH ITS OWN SECRET PHRASE
 * (independent from SECRET_CODE, the voucher/scratch-card phrase, and from
 * each other — lengths can differ), each with its own 3-attempt/hint/duration
 * schedule (3rd attempt always auto-completes so the party never stalls):
 *   Stage 1 — Word Scramble   (arrange shuffled tiles into the correct order)
 *             phrase: env.COUPLE_STAGE1_WORD
 *   Stage 2 — Memory Match    (flip cards — letters + position numbers — to
 *             pair each letter with its correct slot). Its phrase is shown
 *             openly in a banner up front — the challenge here is finding
 *             matching pairs by memory, not guessing an unknown phrase.
 *             phrase: env.COUPLE_STAGE2_WORD
 *   Stage 3 — Puzzle Assembly (arrange a fresh shuffle of jigsaw-style
 *             pieces into the correct order)
 *             phrase: env.COUPLE_STAGE3_WORD
 * Winning stage 1 or 2 just advances to the next stage (attempts reset).
 * Winning stage 3 sets video_unlocked, which is what actually reveals the video.
 *
 * All three stages validate identically: the client always submits a full
 * `guess` array (length = that stage's phrase length) in position order, and
 * the server checks it against that stage's phrase. For the memory-match
 * stage, a "correct" guess is naturally guaranteed for any pair the client
 * can flip and match, so no special-case validation is needed there.
 *
 * KV keys used:
 *   couple_session_token     → current valid couple token (TTL)
 *   couple_letters_confirmed → 'true' once >= LETTERS_NEEDED matched
 *   couple_stage             → 1 | 2 | 3, which mini-game is currently active
 *   couple_attempts          → 0 | 1 | 2 | 3, attempts used in the CURRENT stage
 *   couple_puzzle_letters    → JSON array — stage 1 shuffled tile set
 *   couple_memory_layout     → JSON array — stage 2 shuffled card layout
 *   couple_assembly_letters  → JSON array — stage 3 shuffled tile set
 *   video_unlocked           → 'true' once stage 3 is won
 */

const STAGE_WORD_ENV = { 1: 'COUPLE_STAGE1_WORD', 2: 'COUPLE_STAGE2_WORD', 3: 'COUPLE_STAGE3_WORD' };

const STAGE_CONFIG = {
  1: { name: 'scramble', attempts: {
    1: { durationSec: 60,  hintsFraction: 0 },
    2: { durationSec: 75,  hintsFraction: 0.25 },
    3: { durationSec: 999, hintsFraction: 1, autoComplete: true },
  } },
  2: { name: 'memory', attempts: {
    1: { durationSec: 90,  hintsFraction: 0 },
    2: { durationSec: 100, hintsFraction: 0.3 },
    3: { durationSec: 999, hintsFraction: 1, autoComplete: true },
  } },
  3: { name: 'assembly', attempts: {
    1: { durationSec: 60,  hintsFraction: 0 },
    2: { durationSec: 75,  hintsFraction: 0.25 },
    3: { durationSec: 999, hintsFraction: 1, autoComplete: true },
  } },
};

const shuffle = (arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const computeHints = (attemptNumber, word, stageAttempts) => {
  const config = stageAttempts[attemptNumber];
  if (!config) return [];
  const count = Math.ceil(word.length * config.hintsFraction);
  return Array.from({ length: count }, (_, i) => i)
    .filter(i => i < word.length)
    .map(i => ({ position: i, letter: word[i] }));
};

const generateMemoryLayout = (word) => {
  const cards = [];
  word.forEach((letter, i) => {
    cards.push({ type: 'letter',   value: letter, pairId: i });
    cards.push({ type: 'position', value: i + 1,  pairId: i });
  });
  return shuffle(cards).map((card, id) => ({ ...card, id }));
};

export default {
  async fetch(request, env) {

    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    const cors = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Couple-Token',
    };

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const json  = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json', ...cors },
      });
    const error = (msg, status = 400) => json({ success: false, error: msg }, status);

    const logAction = async (action, detail = {}) => {
      const log = await env.GR_KV.get('admin_action_log', { type: 'json' }) || [];
      log.unshift({ action, detail, at: Date.now() });
      await env.GR_KV.put('admin_action_log', JSON.stringify(log.slice(0, 30)));
    };

    // The voucher/scratch-card phrase (10 letters guests collect) — separate
    // from the three finale mini-game phrases below.
    const secretCode = () => (env.SECRET_CODE || '').toUpperCase().split('');

    // A finale mini-game stage's own phrase.
    const stageWord = (stage) =>
      (env[STAGE_WORD_ENV[stage] || STAGE_WORD_ENV[1]] || '').toUpperCase().split('');

    // ── POST /api/couple/verify-pin ──────────────────────────
    // No token required — this IS the auth step
    if (method === 'POST' && path === '/api/couple/verify-pin') {
      const body = await request.json().catch(() => ({}));
      const { pinHash } = body;

      const partyState = await env.GR_KV.get('party_state');
      if (partyState !== 'finale') {
        return error("The finale isn't unlocked yet", 403);
      }

      if (!pinHash || !env.COUPLE_PIN_HASH || pinHash !== env.COUPLE_PIN_HASH) {
        return error('Invalid PIN', 401);
      }

      const token = crypto.randomUUID();
      await env.GR_KV.put('couple_session_token', token, { expirationTtl: 6 * 60 * 60 });
      await logAction('couple-login');

      return json({ success: true, token });
    }

    // ── Auth gate for everything below ───────────────────────
    // GET /video can't attach custom headers (used from a <video src>), so
    // it also accepts the token as a query param.
    const coupleToken = request.headers.get('X-Couple-Token') || url.searchParams.get('token');
    const validToken   = await env.GR_KV.get('couple_session_token');
    if (!coupleToken || coupleToken !== validToken) {
      return error('Unauthorized', 401);
    }

    // ── POST /api/couple/check-letters ───────────────────────
    if (method === 'POST' && path === '/api/couple/check-letters') {
      const body    = await request.json().catch(() => ({}));
      const letters = Array.isArray(body.letters) ? body.letters : [];
      const code    = secretCode();
      const lettersNeeded = parseInt(env.LETTERS_NEEDED || '7');

      let matchCount = 0;
      for (let i = 0; i < code.length; i++) {
        const guess = (letters[i] || '').toString().toUpperCase();
        if (guess && guess === code[i]) matchCount++;
      }

      const unlocked = matchCount >= lettersNeeded;

      if (unlocked) {
        const existingStage = await env.GR_KV.get('couple_stage');
        if (!existingStage) await env.GR_KV.put('couple_stage', '1');

        const existingLetters = await env.GR_KV.get('couple_puzzle_letters', { type: 'json' });
        if (!existingLetters) {
          await env.GR_KV.put('couple_puzzle_letters', JSON.stringify(shuffle(stageWord(1))));
        }
        await env.GR_KV.put('couple_letters_confirmed', 'true');
        await logAction('couple-letters-confirmed', { matchCount });
      }

      return json({ success: true, matchCount, required: lettersNeeded, unlocked });
    }

    // ── GET /api/couple/status ────────────────────────────────
    if (method === 'GET' && path === '/api/couple/status') {
      const [confirmed, stageRaw, attemptsRaw, videoUnlocked] = await Promise.all([
        env.GR_KV.get('couple_letters_confirmed'),
        env.GR_KV.get('couple_stage'),
        env.GR_KV.get('couple_attempts'),
        env.GR_KV.get('video_unlocked'),
      ]);

      const stage = parseInt(stageRaw || '1');
      const stageAttempts = (STAGE_CONFIG[stage] || STAGE_CONFIG[1]).attempts;
      const attempts = parseInt(attemptsRaw || '0');
      const attemptInProgress = Math.min(attempts + 1, 3);
      const active = confirmed === 'true' && videoUnlocked !== 'true';
      const word = stageWord(stage);
      const hints = active ? computeHints(attemptInProgress, word, stageAttempts) : [];

      const stageData = {};
      if (active) {
        if (stage === 1) {
          let letters = await env.GR_KV.get('couple_puzzle_letters', { type: 'json' });
          if (!letters) {
            letters = shuffle(word);
            await env.GR_KV.put('couple_puzzle_letters', JSON.stringify(letters));
          }
          stageData.puzzleLetters = letters;
        } else if (stage === 2) {
          let layout = await env.GR_KV.get('couple_memory_layout', { type: 'json' });
          if (!layout) {
            layout = generateMemoryLayout(word);
            await env.GR_KV.put('couple_memory_layout', JSON.stringify(layout));
          }
          stageData.memoryLayout = layout;
          // Memory Match reveals its target phrase openly in a banner — the
          // challenge is pairing letters to slots by memory, not guessing
          // an unknown phrase.
          stageData.bannerWord = word.join('');
        } else if (stage === 3) {
          let letters = await env.GR_KV.get('couple_assembly_letters', { type: 'json' });
          if (!letters) {
            letters = shuffle(word);
            await env.GR_KV.put('couple_assembly_letters', JSON.stringify(letters));
          }
          stageData.assemblyLetters = letters;
        }
      }

      return json({
        success:          true,
        lettersConfirmed: confirmed === 'true',
        stage,
        stageName:        (STAGE_CONFIG[stage] || STAGE_CONFIG[1]).name,
        wordLength:       word.length,
        attempts,
        attemptInProgress,
        durationSec:      stageAttempts[attemptInProgress]?.durationSec ?? null,
        hints,
        videoUnlocked:    videoUnlocked === 'true',
        ...stageData,
      });
    }

    // ── POST /api/couple/attempt ──────────────────────────────
    if (method === 'POST' && path === '/api/couple/attempt') {
      const confirmed = await env.GR_KV.get('couple_letters_confirmed');
      if (confirmed !== 'true') return error('Letters not confirmed yet', 403);

      const body  = await request.json().catch(() => ({}));
      const guess = Array.isArray(body.guess) ? body.guess : [];

      const stage = parseInt(await env.GR_KV.get('couple_stage') || '1');
      const stageAttempts = (STAGE_CONFIG[stage] || STAGE_CONFIG[1]).attempts;
      const word = stageWord(stage);

      const currentAttempts = parseInt(await env.GR_KV.get('couple_attempts') || '0');
      const attemptNumber   = currentAttempts + 1;
      if (attemptNumber > 3) return error('No attempts remaining', 403);

      const config = stageAttempts[attemptNumber];
      const guessNormalized = word.map((_, i) => (guess[i] || '').toString().toUpperCase());
      const correct = word.every((letter, i) => guessNormalized[i] === letter);
      const won = correct || config.autoComplete === true;

      if (won && stage < 3) {
        const nextStage = stage + 1;
        await Promise.all([
          env.GR_KV.put('couple_stage', nextStage.toString()),
          env.GR_KV.put('couple_attempts', '0'),
        ]);
        await logAction('couple-stage-complete', { stage, attemptNumber });
        return json({
          success: true, won: true, stageComplete: true,
          completedStage: stage, nextStage,
          nextStageName: STAGE_CONFIG[nextStage].name,
          nextStageDurationSec: STAGE_CONFIG[nextStage].attempts[1].durationSec,
        });
      }

      await env.GR_KV.put('couple_attempts', attemptNumber.toString());

      if (won) {
        await env.GR_KV.put('video_unlocked', 'true');
        await logAction('couple-puzzle-won', { stage, attemptNumber });
        return json({ success: true, won: true, finalStage: true, attemptNumber, solution: word });
      }

      const nextAttempt = attemptNumber + 1;
      const hints = computeHints(nextAttempt, word, stageAttempts);
      await logAction('couple-puzzle-attempt-failed', { stage, attemptNumber });

      return json({
        success: true,
        won: false,
        stage,
        attemptNumber,
        attemptsRemaining: Math.max(0, 3 - attemptNumber),
        nextAttemptDurationSec: stageAttempts[nextAttempt]?.durationSec ?? null,
        hints,
      });
    }

    // ── POST /api/couple/reveal ───────────────────────────────
    if (method === 'POST' && path === '/api/couple/reveal') {
      const videoUnlocked = await env.GR_KV.get('video_unlocked');
      if (videoUnlocked !== 'true') return error('Video has not unlocked yet', 403);

      const body = await request.json().catch(() => ({}));
      // tv-mode.html calls this with no body — the gender is pre-set by the
      // admin ahead of the party as a secret, never chosen live, so the
      // auto-reveal timer doesn't need to know it client-side.
      const requested = body.gender === 'boy' ? 'boy' : body.gender === 'girl' ? 'girl' : null;
      const fallback   = env.PARTY_GENDER === 'boy' ? 'boy' : env.PARTY_GENDER === 'girl' ? 'girl' : null;
      const gender = requested || fallback;
      if (!gender) return error('gender must be "girl" or "boy" (and PARTY_GENDER secret is not set as a fallback)');

      const currentState = await env.GR_KV.get('party_state') || 'waiting';
      if (currentState !== 'finale') return error(`Cannot reveal from state ${currentState}`);

      await env.GR_KV.put('party_state', 'revealed');
      await env.GR_KV.put('party_gender', gender);
      await env.GR_KV.put('gender_revealed', 'true');
      await env.GR_KV.put('gender_revealed_at', Date.now().toString());
      await logAction('couple-reveal', { gender });

      return json({ success: true, state: 'revealed', gender });
    }

    // ── GET /api/couple/video ──────────────────────────────────
    if (method === 'GET' && path === '/api/couple/video') {
      const videoUnlocked = await env.GR_KV.get('video_unlocked');
      if (videoUnlocked !== 'true') return error('Video not unlocked', 403);

      const object = await env.GR_R2.get('reveal-video.mp4');
      if (!object) return error('Reveal video has not been uploaded to R2 yet', 404);

      return new Response(object.body, {
        headers: {
          'Content-Type':  object.httpMetadata?.contentType || 'video/mp4',
          'Cache-Control': 'private, no-store',
          ...cors,
        },
      });
    }

    return error('Not found', 404);
  },
};
