/**
 * CLOUDFLARE WORKER W5 — Admin Controls
 * Routes:
 *   POST /api/admin/login           → PIN verify, returns session token
 *   GET  /api/admin/stats           → live dashboard data
 *   POST /api/admin/draw            → trigger winner draw (10 vouchers + letters)
 *   POST /api/admin/nudge           → alert pending winners on their screen
 *   POST /api/admin/force-reveal    → force-reveal a specific voucher's letter
 *   POST /api/admin/reset-attempts  → reset couple's attempt counter
 *   POST /api/admin/force-video     → override: unlock the reveal video
 *   POST /api/admin/reset-party     → wipe state back to WAITING (rehearsal use)
 *
 * KV keys used (in addition to W1/W2 keys):
 *   admin_session_token   → current valid admin token (TTL)
 *   admin_action_log      → rolling JSON array of the last 30 admin actions
 *   voucher_{code}        → { code, letter, position, status, deviceId, sessionId, ageGroup, issuedAt, scratchedAt }
 *   winner_device_{id}    → { voucherCode, letter, position }
 *   letters_revealed      → JSON array of { position, letter }
 */

const ADMIN_TOKEN_TTL_SECONDS = 6 * 60 * 60; // 6 hours

export default {
  async fetch(request, env) {

    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    const cors = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    };

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const json  = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json', ...cors },
      });
    const error = (msg, status = 400) => json({ success: false, error: msg }, status);

    // ── Helpers ─────────────────────────────────────────────

    const logAction = async (action, detail = {}) => {
      const log = await env.GR_KV.get('admin_action_log', { type: 'json' }) || [];
      log.unshift({ action, detail, at: Date.now() });
      await env.GR_KV.put('admin_action_log', JSON.stringify(log.slice(0, 30)));
    };

    const randomCode = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
      let out = '';
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      for (let i = 0; i < 6; i++) out += chars[bytes[i] % chars.length];
      return `GR-${out}`;
    };

    const shuffle = (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };

    // ── POST /api/admin/login ────────────────────────────────
    // No token required — this IS the auth step
    if (method === 'POST' && path === '/api/admin/login') {
      const body = await request.json();
      const { pinHash } = body;

      if (!pinHash || !env.ADMIN_PIN_HASH || pinHash !== env.ADMIN_PIN_HASH) {
        return error('Invalid PIN', 401);
      }

      const token = crypto.randomUUID();
      await env.GR_KV.put('admin_session_token', token, { expirationTtl: ADMIN_TOKEN_TTL_SECONDS });
      await logAction('login');

      return json({ success: true, token, expiresIn: ADMIN_TOKEN_TTL_SECONDS });
    }

    // ── Auth gate for everything below ───────────────────────
    const adminToken = request.headers.get('X-Admin-Token');
    const validToken  = await env.GR_KV.get('admin_session_token');
    if (!adminToken || adminToken !== validToken) {
      return error('Unauthorized', 401);
    }

    // ── GET /api/admin/stats ─────────────────────────────────
    if (method === 'GET' && path === '/api/admin/stats') {

      const [
        state, partyStartedAt, gamesCompleted, activePlayers,
        eligiblePool, drawStatus, coupleAttempts, videoUnlocked,
        nudgePending, actionLog, genderRevealed, partyGender,
      ] = await Promise.all([
        env.GR_KV.get('party_state'),
        env.GR_KV.get('party_started_at'),
        env.GR_KV.get('games_completed'),
        env.GR_KV.get('active_players'),
        env.GR_KV.get('eligible_pool', { type: 'json' }),
        env.GR_KV.get('draw_status'),
        env.GR_KV.get('couple_attempts'),
        env.GR_KV.get('video_unlocked'),
        env.GR_KV.get('nudge_pending'),
        env.GR_KV.get('admin_action_log', { type: 'json' }),
        env.GR_KV.get('gender_revealed'),
        env.GR_KV.get('party_gender'),
      ]);

      // Pull all voucher records (max 10 ever exist)
      const voucherList = await env.GR_KV.list({ prefix: 'voucher_' });
      const winners = await Promise.all(
        voucherList.keys.map(k => env.GR_KV.get(k.name, { type: 'json' }))
      );
      winners.sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));

      const totalVouchers = parseInt(env.TOTAL_VOUCHERS || '10');
      const lettersRevealedCount = winners.filter(w => w?.status === 'revealed').length;

      return json({
        success: true,
        state: state || 'waiting',
        partyStartedAt: partyStartedAt ? parseInt(partyStartedAt) : null,
        gamesCompleted: parseInt(gamesCompleted || '0'),
        activePlayers:  parseInt(activePlayers || '0'),
        eligiblePoolSize: (eligiblePool || []).length,
        drawStatus:     drawStatus || 'pending',
        totalVouchers,
        winnersCount:   winners.length,
        lettersRevealedCount,
        winners: winners.filter(Boolean).map(w => ({
          voucherCode: w.code,
          position:    w.position,
          letter:      w.letter,
          status:      w.status,
          deviceId:    w.deviceId,
          ageGroup:    w.ageGroup,
          issuedAt:    w.issuedAt,
          scratchedAt: w.scratchedAt,
        })),
        coupleAttempts: parseInt(coupleAttempts || '0'),
        videoUnlocked:  videoUnlocked === 'true',
        nudgePending:   nudgePending === 'true',
        genderRevealed: genderRevealed === 'true',
        partyGender:    partyGender || null,
        actionLog:      (actionLog || []).slice(0, 15),
      });
    }

    // ── POST /api/admin/draw ─────────────────────────────────
    if (method === 'POST' && path === '/api/admin/draw') {

      const currentStatus = await env.GR_KV.get('draw_status');
      if (currentStatus === 'complete') {
        return error('Draw already completed — reset party to redraw');
      }

      const secretCode = (env.SECRET_CODE || '').toUpperCase().split('');
      if (secretCode.length !== 10) {
        return error('SECRET_CODE secret is not set to exactly 10 letters');
      }

      const pool = await env.GR_KV.get('eligible_pool', { type: 'json' }) || [];
      if (!pool.length) {
        return error('No eligible players in the pool yet');
      }

      // Layer 6 — max 1 voucher per device: shuffle then dedupe by deviceId
      const shuffled = shuffle(pool);
      const seen = new Set();
      const uniquePool = [];
      for (const entry of shuffled) {
        if (seen.has(entry.deviceId)) continue;
        seen.add(entry.deviceId);
        uniquePool.push(entry);
      }

      const totalVouchers = parseInt(env.TOTAL_VOUCHERS || '10');
      const winners = uniquePool.slice(0, totalVouchers);

      const results = [];
      for (let i = 0; i < winners.length; i++) {
        const entry  = winners[i];
        const code   = randomCode();
        const letter = secretCode[i];

        const voucherRecord = {
          code,
          letter,
          position:    i,
          status:      'pending',
          deviceId:    entry.deviceId,
          sessionId:   entry.sessionId,
          ageGroup:    entry.ageGroup,
          issuedAt:    Date.now(),
          scratchedAt: null,
        };

        await env.GR_KV.put(`voucher_${code}`, JSON.stringify(voucherRecord));
        await env.GR_KV.put(`winner_device_${entry.deviceId}`, JSON.stringify({
          voucherCode: code, letter, position: i,
        }));

        results.push({ voucherCode: code, deviceId: entry.deviceId, position: i });
      }

      await env.GR_KV.put('draw_status', 'complete');
      await env.GR_KV.put('draw_completed_at', Date.now().toString());
      await logAction('draw', { winnersCount: results.length });

      return json({ success: true, winnersCount: results.length, winners: results });
    }

    // ── POST /api/admin/nudge ────────────────────────────────
    if (method === 'POST' && path === '/api/admin/nudge') {
      await env.GR_KV.put('nudge_pending', 'true');
      await logAction('nudge');
      return json({ success: true });
    }

    // ── POST /api/admin/force-reveal ─────────────────────────
    if (method === 'POST' && path === '/api/admin/force-reveal') {
      const body = await request.json();
      const { voucherCode } = body;
      if (!voucherCode) return error('Missing voucherCode');

      const voucher = await env.GR_KV.get(`voucher_${voucherCode}`, { type: 'json' });
      if (!voucher) return error('Voucher not found', 404);

      if (voucher.status !== 'revealed') {
        voucher.status      = 'revealed';
        voucher.scratchedAt = Date.now();
        voucher.revealedBy  = 'admin';
        await env.GR_KV.put(`voucher_${voucherCode}`, JSON.stringify(voucher));

        const revealed = await env.GR_KV.get('letters_revealed', { type: 'json' }) || [];
        if (!revealed.some(r => r.position === voucher.position)) {
          revealed.push({ position: voucher.position, letter: voucher.letter });
          await env.GR_KV.put('letters_revealed', JSON.stringify(revealed));
        }
      }

      await logAction('force-reveal', { voucherCode });
      return json({ success: true, voucherCode, letter: voucher.letter });
    }

    // ── POST /api/admin/reset-attempts ───────────────────────
    if (method === 'POST' && path === '/api/admin/reset-attempts') {
      await env.GR_KV.put('couple_attempts', '0');
      await logAction('reset-attempts');
      return json({ success: true });
    }

    // ── POST /api/admin/force-video ──────────────────────────
    if (method === 'POST' && path === '/api/admin/force-video') {
      await env.GR_KV.put('video_unlocked', 'true');
      await logAction('force-video');
      return json({ success: true });
    }

    // ── POST /api/admin/reset-party ──────────────────────────
    // Rehearsal/testing use — wipes state back to WAITING.
    // Does not touch device_/session_ history.
    if (method === 'POST' && path === '/api/admin/reset-party') {
      const body = await request.json().catch(() => ({}));
      if (body.confirm !== true) return error('Must confirm reset');

      const voucherList = await env.GR_KV.list({ prefix: 'voucher_' });
      const winnerList  = await env.GR_KV.list({ prefix: 'winner_device_' });

      await Promise.all([
        ...voucherList.keys.map(k => env.GR_KV.delete(k.name)),
        ...winnerList.keys.map(k => env.GR_KV.delete(k.name)),
        env.GR_KV.put('party_state', 'waiting'),
        env.GR_KV.delete('party_started_at'),
        env.GR_KV.delete('party_gender'),
        env.GR_KV.put('gender_revealed', 'false'),
        env.GR_KV.put('games_completed', '0'),
        env.GR_KV.put('active_players', '0'),
        env.GR_KV.put('eligible_pool', '[]'),
        env.GR_KV.put('draw_status', 'pending'),
        env.GR_KV.put('couple_attempts', '0'),
        env.GR_KV.put('video_unlocked', 'false'),
        env.GR_KV.put('nudge_pending', 'false'),
        env.GR_KV.put('letters_revealed', '[]'),
      ]);

      await logAction('reset-party');
      return json({ success: true });
    }

    return error('Not found', 404);
  },
};
