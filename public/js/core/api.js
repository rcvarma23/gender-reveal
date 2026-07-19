/**
 * PHASE 1 — CORE: API Client
 * Single source of truth for all Worker API calls
 * Handles: auth headers, errors, retries, timeouts
 */

import DeviceManager from './device.js';

const API = (() => {

  const BASE         = '/api';
  const TIMEOUT_MS   = 8000;

  // ─── REQUEST HELPER ────────────────────────────────────────

  const request = async (path, options = {}) => {
    const deviceInfo = await DeviceManager.getDeviceInfo();

    const headers = {
      'Content-Type':     'application/json',
      'X-Device-Id':      deviceInfo.deviceId,
      'X-Fingerprint':    deviceInfo.fingerprint,
      'X-Is-Mobile':      deviceInfo.isMobile ? '1' : '0',
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(`${BASE}${path}`, {
        ...options,
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Request failed', status: response.status, data };
      }

      return { success: true, ...data };

    } catch (err) {
      if (err.name === 'TimeoutError') {
        return { success: false, error: 'Request timed out — check your connection' };
      }
      return { success: false, error: err.message };
    }
  };

  const get  = (path, headers = {})      => request(path, { method: 'GET', headers });
  const post = (path, body = {}, headers = {}) =>
    request(path, { method: 'POST', body: JSON.stringify(body), headers });

  // ─── PARTY STATE ───────────────────────────────────────────

  const partyState = {
    get:        ()          => get('/party-state'),
    set:        (state, token) => post('/party-state', { state }, { 'X-Admin-Token': token }),
  };

  // ─── SESSION ───────────────────────────────────────────────

  const session = {
    /**
     * Register new player session on server
     * Server validates: cooldown, device cap
     */
    create: (sessionId, ageGroup) =>
      post('/session/create', { sessionId, ageGroup }),

    /**
     * Mark session complete + trigger speed validation
     * Server also checks for tab farming flag
     */
    complete: (sessionId, completionData) =>
      post('/session/complete', { sessionId, ...completionData }),

    /**
     * Check resume state for this device
     */
    resume: (sessionId) =>
      get(`/session/resume/${sessionId}`),
  };

  // ─── VOUCHER ───────────────────────────────────────────────

  const voucher = {
    /**
     * Request voucher eligibility check
     * Server runs ALL 8 anti-cheat layers atomically
     * Returns: { eligible: bool, voucherCode?, letter? }
     */
    request: (sessionId) =>
      post('/voucher/request', { sessionId }),

    /**
     * Mark voucher as scratched — reveal the letter
     */
    scratch: (voucherCode) =>
      post('/voucher/scratch', { voucherCode }),

    /**
     * Get status of a specific voucher (for resume)
     */
    status: (voucherCode) =>
      get(`/voucher/status/${voucherCode}`),
  };

  // ─── STICKERS ──────────────────────────────────────────────

  const stickers = {
    /**
     * Earn a sticker after kid game completion
     * Server picks weighted random sticker
     */
    earn: (sessionId, gameType) =>
      post('/sticker/earn', { sessionId, gameType }),

    /**
     * Get all stickers earned by this device
     */
    collection: () =>
      get('/sticker/collection'),

    /**
     * Unlock secret reveal sticker (triggered by gender reveal)
     */
    unlockReveal: () =>
      post('/sticker/unlock-reveal', {}),
  };

  // ─── ADMIN ─────────────────────────────────────────────────

  const admin = {
    /**
     * Verify admin PIN — returns short-lived token
     */
    login: (pinHash) =>
      post('/admin/login', { pinHash }),

    /**
     * Get live dashboard stats
     */
    stats: (token) =>
      get('/admin/stats', { 'X-Admin-Token': token }),

    /**
     * Trigger winner draw
     */
    draw: (token) =>
      post('/admin/draw', {}, { 'X-Admin-Token': token }),

    /**
     * Nudge pending winners (shows alert on their screen)
     */
    nudge: (token) =>
      post('/admin/nudge', {}, { 'X-Admin-Token': token }),

    /**
     * Force reveal a pending letter (winner left without scratching)
     */
    forceReveal: (voucherCode, token) =>
      post('/admin/force-reveal', { voucherCode }, { 'X-Admin-Token': token }),

    /**
     * Reset couple attempt counter
     */
    resetAttempts: (token) =>
      post('/admin/reset-attempts', {}, { 'X-Admin-Token': token }),

    /**
     * Force trigger video reveal (admin override)
     */
    forceVideo: (token) =>
      post('/admin/force-video', {}, { 'X-Admin-Token': token }),

    /**
     * Wipe party state back to WAITING (rehearsal/testing use)
     */
    resetParty: (token) =>
      post('/admin/reset-party', { confirm: true }, { 'X-Admin-Token': token }),

    /**
     * Finale — unlock/lock one age group's games while state is 'finale'
     */
    finaleGroupToggle: (group, unlocked, token) =>
      post('/admin/finale-group-toggle', { group, unlocked }, { 'X-Admin-Token': token }),

    /**
     * Finale — one click: unlock exactly toddler+kid+teen, leave adult+bigguess locked
     */
    finaleUnlockKids: (token) =>
      post('/admin/finale-unlock-kids', {}, { 'X-Admin-Token': token }),

    /**
     * Opinion Poll — un-gray the adult game card
     */
    pollEnable: (token) =>
      post('/admin/poll/enable', {}, { 'X-Admin-Token': token }),

    /**
     * Opinion Poll — begin question 1 (server-timed from here on)
     */
    pollStart: (token) =>
      post('/admin/poll/start', {}, { 'X-Admin-Token': token }),

    /**
     * Opinion Poll — clear votes/results, back to disabled
     */
    pollReset: (token) =>
      post('/admin/poll/reset', {}, { 'X-Admin-Token': token }),

    /**
     * Opinion Poll — past completed runs (survives resets)
     */
    pollHistory: (token) =>
      get('/admin/poll/history', { 'X-Admin-Token': token }),
  };

  // ─── COUPLE GAME ───────────────────────────────────────────

  const couple = {
    /**
     * Verify couple PIN
     */
    verifyPin: (pinHash) =>
      post('/couple/verify-pin', { pinHash }),

    /**
     * Submit collected letters — check 7/10 match
     */
    checkLetters: (letters, token) =>
      post('/couple/check-letters', { letters }, { 'X-Couple-Token': token }),

    /**
     * Record an attempt — server increments counter
     * On attempt 3: server returns signed video URL
     */
    attempt: (attemptData, token) =>
      post('/couple/attempt', attemptData, { 'X-Couple-Token': token }),

    /**
     * Get current game status
     */
    status: (token) =>
      get('/couple/status', { 'X-Couple-Token': token }),

    /**
     * Flip party to REVEALED. Called automatically by tv-mode.html — gender
     * comes from the PARTY_GENDER secret server-side unless explicitly passed.
     */
    reveal: (token, gender) =>
      post('/couple/reveal', gender ? { gender } : {}, { 'X-Couple-Token': token }),
  };

  // ─── OPINION POLL ──────────────────────────────────────────

  const poll = {
    /**
     * Current poll status/phase/question/timer — guests + host TV poll this
     */
    state: () =>
      get('/poll/state'),

    /**
     * Cast a vote for the active question (1 per device per question)
     */
    vote: (questionIndex, choiceIndex) =>
      post('/poll/vote', { questionIndex, choiceIndex }),

    /**
     * Final per-question results, once the poll is complete
     */
    final: () =>
      get('/poll/final'),
  };

  // ─── PUBLIC API ────────────────────────────────────────────

  return {
    partyState,
    session,
    voucher,
    stickers,
    admin,
    couple,
    poll,
  };

})();

export default API;
