/**
 * PHASE 1 — CORE: Device Manager
 * Handles permanent device identity + browser fingerprinting
 * Lives in localStorage forever — survives all reloads
 */

const DeviceManager = (() => {

  const DEVICE_KEY    = 'gr_device_id';
  const FP_KEY        = 'gr_fingerprint';
  const CREATED_KEY   = 'gr_device_created';

  // ─── DEVICE ID ─────────────────────────────────────────────

  /**
   * Get or create permanent device ID
   * Format: GR-{timestamp}-{random9chars}
   * Example: GR-1714123456789-k7x2m9p4q
   */
  const getDeviceId = () => {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `GR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(DEVICE_KEY, id);
      localStorage.setItem(CREATED_KEY, Date.now().toString());
    }
    return id;
  };

  // ─── FINGERPRINTING ────────────────────────────────────────

  /**
   * Generate a browser fingerprint that survives:
   * - Page refresh        ✅
   * - Cache clear         ✅
   * - Incognito mode      ✅ (same device = same signals)
   * - Different browser   ~✅ (partial match still caught)
   */
  const generateFingerprint = async () => {

    // Collect browser signals
    const signals = {
      screen:       `${screen.width}x${screen.height}x${screen.colorDepth}`,
      timezone:     Intl.DateTimeFormat().resolvedOptions().timeZone,
      language:     navigator.language,
      languages:    (navigator.languages || []).join(','),
      platform:     navigator.platform || '',
      cores:        navigator.hardwareConcurrency || 0,
      memory:       navigator.deviceMemory || 0,
      touchPoints:  navigator.maxTouchPoints || 0,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack:   navigator.doNotTrack || '',
      pixelRatio:   window.devicePixelRatio || 1,
      colorScheme:  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      // Canvas fingerprint — unique per GPU/driver combo
      canvas:       getCanvasFingerprint(),
    };

    // Hash all signals into one string
    const raw     = JSON.stringify(signals);
    const hash    = await digestSHA256(raw);
    const fp      = `fp_${hash.substring(0, 16)}`;

    localStorage.setItem(FP_KEY, fp);
    return fp;
  };

  /**
   * Canvas fingerprinting — draws text with specific fonts
   * GPU renders it slightly differently per device
   */
  const getCanvasFingerprint = () => {
    try {
      const canvas  = document.createElement('canvas');
      canvas.width  = 200;
      canvas.height = 40;
      const ctx     = canvas.getContext('2d');

      ctx.fillStyle   = '#f60';
      ctx.fillRect(0, 0, 200, 40);
      ctx.fillStyle   = '#069';
      ctx.font        = '14px Arial';
      ctx.fillText('BabyReveal🎀2024', 10, 20);
      ctx.fillStyle   = 'rgba(102,204,0,0.7)';
      ctx.font        = '12px Georgia';
      ctx.fillText('GenderReveal✨', 10, 35);

      return canvas.toDataURL().substring(0, 100);
    } catch {
      return 'canvas-blocked';
    }
  };

  /**
   * SHA-256 hash via SubtleCrypto (available in all modern browsers)
   */
  const digestSHA256 = async (message) => {
    const msgBuffer  = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  /**
   * Get cached fingerprint or generate new one
   */
  const getFingerprint = async () => {
    const cached = localStorage.getItem(FP_KEY);
    if (cached) return cached;
    return generateFingerprint();
  };

  // ─── DEVICE INFO BUNDLE ────────────────────────────────────

  /**
   * Full device info sent with every API request
   */
  const getDeviceInfo = async () => ({
    deviceId:     getDeviceId(),
    fingerprint:  await getFingerprint(),
    createdAt:    localStorage.getItem(CREATED_KEY),
    userAgent:    navigator.userAgent.substring(0, 100),
    isMobile:     /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
    isIOS:        /iPhone|iPad|iPod/i.test(navigator.userAgent),
  });

  // ─── DEVICE DATA CACHE ─────────────────────────────────────

  /**
   * Store device-level data locally for fast access
   * Mirrors server KV but avoids unnecessary round trips
   */
  const getLocalDeviceData = () => {
    const raw = localStorage.getItem(`gr_device_data`);
    return raw ? JSON.parse(raw) : {
      vouchersIssued:    0,
      kidPlayedFirst:    false,
      totalSessions:     0,
      sessions:          [],
      stickers:          [],
      lastCompletionAt:  null,
    };
  };

  const setLocalDeviceData = (data) => {
    localStorage.setItem('gr_device_data', JSON.stringify(data));
  };

  const updateLocalDeviceData = (updates) => {
    const current = getLocalDeviceData();
    const merged  = { ...current, ...updates };
    setLocalDeviceData(merged);
    return merged;
  };

  // ─── PUBLIC API ────────────────────────────────────────────

  return {
    getDeviceId,
    getFingerprint,
    getDeviceInfo,
    getLocalDeviceData,
    setLocalDeviceData,
    updateLocalDeviceData,
  };

})();

export default DeviceManager;
