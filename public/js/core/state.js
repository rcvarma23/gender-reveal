/**
 * PHASE 1 — CORE: Party State Manager
 * Polls Cloudflare Worker every 10 seconds
 * Drives the entire UI state machine:
 * waiting → active → finale → revealed
 */

import DeviceManager from './device.js';
import createLogger  from './logger.js';

const log = createLogger('PartyState');

const PartyState = (() => {

  // ─── STATE MACHINE ─────────────────────────────────────────

  const STATES = {
    WAITING:  'waiting',    // Admin hasn't started yet
    ACTIVE:   'active',     // Games open — everyone playing
    FINALE:   'finale',     // Games locked — couple's game only
    REVEALED: 'revealed',   // Gender video has played
  };

  let currentState        = STATES.WAITING;
  let pollInterval        = null;
  let lastKnownState      = null;
  let stateChangeHandlers = {};
  let genderRevealed      = null;   // 'girl' | 'boy' | null
  let hasPolledServer     = false;  // becomes true after the first real server poll

  // ─── POLLING ───────────────────────────────────────────────

  const POLL_INTERVAL_MS = 10_000;   // 10 seconds

  /**
   * Start polling party state from server
   * Calls registered handlers on state change
   */
  const startPolling = (onStateChange) => {
    if (typeof onStateChange === 'function') {
      stateChangeHandlers['default'] = onStateChange;
    }

    // Poll immediately then on interval
    pollState();
    pollInterval = setInterval(pollState, POLL_INTERVAL_MS);

    // Also poll when tab comes back into focus
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pollState();
    });
  };

  const stopPolling = () => {
    if (pollInterval) clearInterval(pollInterval);
  };

  const pollState = async () => {
    try {
      const deviceId = DeviceManager.getDeviceId();
      const response = await fetch('/api/party-state', {
        method:  'GET',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
        // Short timeout — we don't want guests stuck waiting
        signal:  AbortSignal.timeout(5000),
      });

      if (!response.ok) { log.warn('Poll returned non-OK status', response.status); return; }

      const data = await response.json();
      log.debug('Poll response', data);
      handleResetEpoch(data);
      handleStateUpdate(data);

    } catch (err) {
      // Network error — keep showing current state silently
      log.warn('Poll failed:', err.message);
    }
  };

  // ─── RESET DETECTION ─────────────────────────────────────────

  const RESET_EPOCH_KEY = 'gr_reset_epoch';

  /**
   * Admin's "reset party" bumps a server-side epoch timestamp. When a
   * guest's poll sees a newer epoch than the one it last saw, the party
   * was reset server-side — wipe this device's local session/cooldown
   * cache too, instead of leaving stale data until the guest manually
   * closes their browser.
   */
  const handleResetEpoch = (data) => {
    if (!data.resetEpoch || data.resetEpoch === '0') return;
    const seen = localStorage.getItem(RESET_EPOCH_KEY);

    // Deliberately no "first time seen, just record it" bypass — a device
    // that already has stale session/voucher/cooldown data from BEFORE
    // it ever polled (e.g. it played, then the party was reset while this
    // device was closed) must still get cleared on its very next poll,
    // even though that reset is the first epoch this device has ever
    // observed. Treating null as "different" costs one harmless extra
    // reload for a genuinely brand-new device, which is an acceptable
    // trade for actually honoring every reset.
    if (data.resetEpoch !== seen) {
      log.info('Party reset detected — clearing local session cache', { seen, now: data.resetEpoch });
      const keepKeys = new Set(['gr_device_id', 'gr_fingerprint', 'gr_device_created']);
      Object.keys(localStorage)
        .filter(k => k.startsWith('gr_') && !keepKeys.has(k))
        .forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
      localStorage.setItem(RESET_EPOCH_KEY, data.resetEpoch);
      window.location.reload();
    }
  };

  const handleStateUpdate = (data) => {
    const newState = data.state;

    // State changed — fire handlers. Always fire on the first real server
    // poll too, even if a page had pre-seeded lastKnownState from a stale
    // sessionStorage cache (restoreFromCache()) that happens to match —
    // otherwise a page that trusted a cached 'revealed'/'waiting' value
    // would never get corrected once the server confirms the real state.
    const isFirstPoll = !hasPolledServer;
    hasPolledServer = true;
    if (newState !== lastKnownState || isFirstPoll) {
      const prevState   = lastKnownState;
      lastKnownState    = newState;
      currentState      = newState;

      log.info(`State change: ${prevState} -> ${newState}`);

      // Store gender if revealed
      if (data.gender) genderRevealed = data.gender;

      // Fire specific handlers first
      if (stateChangeHandlers[newState]) {
        stateChangeHandlers[newState](data, prevState);
      }

      // Fire general handler
      if (stateChangeHandlers['default']) {
        stateChangeHandlers['default'](newState, data, prevState);
      }

      // Store in session storage for fast access
      sessionStorage.setItem('gr_party_state', newState);
      if (data.gender) sessionStorage.setItem('gr_gender', data.gender);
    }

    // Always update winner flag
    if (data.isWinner !== undefined) {
      sessionStorage.setItem('gr_is_winner', data.isWinner ? 'true' : 'false');
      sessionStorage.setItem('gr_voucher_code', data.voucherCode || '');
    }

    maybeRedirectToVoucher(data);
  };

  // ─── WINNER REDIRECT ───────────────────────────────────────

  // Only auto-redirect from the "hub" pages — never yank a guest away
  // mid-game on a game-*.html page just because a draw landed.
  // Wrangler serves assets on extensionless paths (play.html -> play),
  // so match both forms.
  const AUTO_REDIRECT_PAGES = ['index.html', 'index', 'play.html', 'play', ''];

  // Set once the guest has actually seen their revealed letter (see
  // acknowledgeLetter below). The server keeps reporting isWinner/letter
  // forever once scratched, so without this a guest who taps "Back to
  // Party" would land on play.html/index.html only to be immediately
  // bounced right back to letter.html by the very next poll.
  const LETTER_ACK_KEY = 'gr_letter_ack';

  const acknowledgeLetter = (voucherCode) => {
    if (voucherCode) localStorage.setItem(LETTER_ACK_KEY, voucherCode);
  };

  const maybeRedirectToVoucher = (data) => {
    if (!data.isWinner) return;
    const page = location.pathname.split('/').pop();
    if (!AUTO_REDIRECT_PAGES.includes(page)) return;

    if (data.letter && localStorage.getItem(LETTER_ACK_KEY) === data.voucherCode) {
      return; // already shown and acknowledged — let the guest stay put
    }

    log.info('Winner redirect triggered', { page, hasLetter: !!data.letter });
    window.location.href = data.letter ? 'letter.html' : 'scratch.html';
  };

  // ─── STATE CHANGE HANDLERS ─────────────────────────────────

  /**
   * Register handlers for specific state transitions
   * Usage: PartyState.on('active', (data) => showGameUI())
   */
  const on = (state, handler) => {
    stateChangeHandlers[state] = handler;
  };

  // ─── STATE TRANSITIONS (Admin only) ────────────────────────

  const transitionTo = async (newState, adminToken) => {
    log.info('Requesting transition to', newState);
    try {
      const response = await fetch('/api/party-state', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'X-Admin-Token': adminToken,
        },
        body: JSON.stringify({ state: newState }),
      });

      const data = await response.json();
      if (data.success) {
        handleStateUpdate({ state: newState });
      }
      return data;
    } catch (err) {
      log.error('Transition failed:', err);
      return { success: false, error: err.message };
    }
  };

  // ─── GETTERS ───────────────────────────────────────────────

  const getState      = () => currentState;
  const getGender     = () => genderRevealed;
  const isWaiting     = () => currentState === STATES.WAITING;
  const isActive      = () => currentState === STATES.ACTIVE;
  const isFinale      = () => currentState === STATES.FINALE;
  const isRevealed    = () => currentState === STATES.REVEALED;

  // Restore from session storage (fast — avoids first-load flash)
  const restoreFromCache = () => {
    const cached = sessionStorage.getItem('gr_party_state');
    if (cached) {
      currentState   = cached;
      lastKnownState = cached;
    }
    const gender = sessionStorage.getItem('gr_gender');
    if (gender) genderRevealed = gender;
    return cached;
  };

  // ─── PUBLIC API ────────────────────────────────────────────

  return {
    STATES,
    startPolling,
    stopPolling,
    pollState,
    on,
    transitionTo,
    getState,
    getGender,
    isWaiting,
    isActive,
    isFinale,
    isRevealed,
    restoreFromCache,
    acknowledgeLetter,
  };

})();

export default PartyState;
