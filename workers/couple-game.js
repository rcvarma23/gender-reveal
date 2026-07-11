/**
 * CLOUDFLARE WORKER W6 — Couple's Finale Game
 * Routes:
 *   POST /api/couple/verify-pin     → PIN check, returns couple session token
 *   POST /api/couple/check-letters  → 7/10 letter match check, unlocks the puzzle
 *   GET  /api/couple/status         → resume state for the couple's device
 *   POST /api/couple/attempt        → submit a puzzle attempt (3 max — 3rd always wins)
 *   POST /api/couple/reveal         → couple confirms gender, flips party to REVEALED
 *   GET  /api/couple/video          → streams the reveal video from R2 (gated on video_unlocked)
 *
 * The puzzle: the couple already collected (most of) the 10 letters verbally
 * from winning guests. They type in what they've got — check-letters just
 * verifies they actually have >= LETTERS_NEEDED correct before unlocking the
 * puzzle. Once unlocked, the server hands back the real 10 letters shuffled;
 * the game is arranging them into the correct order within the time limit.
 *
 * KV keys used:
 *   couple_session_token     → current valid couple token (TTL)
 *   couple_letters_confirmed → 'true' once >= LETTERS_NEEDED matched
 *   couple_puzzle_letters    → JSON array — the shuffled tile set (fixed once generated)
 *   couple_attempts          → 0 | 1 | 2 | 3
 *   video_unlocked           → 'true' once a win happens (attempt 3 always wins)
 */

const ATTEMPT_CONFIG = {
  1: { durationSec: 60,  hintsShown: 0 },
  2: { durationSec: 75,  hintsShown: 2 },
  3: { durationSec: 999, hintsShown: 10, autoComplete: true },
};

const shuffle = (arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const computeHints = (attemptNumber, secretCode) => {
  const config = ATTEMPT_CONFIG[attemptNumber];
  if (!config) return [];
  return Array.from({ length: config.hintsShown }, (_, i) => i)
    .filter(i => i < secretCode.length)
    .map(i => ({ position: i, letter: secretCode[i] }));
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

    const secretCode = () => (env.SECRET_CODE || '').toUpperCase().split('');

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
        const existing = await env.GR_KV.get('couple_puzzle_letters', { type: 'json' });
        if (!existing) {
          await env.GR_KV.put('couple_puzzle_letters', JSON.stringify(shuffle(code)));
        }
        await env.GR_KV.put('couple_letters_confirmed', 'true');
        await logAction('couple-letters-confirmed', { matchCount });
      }

      return json({ success: true, matchCount, required: lettersNeeded, unlocked });
    }

    // ── GET /api/couple/status ────────────────────────────────
    if (method === 'GET' && path === '/api/couple/status') {
      const [confirmed, attemptsRaw, videoUnlocked, puzzleLetters] = await Promise.all([
        env.GR_KV.get('couple_letters_confirmed'),
        env.GR_KV.get('couple_attempts'),
        env.GR_KV.get('video_unlocked'),
        env.GR_KV.get('couple_puzzle_letters', { type: 'json' }),
      ]);

      const attempts = parseInt(attemptsRaw || '0');
      const attemptInProgress = Math.min(attempts + 1, 3);
      const hints = confirmed === 'true' && videoUnlocked !== 'true'
        ? computeHints(attemptInProgress, secretCode())
        : [];

      return json({
        success:          true,
        lettersConfirmed: confirmed === 'true',
        attempts,
        attemptInProgress,
        durationSec:      ATTEMPT_CONFIG[attemptInProgress]?.durationSec ?? null,
        hints,
        videoUnlocked:    videoUnlocked === 'true',
        puzzleLetters:    puzzleLetters || null,
      });
    }

    // ── POST /api/couple/attempt ──────────────────────────────
    if (method === 'POST' && path === '/api/couple/attempt') {
      const confirmed = await env.GR_KV.get('couple_letters_confirmed');
      if (confirmed !== 'true') return error('Letters not confirmed yet', 403);

      const body  = await request.json().catch(() => ({}));
      const guess = Array.isArray(body.guess) ? body.guess : [];
      const code  = secretCode();

      const currentAttempts = parseInt(await env.GR_KV.get('couple_attempts') || '0');
      const attemptNumber   = currentAttempts + 1;
      if (attemptNumber > 3) return error('No attempts remaining', 403);

      const config = ATTEMPT_CONFIG[attemptNumber];
      const guessNormalized = code.map((_, i) => (guess[i] || '').toString().toUpperCase());
      const correct = code.every((letter, i) => guessNormalized[i] === letter);
      const won = correct || config.autoComplete === true;

      await env.GR_KV.put('couple_attempts', attemptNumber.toString());

      if (won) {
        await env.GR_KV.put('video_unlocked', 'true');
        await logAction('couple-puzzle-won', { attemptNumber });
        return json({ success: true, won: true, attemptNumber, solution: code });
      }

      const nextAttempt = attemptNumber + 1;
      const hints = computeHints(nextAttempt, code);
      await logAction('couple-puzzle-attempt-failed', { attemptNumber });

      return json({
        success: true,
        won: false,
        attemptNumber,
        attemptsRemaining: Math.max(0, 3 - attemptNumber),
        nextAttemptDurationSec: ATTEMPT_CONFIG[nextAttempt]?.durationSec ?? null,
        hints,
      });
    }

    // ── POST /api/couple/reveal ───────────────────────────────
    if (method === 'POST' && path === '/api/couple/reveal') {
      const videoUnlocked = await env.GR_KV.get('video_unlocked');
      if (videoUnlocked !== 'true') return error('Video has not unlocked yet', 403);

      const body   = await request.json().catch(() => ({}));
      const gender = body.gender === 'boy' ? 'boy' : body.gender === 'girl' ? 'girl' : null;
      if (!gender) return error('gender must be "girl" or "boy"');

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
