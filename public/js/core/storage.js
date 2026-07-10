/**
 * PHASE 1 — CORE: Storage Manager
 * Safe localStorage wrapper with:
 * - Namespaced keys (all prefixed gr_)
 * - TTL / expiry support
 * - JSON serialisation built-in
 * - Silent error handling (private/restricted browsing)
 * - Storage quota detection
 */

const Storage = (() => {

  const PREFIX    = 'gr_';
  const SEPARATOR = '::';

  // ─── AVAILABILITY CHECK ────────────────────────────────────

  const isAvailable = (() => {
    try {
      const test = '__gr_test__';
      localStorage.setItem(test, '1');
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  })();

  // ─── KEY HELPERS ───────────────────────────────────────────

  const key  = (k) => `${PREFIX}${k}`;
  const unkey = (k) => k.startsWith(PREFIX) ? k.slice(PREFIX.length) : k;

  // ─── CORE SET / GET / REMOVE ───────────────────────────────

  /**
   * Set a value with optional TTL in milliseconds
   */
  const set = (k, value, ttlMs = null) => {
    if (!isAvailable) return false;
    try {
      const record = {
        v:  value,
        t:  Date.now(),
        ex: ttlMs ? Date.now() + ttlMs : null,
      };
      localStorage.setItem(key(k), JSON.stringify(record));
      return true;
    } catch (e) {
      // Storage quota exceeded or restricted
      console.warn('[Storage] set failed:', e.message);
      return false;
    }
  };

  /**
   * Get a value — returns null if missing or expired
   */
  const get = (k, defaultValue = null) => {
    if (!isAvailable) return defaultValue;
    try {
      const raw = localStorage.getItem(key(k));
      if (!raw) return defaultValue;

      const record = JSON.parse(raw);

      // Check expiry
      if (record.ex && Date.now() > record.ex) {
        remove(k);
        return defaultValue;
      }

      return record.v !== undefined ? record.v : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  /**
   * Remove a key
   */
  const remove = (k) => {
    if (!isAvailable) return;
    try { localStorage.removeItem(key(k)); } catch {}
  };

  /**
   * Check if a key exists and hasn't expired
   */
  const has = (k) => get(k) !== null;

  // ─── TYPED HELPERS ─────────────────────────────────────────

  const setString = (k, v, ttl) => set(k, String(v), ttl);
  const getString = (k, def = '')  => String(get(k, def));

  const setNumber = (k, v, ttl)  => set(k, Number(v), ttl);
  const getNumber = (k, def = 0)  => Number(get(k, def));

  const setBool   = (k, v, ttl)  => set(k, Boolean(v), ttl);
  const getBool   = (k, def = false) => Boolean(get(k, def));

  const setJSON   = (k, v, ttl)  => set(k, v, ttl);
  const getJSON   = (k, def = null)  => get(k, def);

  // ─── APPEND TO ARRAY ───────────────────────────────────────

  /**
   * Push a value onto a stored array
   * Creates array if doesn't exist
   * Optional maxLength — trims oldest entries
   */
  const push = (k, value, maxLength = null) => {
    const arr = get(k, []);
    arr.push(value);
    if (maxLength && arr.length > maxLength) {
      arr.splice(0, arr.length - maxLength);
    }
    return set(k, arr);
  };

  // ─── UPDATE OBJECT ─────────────────────────────────────────

  /**
   * Merge updates into a stored object
   */
  const update = (k, updates, ttl = null) => {
    const existing = get(k, {});
    return set(k, { ...existing, ...updates }, ttl);
  };

  // ─── EXPIRY HELPERS ────────────────────────────────────────

  const TTL = {
    minutes: (n) => n * 60 * 1000,
    hours:   (n) => n * 60 * 60 * 1000,
    days:    (n) => n * 24 * 60 * 60 * 1000,
  };

  // ─── NAMESPACED STORAGE ────────────────────────────────────

  /**
   * Get a namespaced sub-store
   * e.g. Storage.ns('session_GR-001').set('score', 42)
   */
  const ns = (namespace) => ({
    set:    (k, v, ttl) => set(`${namespace}_${k}`, v, ttl),
    get:    (k, def)    => get(`${namespace}_${k}`, def),
    remove: (k)         => remove(`${namespace}_${k}`),
    has:    (k)         => has(`${namespace}_${k}`),
    update: (k, u, ttl) => update(`${namespace}_${k}`, u, ttl),
    push:   (k, v, max) => push(`${namespace}_${k}`, v, max),
  });

  // ─── DEVICE STORAGE (permanent) ────────────────────────────

  const device = {
    set:    (k, v)    => set(`device_${k}`, v),        // no TTL — permanent
    get:    (k, def)  => get(`device_${k}`, def),
    remove: (k)       => remove(`device_${k}`),
    update: (k, u)    => update(`device_${k}`, u),
  };

  // ─── SESSION STORAGE (2-hour default TTL) ──────────────────

  const session = (sessionId) => ({
    set:    (k, v, ttl = TTL.hours(2)) => set(`sess_${sessionId}_${k}`, v, ttl),
    get:    (k, def)                   => get(`sess_${sessionId}_${k}`, def),
    remove: (k)                        => remove(`sess_${sessionId}_${k}`),
    update: (k, u, ttl = TTL.hours(2)) => update(`sess_${sessionId}_${k}`, u, ttl),
  });

  // ─── STICKER STORAGE (permanent per device) ────────────────

  const stickers = {
    /**
     * Add sticker to device collection
     */
    add: (deviceId, sticker) => {
      push(`stickers_${deviceId}`, {
        ...sticker,
        earnedAt: Date.now(),
      });
    },

    /**
     * Get all stickers for a device
     */
    getAll: (deviceId) => get(`stickers_${deviceId}`, []),

    /**
     * Get count of stickers earned
     */
    count: (deviceId) => get(`stickers_${deviceId}`, []).length,

    /**
     * Check if secret reveal sticker is unlocked
     */
    hasReveal: (deviceId) =>
      get(`stickers_${deviceId}`, []).some(s => s.id === 'reveal'),

    /**
     * Unlock the reveal sticker for a device
     */
    unlockReveal: (deviceId, gender) => {
      push(`stickers_${deviceId}`, {
        id:       'reveal',
        emoji:    '🎀',
        name:     'The Big Reveal!',
        rarity:   'secret',
        earnedAt: Date.now(),
        gender,
      });
    },
  };

  // ─── CLEANUP ───────────────────────────────────────────────

  /**
   * Remove all expired entries across all gr_ keys
   * Call once on app init — lightweight, fast
   */
  const purgeExpired = () => {
    if (!isAvailable) return;
    try {
      const toDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(PREFIX)) continue;
        try {
          const record = JSON.parse(localStorage.getItem(k));
          if (record?.ex && Date.now() > record.ex) toDelete.push(k);
        } catch {}
      }
      toDelete.forEach(k => localStorage.removeItem(k));
    } catch {}
  };

  /**
   * Clear everything — used only in emergencies / dev
   */
  const clearAll = () => {
    if (!isAvailable) return;
    try {
      const toDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIX)) toDelete.push(k);
      }
      toDelete.forEach(k => localStorage.removeItem(k));
    } catch {}
  };

  // ─── PUBLIC API ────────────────────────────────────────────

  return {
    isAvailable,
    set, get, remove, has,
    setString, getString,
    setNumber, getNumber,
    setBool, getBool,
    setJSON, getJSON,
    push, update,
    TTL,
    ns,
    device,
    session,
    stickers,
    purgeExpired,
    clearAll,
  };

})();

export default Storage;
