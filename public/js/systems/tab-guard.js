/**
 * PHASE 1 — SYSTEM: Tab Guard
 * Detects when the same device opens multiple game tabs simultaneously
 * Uses BroadcastChannel — zero server calls, device-local
 *
 * Anti-cheat Layer 4: Tab Farming Detection
 * If multiple game tabs open on same device → silently disqualify all from vouchers
 */

const TabGuard = (() => {

  let channel       = null;
  let myTabId       = null;
  let myDeviceId    = null;
  let activeTabs    = new Set();
  let isFarming     = false;
  let farmingFlag   = false;     // latched — stays true once detected
  let onFarmDetected = null;     // optional callback

  // ─── INIT ──────────────────────────────────────────────────

  /**
   * Initialise tab guard for this game session
   * Call once per page load, as early as possible
   */
  const init = (deviceId, onFarm = null) => {
    myDeviceId    = deviceId;
    myTabId       = crypto.randomUUID();
    onFarmDetected = onFarm;

    // BroadcastChannel is supported in all modern browsers
    if (!('BroadcastChannel' in window)) {
      console.warn('[TabGuard] BroadcastChannel not supported — tab guard disabled');
      return { tabId: myTabId, isFarming: false };
    }

    channel = new BroadcastChannel('gr_game_tabs');

    // Announce this tab to others
    broadcast({ type: 'TAB_PING' });

    // Listen for responses from other tabs
    channel.onmessage = handleMessage;

    // Wait 300ms for PONG responses
    // If any come back, other tabs are open — farming detected
    setTimeout(checkFarmingStatus, 300);

    // Clean up on tab close
    window.addEventListener('pagehide', onTabClose);
    window.addEventListener('beforeunload', onTabClose);

    return {
      get tabId()    { return myTabId;    },
      get isFarming(){ return farmingFlag; },
    };
  };

  // ─── MESSAGE HANDLING ──────────────────────────────────────

  const handleMessage = (event) => {
    const { type, tabId, deviceId } = event.data;

    // Only care about same device
    if (deviceId !== myDeviceId) return;

    // Don't respond to self
    if (tabId === myTabId) return;

    if (type === 'TAB_PING') {
      // Another tab announced itself — respond
      activeTabs.add(tabId);
      broadcast({ type: 'TAB_PONG' });
      markFarming();
    }

    if (type === 'TAB_PONG') {
      // Response from an existing tab
      activeTabs.add(tabId);
      markFarming();
    }

    if (type === 'TAB_CLOSE') {
      activeTabs.delete(tabId);
      isFarming = activeTabs.size > 0;
      // Note: farmingFlag stays latched true — once caught, always flagged
    }

    if (type === 'TAB_GAME_COMPLETE') {
      // Another tab completed a game — mark this as coordinated farming
      activeTabs.add(tabId);
      farmingFlag = true;
    }
  };

  const checkFarmingStatus = () => {
    if (activeTabs.size > 0) markFarming();
  };

  const markFarming = () => {
    isFarming   = true;
    farmingFlag = true;   // latch — never goes back to false
    if (onFarmDetected) onFarmDetected();
  };

  // ─── BROADCAST HELPERS ─────────────────────────────────────

  const broadcast = (data) => {
    if (!channel) return;
    try {
      channel.postMessage({
        ...data,
        tabId:    myTabId,
        deviceId: myDeviceId,
        ts:       Date.now(),
      });
    } catch {}
  };

  /**
   * Announce that this tab completed a game
   * Other tabs that are mid-game will be flagged as farming
   */
  const announceGameComplete = () => {
    broadcast({ type: 'TAB_GAME_COMPLETE' });
  };

  /**
   * Announce that this tab started a game
   * Other tabs should show a warning
   */
  const announceGameStart = () => {
    broadcast({ type: 'TAB_GAME_START' });
  };

  // ─── CLEANUP ───────────────────────────────────────────────

  const onTabClose = () => {
    broadcast({ type: 'TAB_CLOSE' });
    if (channel) {
      channel.close();
      channel = null;
    }
  };

  const destroy = () => {
    onTabClose();
    window.removeEventListener('pagehide',    onTabClose);
    window.removeEventListener('beforeunload', onTabClose);
  };

  // ─── UI HELPER ─────────────────────────────────────────────

  /**
   * Show a friendly (non-accusatory) multi-tab warning modal
   */
  const showWarning = (onContinue) => {
    // Remove any existing warning
    document.getElementById('gr-tab-warning')?.remove();

    const overlay = document.createElement('div');
    overlay.id    = 'gr-tab-warning';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(8,7,23,0.92);
      display: flex; align-items: center; justify-content: center;
      padding: 1.5rem;
      backdrop-filter: blur(8px);
      animation: fadeIn 0.25s ease;
    `;

    overlay.innerHTML = `
      <div style="
        background: #1A1740;
        border: 1px solid rgba(201,168,76,0.3);
        border-radius: 1.25rem;
        padding: 2rem 1.5rem;
        max-width: 340px;
        width: 100%;
        text-align: center;
      ">
        <div style="font-size: 2.5rem; margin-bottom: 1rem;">🎮</div>
        <h3 style="
          font-family: 'Playfair Display', serif;
          color: #F0EAF8;
          margin-bottom: 0.75rem;
          font-size: 1.25rem;
        ">One Game at a Time!</h3>
        <p style="
          color: #B8AECE;
          font-size: 0.875rem;
          line-height: 1.6;
          margin-bottom: 1.5rem;
        ">
          This game is already open in another tab.<br>
          Close the other tab before continuing!
        </p>
        <button id="gr-tab-continue" style="
          width: 100%;
          padding: 0.8rem;
          background: linear-gradient(135deg, #C9A84C, #FFD700);
          color: #0D0B1E;
          border: none;
          border-radius: 999px;
          font-family: 'DM Sans', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
        ">I'm on One Tab — Continue</button>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('gr-tab-continue').onclick = () => {
      overlay.remove();
      if (onContinue) onContinue();
    };
  };

  // ─── PUBLIC API ────────────────────────────────────────────

  return {
    init,
    get isFarming() { return farmingFlag; },
    get activeTabCount() { return activeTabs.size; },
    announceGameStart,
    announceGameComplete,
    showWarning,
    destroy,
  };

})();

export default TabGuard;
