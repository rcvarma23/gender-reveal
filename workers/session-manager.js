/**
 * CLOUDFLARE WORKER W2 — Session Manager
 * All anti-cheat validation lives here server-side
 *
 * Routes:
 *   POST /api/session/create    → register new player session
 *   POST /api/session/complete  → lock session + speed check
 *   GET  /api/session/resume/:id → resume state for session
 *
 * Anti-cheat layers enforced:
 *   Layer 1 — Session lock (completed = blocked)
 *   Layer 2 — Speed validation (too fast = disqualified)
 *   Layer 3 — Device cooldown (15s between adult/teen sessions)
 *   Layer 5 — Fingerprint matching (incognito detection)
 *
 * (Removed) Layer 7 — kid-played-first gate for adult voucher eligibility.
 * Any adult who plays and clears speed/tab-farming checks is now eligible,
 * regardless of whether a kid played on the same device first. Admin
 * triggers the winner draw manually whenever they choose.
 */

// Must match COOLDOWNS in public/js/core/session.js and cooldownMs in
// public/config/game-config.js — this copy is the enforced source of truth.
const COOLDOWNS = {
  adult:   15 * 1000,
  teen:    15 * 1000,
  kid:     0,
  toddler: 0,
};

const MIN_GAME_SECONDS = {
  toddler: 15,
  kid:     20,
  teen:    30,
  adult:   45,
};

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

    const deviceId     = request.headers.get('X-Device-Id');
    const fingerprint  = request.headers.get('X-Fingerprint');

    if (!deviceId) return error('Missing device ID', 401);

    // ── POST /api/session/create ─────────────────────────────
    if (method === 'POST' && path === '/api/session/create') {

      const body      = await request.json();
      const { sessionId, ageGroup } = body;

      if (!sessionId || !ageGroup) return error('Missing sessionId or ageGroup');

      // Check party is active — or, during finale, that this age group has
      // been individually re-opened by the admin (see finale_unlocked_groups
      // in workers/party-state.js).
      const partyState = await env.GR_KV.get('party_state');
      if (partyState === 'waiting' || partyState === 'revealed' || !partyState) {
        return json({ success: true, status: 'party_not_active', partyState });
      }
      if (partyState === 'finale') {
        const unlocked = await env.GR_KV.get('finale_unlocked_groups', { type: 'json' }) || [];
        if (!unlocked.includes(ageGroup)) {
          return json({ success: true, status: 'party_not_active', partyState });
        }
      }

      // Get device record
      const deviceKey  = `device_${deviceId}`;
      const deviceData = await env.GR_KV.get(deviceKey, { type: 'json' }) || {
        deviceId,
        fingerprints:     [],
        totalSessions:    0,
        vouchersIssued:   0,
        kidPlayedFirst:   false,
        // Cooldown clock per age group — adult and teen are independent
        // people on a shared phone with different cooldown durations, so
        // one flat timestamp would let an adult's play cooldown-block a
        // teen (or vice versa) using the wrong duration.
        lastCompletionByGroup: {},
        sessions:         [],
        flagged:          false,
      };

      // ── ANTI-CHEAT: Cooldown check ───────────────────────
      const cooldown = COOLDOWNS[ageGroup] || 0;
      const lastCompletionForGroup = deviceData.lastCompletionByGroup?.[ageGroup];
      if (cooldown && lastCompletionForGroup) {
        const elapsed   = Date.now() - lastCompletionForGroup;
        const remaining = cooldown - elapsed;
        if (remaining > 0) {
          console.log(`[SessionManager] cooldown block device=${deviceId} ageGroup=${ageGroup} remainingSec=${Math.ceil(remaining / 1000)}`);
          return json({
            success:   false,
            reason:    'cooldown',
            remaining: Math.ceil(remaining / 1000),
            message:   `Please wait ${Math.ceil(remaining / 1000)} more second(s)`,
          });
        }
      }

      // ── ANTI-CHEAT: Fingerprint tracking ────────────────
      if (fingerprint && !deviceData.fingerprints.includes(fingerprint)) {
        deviceData.fingerprints.push(fingerprint);
      }

      // ── Kid-played-first gate for adult vouchers ─────────
      const isKid    = ['toddler', 'kid'].includes(ageGroup);
      const isAdult  = ['adult', 'teen'].includes(ageGroup);

      // Register session in KV
      const sessionData = {
        sessionId,
        deviceId,
        ageGroup,
        isKid,
        isAdult,
        fingerprint,
        status:          'active',
        voucherEligible: false,    // set after speed validation on complete
        voucherDisqualified: false,
        disqualifyReason: null,
        startedAt:       Date.now(),
        completedAt:     null,
        score:           0,
        gameType:        null,
      };

      await env.GR_KV.put(`session_${sessionId}`, JSON.stringify(sessionData));

      // Update device record
      deviceData.totalSessions++;
      deviceData.sessions = [...(deviceData.sessions || []), {
        id:        sessionId,
        ageGroup,
        startedAt: Date.now(),
      }];
      await env.GR_KV.put(deviceKey, JSON.stringify(deviceData));

      // Increment active player count
      const count = parseInt(await env.GR_KV.get('active_players') || '0') + 1;
      await env.GR_KV.put('active_players', count.toString());

      return json({ success: true, sessionId, ageGroup, kidPlayedFirst: deviceData.kidPlayedFirst });
    }

    // ── POST /api/session/complete ───────────────────────────
    if (method === 'POST' && path === '/api/session/complete') {

      const body = await request.json();
      const { sessionId, score, gameType, startedAt, tabFarming } = body;

      const sessionData = await env.GR_KV.get(`session_${sessionId}`, { type: 'json' });
      if (!sessionData) return error('Session not found');
      if (sessionData.status === 'completed') {
        return json({ success: true, alreadyCompleted: true, status: 'locked' });
      }

      // ── ANTI-CHEAT: Speed validation ─────────────────────
      const elapsedSeconds = (Date.now() - (startedAt || sessionData.startedAt)) / 1000;
      const minSeconds     = MIN_GAME_SECONDS[sessionData.ageGroup] || 20;
      const tooFast        = elapsedSeconds < minSeconds;

      // ── ANTI-CHEAT: Tab farming flag ──────────────────────
      const farmed = tabFarming === true;

      // Determine voucher eligibility (adults/teens only)
      const deviceData = await env.GR_KV.get(`device_${deviceId}`, { type: 'json' });
      const isKid      = sessionData.isKid;

      let voucherEligible    = false;
      let disqualifyReason   = null;

      if (!isKid) {
        if (tooFast) {
          disqualifyReason = 'speed';
        } else if (farmed) {
          disqualifyReason = 'tab_farming';
        } else {
          voucherEligible = true;
        }
      }

      // Lock the session
      const completed = {
        ...sessionData,
        status:             'completed',
        score,
        gameType,
        elapsedSeconds,
        completedAt:        Date.now(),
        voucherEligible,
        voucherDisqualified: !isKid && !voucherEligible,
        disqualifyReason,
        tooFast,
        tabFarmed:          farmed,
      };
      await env.GR_KV.put(`session_${sessionId}`, JSON.stringify(completed));
      console.log(`[SessionManager] session complete id=${sessionId} ageGroup=${sessionData.ageGroup} voucherEligible=${voucherEligible} disqualifyReason=${disqualifyReason || 'none'}`);

      // Update device: mark kid played, update last completion time.
      // Cooldowns only apply to adult/teen (COOLDOWNS.kid/toddler = 0), so
      // only they should set a cooldown timestamp — otherwise a kid
      // finishing their turn would immediately cooldown-block the very
      // next adult attempt on the same phone, breaking the kid-first-then-
      // adult flow. The timestamp is keyed by ageGroup so an adult's play
      // never cooldown-blocks a teen (or vice versa) on the same device.
      if (isKid) {
        deviceData.kidPlayedFirst = true;
      } else {
        deviceData.lastCompletionByGroup = {
          ...(deviceData.lastCompletionByGroup || {}),
          [sessionData.ageGroup]: Date.now(),
        };
      }
      await env.GR_KV.put(`device_${deviceId}`, JSON.stringify(deviceData));

      // Update completed games counter
      const gamesCount = parseInt(await env.GR_KV.get('games_completed') || '0') + 1;
      await env.GR_KV.put('games_completed', gamesCount.toString());

      // Add to eligible pool if voucher eligible
      if (voucherEligible) {
        const pool = await env.GR_KV.get('eligible_pool', { type: 'json' }) || [];
        pool.push({ sessionId, deviceId, ageGroup: sessionData.ageGroup, addedAt: Date.now() });
        await env.GR_KV.put('eligible_pool', JSON.stringify(pool));
      }

      return json({
        success:          true,
        status:           'completed',
        voucherEligible,
        disqualifyReason,
        isKid,
      });
    }

    // ── GET /api/session/resume/:id ──────────────────────────
    if (method === 'GET' && path.startsWith('/api/session/resume/')) {
      const sessionId   = path.split('/').pop();
      const sessionData = await env.GR_KV.get(`session_${sessionId}`, { type: 'json' });

      if (!sessionData) return json({ exists: false });

      return json({
        exists:         true,
        status:         sessionData.status,
        voucherAwarded: !!sessionData.voucherCode,
        voucherCode:    sessionData.voucherCode || null,
        letterRevealed: sessionData.letterRevealed || false,
        letter:         sessionData.letter || null,
      });
    }

    return error('Not found', 404);
  },
};
