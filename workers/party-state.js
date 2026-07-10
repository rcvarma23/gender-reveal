/**
 * CLOUDFLARE WORKER W1 — Party State Controller
 * Handles: GET /api/party-state  (guests poll this every 10s)
 *          POST /api/party-state (admin changes state)
 *
 * KV keys used:
 *   party_state          → waiting | active | finale | revealed
 *   party_started_at     → timestamp
 *   party_gender         → girl | boy (set at reveal)
 *   draw_complete        → bool
 *   gender_revealed      → bool
 *   nudge_pending        → bool (set by admin to alert winners)
 *   winner_{sessionId}   → { voucherCode, letter } (set after draw)
 */

export default {
  async fetch(request, env) {

    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // CORS headers for all responses
    const cors = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-Device-Id, X-Fingerprint, X-Is-Mobile',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...cors },
      });

    const error = (msg, status = 400) => json({ success: false, error: msg }, status);

    // ── GET /api/party-state ─────────────────────────────────
    // Called by every guest every 10 seconds
    // Must be fast — served from KV edge cache
    if (method === 'GET' && path === '/api/party-state') {

      const deviceId    = request.headers.get('X-Device-Id');
      const state       = await env.GR_KV.get('party_state') || 'waiting';
      const gender      = await env.GR_KV.get('party_gender') || null;
      const nudgePending = await env.GR_KV.get('nudge_pending') === 'true';

      // Check if this device is a winner (post-draw)
      let isWinner    = false;
      let voucherCode = null;
      let letter      = null;

      if (deviceId && state === 'active') {
        const winnerData = await env.GR_KV.get(`winner_device_${deviceId}`, { type: 'json' });
        if (winnerData) {
          isWinner    = true;
          voucherCode = winnerData.voucherCode;
          letter      = winnerData.letter;
        }
      }

      // Clear nudge flag after delivering it
      if (nudgePending) {
        await env.GR_KV.put('nudge_pending', 'false');
      }

      return json({
        state,
        gender,
        isWinner,
        voucherCode,
        letter,
        nudge:        nudgePending,
        timestamp:    Date.now(),
      });
    }

    // ── POST /api/party-state ────────────────────────────────
    // Admin only — change party state
    if (method === 'POST' && path === '/api/party-state') {

      // Validate admin token
      const adminToken = request.headers.get('X-Admin-Token');
      const validToken = await env.GR_KV.get('admin_session_token');
      if (!adminToken || adminToken !== validToken) {
        return error('Unauthorized', 401);
      }

      const body     = await request.json();
      const newState = body.state;

      const validStates  = ['waiting', 'active', 'finale', 'revealed'];
      if (!validStates.includes(newState)) {
        return error('Invalid state');
      }

      // State transition guards
      const currentState = await env.GR_KV.get('party_state') || 'waiting';
      const transitions  = {
        waiting:  ['active'],
        active:   ['waiting', 'finale'],
        finale:   ['active', 'revealed'],
        revealed: [],   // terminal state
      };

      if (!transitions[currentState]?.includes(newState)) {
        // Allow admin override with force flag
        if (!body.force) {
          return error(`Cannot transition from ${currentState} to ${newState}`);
        }
      }

      // Write new state
      await env.GR_KV.put('party_state', newState);
      await env.GR_KV.put('party_state_changed_at', Date.now().toString());
      await env.GR_KV.put(`state_log_${Date.now()}`, JSON.stringify({
        from:  currentState,
        to:    newState,
        admin: adminToken.substring(0, 8),
        at:    Date.now(),
      }));

      // Special handling per state
      if (newState === 'active') {
        await env.GR_KV.put('party_started_at', Date.now().toString());
      }

      if (newState === 'revealed' && body.gender) {
        await env.GR_KV.put('party_gender',      body.gender);
        await env.GR_KV.put('gender_revealed',   'true');
        await env.GR_KV.put('gender_revealed_at', Date.now().toString());
      }

      return json({ success: true, state: newState, previous: currentState });
    }

    return error('Not found', 404);
  },
};
