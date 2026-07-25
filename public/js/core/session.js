/**
 * PHASE 1 — CORE: Session Manager
 * Handles player sessions — one per human turn
 * Separates device identity from player identity
 * Manages kid/adult routing and handoff flow
 */

import DeviceManager from './device.js';
import createLogger  from './logger.js';

const log = createLogger('SessionManager');

const SessionManager = (() => {

  const CURRENT_SESSION_KEY = 'gr_current_session';
  const SESSION_PREFIX      = 'gr_session_';

  // ─── SESSION CREATION ──────────────────────────────────────

  /**
   * Create a new player session for a fresh human turn
   * Called when: new visitor, or "New Player" button tapped
   */
  const createSession = async (ageGroup) => {
    const deviceId  = DeviceManager.getDeviceId();
    const deviceData = DeviceManager.getLocalDeviceData();

    // Increment session counter for this device
    const sessionNum = (deviceData.totalSessions || 0) + 1;
    const sessionId  = `${deviceId}-P${sessionNum}`;

    const session = {
      sessionId,
      deviceId,
      sessionNum,
      ageGroup,                          // toddler | kid | teen | adult
      isKid:        ['toddler','kid'].includes(ageGroup),
      isAdult:      ['adult','teen'].includes(ageGroup),
      status:       'active',            // active | completed | locked | expired
      gameType:     null,                // set when game starts
      startedAt:    Date.now(),
      completedAt:  null,
      lockedAt:     null,
      voucherAwarded: false,
      voucherCode:  null,
      letter:       null,
      letterRevealed: false,
      stickersEarned: [],
      gameProgress: 0,                   // 0–100%
      score:        0,
      timerStart:   null,
      snapshotAt:   null,
    };

    log.info('Creating session', { sessionId, ageGroup });

    // Save locally
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
    saveSession(session);

    // Update device data
    DeviceManager.updateLocalDeviceData({
      totalSessions: sessionNum,
      lastSessionId: sessionId,
      sessions: [...(deviceData.sessions || []), {
        id:        sessionId,
        ageGroup,
        isKid:     session.isKid,
        status:    'active',
        startedAt: session.startedAt,
      }],
    });

    return session;
  };

  // ─── SESSION PERSISTENCE ───────────────────────────────────

  const saveSession = (session) => {
    localStorage.setItem(
      `${SESSION_PREFIX}${session.sessionId}`,
      JSON.stringify({ ...session, snapshotAt: Date.now() })
    );
  };

  const loadSession = (sessionId) => {
    const raw = localStorage.getItem(`${SESSION_PREFIX}${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  };

  const getCurrentSession = () => {
    const id = localStorage.getItem(CURRENT_SESSION_KEY);
    if (!id) return null;
    return loadSession(id);
  };

  const updateSession = (updates) => {
    const session = getCurrentSession();
    if (!session) return null;
    const updated = { ...session, ...updates, snapshotAt: Date.now() };
    saveSession(updated);
    return updated;
  };

  // ─── AUTO-SNAPSHOT ─────────────────────────────────────────

  let snapshotInterval = null;

  /**
   * Save game state every 3 seconds automatically
   * Survives: reload, tab close, iOS memory wipe, sleep
   */
  const startAutoSnapshot = (getStateFn) => {
    stopAutoSnapshot();
    snapshotInterval = setInterval(() => {
      const state = getStateFn();
      if (state) updateSession(state);
    }, 3000);

    // Save on page hide (covers iOS Safari)
    window.addEventListener('pagehide',       onPageHide);
    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload',   onBeforeUnload);
  };

  const stopAutoSnapshot  = () => {
    if (snapshotInterval) clearInterval(snapshotInterval);
    window.removeEventListener('pagehide',        onPageHide);
    window.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('beforeunload',    onBeforeUnload);
  };

  let _emergencyStateFn = null;
  const setEmergencyStateFn = (fn) => { _emergencyStateFn = fn; };

  const onPageHide         = () => { if (_emergencyStateFn) updateSession(_emergencyStateFn()); };
  const onVisibilityChange = () => { if (document.hidden && _emergencyStateFn) updateSession(_emergencyStateFn()); };
  const onBeforeUnload     = () => { if (_emergencyStateFn) updateSession(_emergencyStateFn()); };

  // ─── SESSION LOCKING ───────────────────────────────────────

  /**
   * Lock session after game completion — no replays
   * This is enforced BOTH locally and server-side (KV)
   */
  const lockSession = (additionalData = {}) => {
    return updateSession({
      status:      'completed',
      lockedAt:    Date.now(),
      lockedOut:   true,
      ...additionalData,
    });
  };

  const isSessionLocked = (session) => {
    if (!session) return false;
    return session.lockedOut === true || session.status === 'completed';
  };

  // ─── EXPIRY CHECK ──────────────────────────────────────────

  const SESSION_EXPIRY = {
    toddler: 2 * 60 * 60 * 1000,
    kid:     2 * 60 * 60 * 1000,
    teen:    1 * 60 * 60 * 1000,
    adult:   90 * 60 * 1000,
    couple:  999 * 60 * 60 * 1000,   // never expires
  };

  const isSessionExpired = (session) => {
    if (!session || !session.startedAt) return true;
    if (session.ageGroup === 'couple')  return false;
    const expiry = SESSION_EXPIRY[session.ageGroup] || 60 * 60 * 1000;
    return (Date.now() - session.startedAt) > expiry;
  };

  // ─── RESUME LOGIC ──────────────────────────────────────────

  /**
   * Check what to show on page load
   * Returns: 'fresh' | 'resume' | 'locked' | 'letter' | 'scratch'
   */
  const getResumeState = () => {
    const session = getCurrentSession();

    if (!session)                           return { action: 'fresh' };
    if (isSessionExpired(session))          return { action: 'fresh', reason: 'expired' };

    // Already revealed their letter — show it again
    if (session.letterRevealed)             return { action: 'letter',  session };

    // Won voucher but didn't scratch
    if (session.voucherCode && !session.letterRevealed)
                                            return { action: 'scratch', session };

    // Completed but no voucher — show results
    if (session.status === 'completed')     return { action: 'result',  session };

    // Mid-game
    if (session.gameProgress > 0)           return { action: 'resume',  session };

    return { action: 'fresh' };
  };

  // ─── ALL SESSIONS ON THIS DEVICE ───────────────────────────

  /**
   * Get all player sessions on this device
   * Used for the "who's playing?" picker screen
   */
  const getAllDeviceSessions = () => {
    const deviceId   = DeviceManager.getDeviceId();
    const deviceData = DeviceManager.getLocalDeviceData();
    const sessions   = (deviceData.sessions || []).map(s => {
      const full = loadSession(s.id);
      return full || s;
    });
    return sessions;
  };

  /**
   * Check if a kid has played on this device
   * Required gate before adult can get voucher
   */
  const kidPlayedOnDevice = () => {
    const deviceData = DeviceManager.getLocalDeviceData();
    return deviceData.kidPlayedFirst === true;
  };

  /**
   * Mark that a kid completed a game — unlocks adult voucher eligibility
   */
  const markKidPlayed = () => {
    DeviceManager.updateLocalDeviceData({ kidPlayedFirst: true });
  };

  // ─── COOLDOWN CHECK ────────────────────────────────────────

  // Must match COOLDOWNS in workers/session-manager.js (server is
  // authoritative — this copy is only for the pre-flight UI check before
  // hitting the server) and cooldownMs in public/config/game-config.js.
  const COOLDOWNS = {
    adult:   15 * 1000,
    teen:    15 * 1000,
    kid:     0,
    toddler: 0,
  };

  const getCooldownRemaining = (ageGroup) => {
    const cooldown = COOLDOWNS[ageGroup] || 0;
    if (!cooldown) return 0;

    const deviceData     = DeviceManager.getLocalDeviceData();
    // Each age group has its own cooldown clock — an adult's play must
    // never cooldown-block a teen's turn (or vice versa) on a shared phone.
    const lastCompletion = deviceData.lastCompletionByGroup?.[ageGroup];
    if (!lastCompletion) return 0;

    const elapsed  = Date.now() - lastCompletion;
    const remaining = cooldown - elapsed;
    log.debug('Cooldown check', { ageGroup, lastCompletion, elapsed, remaining: Math.max(0, remaining) });
    return Math.max(0, remaining);
  };

  const isOnCooldown = (ageGroup) => getCooldownRemaining(ageGroup) > 0;

  const recordCompletion = (ageGroup) => {
    log.info('Recording completion timestamp for cooldown clock', ageGroup);
    const deviceData = DeviceManager.getLocalDeviceData();
    DeviceManager.updateLocalDeviceData({
      lastCompletionByGroup: { ...(deviceData.lastCompletionByGroup || {}), [ageGroup]: Date.now() },
    });
  };

  // ─── TAB GUARD ─────────────────────────────────────────────

  /**
   * Detect if another tab on this device is already in an active game
   * Uses BroadcastChannel — device-local, zero server calls
   */
  const initTabGuard = () => {
    if (!('BroadcastChannel' in window)) return { isFarming: false };

    const myTabId   = crypto.randomUUID();
    const channel   = new BroadcastChannel('gr_game_tabs');
    const activeTabs = new Set();
    let isFarming   = false;

    // Announce this tab
    channel.postMessage({
      type:      'TAB_PING',
      tabId:     myTabId,
      deviceId:  DeviceManager.getDeviceId(),
      timestamp: Date.now(),
    });

    channel.onmessage = (event) => {
      const { type, tabId, deviceId } = event.data;
      if (deviceId !== DeviceManager.getDeviceId()) return;

      if (type === 'TAB_PING' && tabId !== myTabId) {
        activeTabs.add(tabId);
        // Respond so new tab knows about us
        channel.postMessage({ type: 'TAB_PONG', tabId: myTabId, deviceId });
      }
      if (type === 'TAB_PONG' && tabId !== myTabId) {
        activeTabs.add(tabId);
      }
      if (type === 'TAB_CLOSE') {
        activeTabs.delete(tabId);
      }

      isFarming = activeTabs.size > 0;
    };

    // Clean up on tab close
    window.addEventListener('pagehide', () => {
      channel.postMessage({ type: 'TAB_CLOSE', tabId: myTabId, deviceId: DeviceManager.getDeviceId() });
      channel.close();
    });

    return {
      get isFarming() { return activeTabs.size > 0; },
      tabId: myTabId,
      channel,
    };
  };

  // ─── PUBLIC API ────────────────────────────────────────────

  return {
    createSession,
    getCurrentSession,
    loadSession,
    updateSession,
    saveSession,
    lockSession,
    isSessionLocked,
    isSessionExpired,
    getResumeState,
    getAllDeviceSessions,
    kidPlayedOnDevice,
    markKidPlayed,
    getCooldownRemaining,
    isOnCooldown,
    recordCompletion,
    startAutoSnapshot,
    stopAutoSnapshot,
    setEmergencyStateFn,
    initTabGuard,
  };

})();

export default SessionManager;
