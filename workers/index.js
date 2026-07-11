/**
 * Single Worker entrypoint — dispatches by path prefix to each API module.
 * wrangler.toml can only point `main` at one file, so routing across the
 * separate W1–W6 worker files has to happen here rather than via
 * per-script [[routes]] (that shape is for zone-routed multi-worker
 * deployments, not a single project's local dev/build).
 */

import partyState from './party-state.js';
import sessionManager from './session-manager.js';
import voucherEngine from './voucher-engine.js';
import stickerSystem from './sticker-system.js';
import adminControls from './admin-controls.js';
import coupleGame from './couple-game.js';

const routes = [
  ['/api/party-state', partyState],
  ['/api/session/', sessionManager],
  ['/api/voucher/', voucherEngine],
  ['/api/sticker/', stickerSystem],
  ['/api/admin/', adminControls],
  ['/api/couple/', coupleGame],
];

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    for (const [prefix, worker] of routes) {
      if (path === prefix || path.startsWith(prefix)) {
        return worker.fetch(request, env, ctx);
      }
    }
    return new Response('Not found', { status: 404 });
  },
};
