/**
 * CLOUDFLARE WORKER W3 — Voucher Engine
 * Routes:
 *   POST /api/voucher/request       → check/claim this device's voucher (post-draw)
 *   POST /api/voucher/scratch       → reveal the letter for a voucher this device owns
 *   GET  /api/voucher/status/:code  → read-only status check (used for resume)
 *
 * The actual random winner selection happens in admin-controls.js's
 * POST /api/admin/draw (layers 6 + 8 — device dedupe + hard 10 cap).
 * By the time a guest calls /voucher/request, `winner_device_{deviceId}`
 * either already exists or it doesn't — this worker only handles a
 * winner claiming and scratching their own voucher.
 *
 * KV keys used:
 *   winner_device_{id}   → { voucherCode, letter, position }   (written by admin/draw)
 *   voucher_{code}       → { code, letter, position, status, deviceId, sessionId,
 *                            ageGroup, issuedAt, scratchedAt }
 *   letters_revealed     → JSON array of { position, letter }
 *   session_{sessionId}  → updated with voucherCode/letterRevealed/letter on scratch
 */

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

    // ── POST /api/voucher/request ────────────────────────────
    if (method === 'POST' && path === '/api/voucher/request') {
      const body = await request.json().catch(() => ({}));
      const { sessionId } = body;

      const winnerData = await env.GR_KV.get(`winner_device_${deviceId}`, { type: 'json' });
      if (!winnerData) {
        return json({ success: true, hasVoucher: false });
      }

      const voucher = await env.GR_KV.get(`voucher_${winnerData.voucherCode}`, { type: 'json' });
      if (!voucher) return json({ success: true, hasVoucher: false });

      // Tie the voucher to the session record so /session/resume reflects it
      if (sessionId) {
        const sessionData = await env.GR_KV.get(`session_${sessionId}`, { type: 'json' });
        if (sessionData && sessionData.deviceId === deviceId && !sessionData.voucherCode) {
          sessionData.voucherCode = voucher.code;
          await env.GR_KV.put(`session_${sessionId}`, JSON.stringify(sessionData));
        }
      }

      return json({
        success:     true,
        hasVoucher:  true,
        voucherCode: voucher.code,
        status:      voucher.status,                                  // 'pending' | 'revealed'
        letter:      voucher.status === 'revealed' ? voucher.letter : null,
        position:    voucher.position,
      });
    }

    // ── POST /api/voucher/scratch ────────────────────────────
    if (method === 'POST' && path === '/api/voucher/scratch') {
      const body = await request.json().catch(() => ({}));
      const { voucherCode } = body;
      if (!voucherCode) return error('Missing voucherCode');

      // Only the device that actually won this voucher may scratch it
      const winnerData = await env.GR_KV.get(`winner_device_${deviceId}`, { type: 'json' });
      if (!winnerData || winnerData.voucherCode !== voucherCode) {
        return error('Voucher not found for this device', 403);
      }

      const voucher = await env.GR_KV.get(`voucher_${voucherCode}`, { type: 'json' });
      if (!voucher) return error('Voucher not found', 404);

      if (voucher.status !== 'revealed') {
        voucher.status      = 'revealed';
        voucher.scratchedAt = Date.now();
        await env.GR_KV.put(`voucher_${voucherCode}`, JSON.stringify(voucher));

        const revealed = await env.GR_KV.get('letters_revealed', { type: 'json' }) || [];
        if (!revealed.some(r => r.position === voucher.position)) {
          revealed.push({ position: voucher.position, letter: voucher.letter });
          await env.GR_KV.put('letters_revealed', JSON.stringify(revealed));
        }

        if (voucher.sessionId) {
          const sessionData = await env.GR_KV.get(`session_${voucher.sessionId}`, { type: 'json' });
          if (sessionData) {
            sessionData.voucherCode    = voucher.code;
            sessionData.letterRevealed = true;
            sessionData.letter         = voucher.letter;
            sessionData.letterPosition = voucher.position;
            await env.GR_KV.put(`session_${voucher.sessionId}`, JSON.stringify(sessionData));
          }
        }
      }

      return json({ success: true, voucherCode, letter: voucher.letter, position: voucher.position });
    }

    // ── GET /api/voucher/status/:code ────────────────────────
    if (method === 'GET' && path.startsWith('/api/voucher/status/')) {
      const code    = decodeURIComponent(path.split('/').pop());
      const voucher = await env.GR_KV.get(`voucher_${code}`, { type: 'json' });
      if (!voucher) return json({ success: true, exists: false });

      return json({
        success:  true,
        exists:   true,
        status:   voucher.status,
        letter:   voucher.status === 'revealed' ? voucher.letter : null,
        position: voucher.position,
      });
    }

    return error('Not found', 404);
  },
};
