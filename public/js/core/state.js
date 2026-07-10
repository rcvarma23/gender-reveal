/**
 * PHASE 1 — CORE: Party State Manager
 * Polls Cloudflare Worker every 10 seconds
 * Drives the entire UI state machine:
 * waiting → active → finale → revealed
 */

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
      const response = await fetch('/api/party-state', {
        method:  'GET',
        headers: { 'Content-Type': 'application/json' },
        // Short timeout — we don't want guests stuck waiting
        signal:  AbortSignal.timeout(5000),
      });

      if (!response.ok) return;

      const data = await response.json();
      handleStateUpdate(data);

    } catch (err) {
      // Network error — keep showing current state silently
      console.warn('[PartyState] Poll failed:', err.message);
    }
  };

  const handleStateUpdate = (data) => {
    const newState = data.state;

    // State changed — fire handlers
    if (newState !== lastKnownState) {
      const prevState   = lastKnownState;
      lastKnownState    = newState;
      currentState      = newState;

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
      console.error('[PartyState] Transition failed:', err);
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
  };

})();

export default PartyState;
