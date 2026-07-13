/**
 * PHASE 7 — CORE: Debug Logger
 * Tag-prefixed console logging + an in-memory ring buffer so testers can
 * dump recent activity from the console without a devtools network tab.
 *
 * Enable verbose (debug/info) output by either:
 *   - appending ?debug=1 to any page URL, or
 *   - running `localStorage.setItem('gr_debug', 'true')` once in console
 * warn/error always print, regardless of the flag — this is what testers
 * should watch for bug reports even with debug mode off.
 *
 * From the console: GRLog.dump() prints the ring buffer, GRLog.enable()/
 * disable() toggle the flag, GRLog.clear() empties the buffer.
 */

const STORAGE_KEY = 'gr_debug';
const BUFFER_KEY  = 'gr_log_buffer';
const MAX_ENTRIES = 300;

const isEnabled = () => {
  try {
    if (new URLSearchParams(location.search).get('debug') === '1') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const readBuffer = () => {
  try {
    return JSON.parse(sessionStorage.getItem(BUFFER_KEY) || '[]');
  } catch {
    return [];
  }
};

const writeBuffer = (buf) => {
  try {
    sessionStorage.setItem(BUFFER_KEY, JSON.stringify(buf.slice(-MAX_ENTRIES)));
  } catch {
    // sessionStorage full/unavailable — buffer is best-effort only
  }
};

const record = (level, tag, args) => {
  const buf = readBuffer();
  buf.push({
    t:     Date.now(),
    level,
    tag,
    msg:   args.map(a => {
      try { return typeof a === 'string' ? a : JSON.stringify(a); }
      catch { return String(a); }
    }).join(' '),
  });
  writeBuffer(buf);
};

const consoleFn = { debug: 'log', info: 'info', warn: 'warn', error: 'error' };

const emit = (level, tag) => (...args) => {
  record(level, tag, args);
  const shouldPrint = level === 'warn' || level === 'error' || isEnabled();
  if (!shouldPrint) return;
  console[consoleFn[level]](`[${tag}]`, ...args);
};

/**
 * Create a tagged logger, e.g. `const log = createLogger('PartyState')`
 * then `log.debug('polling', state)`.
 */
const createLogger = (tag) => ({
  debug: emit('debug', tag),
  info:  emit('info',  tag),
  warn:  emit('warn',  tag),
  error: emit('error', tag),
});

// ─── GLOBAL DEBUG CONSOLE HELPER ──────────────────────────────
if (typeof window !== 'undefined') {
  window.GRLog = {
    dump:    () => { console.table(readBuffer()); return readBuffer(); },
    clear:   () => writeBuffer([]),
    enable:  () => localStorage.setItem(STORAGE_KEY, 'true'),
    disable: () => localStorage.removeItem(STORAGE_KEY),
  };
}

export default createLogger;
