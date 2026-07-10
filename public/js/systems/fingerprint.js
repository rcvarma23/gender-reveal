/**
 * PHASE 1 — SYSTEM: Browser Fingerprinter
 * Generates a stable device fingerprint that survives:
 *   ✅ Page refresh
 *   ✅ Cache clear
 *   ✅ Incognito / private mode
 *   ✅ Different browser tabs
 *   ~✅ Different browsers on same device (partial match)
 *
 * Used as anti-cheat Layer 5 — detects same physical device
 * attempting to replay with a fresh identity
 */

const Fingerprinter = (() => {

  const CACHE_KEY = 'gr_fp_cache';

  // ─── SIGNAL COLLECTORS ─────────────────────────────────────

  /**
   * Canvas fingerprint — GPU/driver render differences
   * Most reliable cross-incognito signal
   */
  const canvasSignal = () => {
    try {
      const canvas  = document.createElement('canvas');
      canvas.width  = 220;
      canvas.height = 50;
      const ctx     = canvas.getContext('2d');

      // Draw layered text — font rendering differs per GPU
      ctx.fillStyle   = '#f28500';
      ctx.fillRect(0, 0, 220, 50);

      ctx.fillStyle   = '#069';
      ctx.font        = '15px Arial, sans-serif';
      ctx.fillText('BabyReveal2024🎀', 8, 22);

      ctx.fillStyle   = 'rgba(102,200,0,0.7)';
      ctx.font        = '12px "Times New Roman", serif';
      ctx.fillText('GenderReveal✨Party', 8, 40);

      // Include WebGL context if available
      ctx.arc(180, 25, 15, 0, Math.PI * 2);
      ctx.strokeStyle = '#FF6B6B';
      ctx.lineWidth   = 2;
      ctx.stroke();

      return canvas.toDataURL().slice(0, 120);
    } catch {
      return 'canvas_blocked';
    }
  };

  /**
   * WebGL renderer info — GPU fingerprint
   */
  const webglSignal = () => {
    try {
      const canvas  = document.createElement('canvas');
      const gl      = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'no_webgl';

      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return 'no_ext';

      return [
        gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
        gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
      ].join('|').substring(0, 80);
    } catch {
      return 'webgl_blocked';
    }
  };

  /**
   * Audio context fingerprint — hardware/OS audio differences
   */
  const audioSignal = async () => {
    try {
      const ctx     = new (window.AudioContext || window.webkitAudioContext)();
      const osc     = ctx.createOscillator();
      const analyser = ctx.createAnalyser();
      const gain    = ctx.createGain();
      const script  = ctx.createScriptProcessor(4096, 1, 1);

      gain.gain.value = 0;  // silent
      osc.type        = 'triangle';
      osc.connect(analyser);
      analyser.connect(script);
      script.connect(gain);
      gain.connect(ctx.destination);

      return new Promise((resolve) => {
        script.onaudioprocess = (e) => {
          const data = e.inputBuffer.getChannelData(0);
          const hash = Array.from(data.slice(0, 50))
            .reduce((acc, v) => acc + Math.abs(v), 0)
            .toFixed(8);
          osc.disconnect();
          analyser.disconnect();
          script.disconnect();
          ctx.close();
          resolve(`audio_${hash}`);
        };
        osc.start(0);
        setTimeout(() => resolve('audio_timeout'), 500);
      });
    } catch {
      return 'audio_blocked';
    }
  };

  /**
   * Hardware/browser signals — stable across sessions
   */
  const hardwareSignals = () => ({
    screen:       `${screen.width}x${screen.height}x${screen.colorDepth}`,
    pixelRatio:   window.devicePixelRatio || 1,
    timezone:     Intl.DateTimeFormat().resolvedOptions().timeZone,
    language:     navigator.language || '',
    languages:    (navigator.languages || []).slice(0, 3).join(','),
    platform:     navigator.platform || '',
    cores:        navigator.hardwareConcurrency || 0,
    memory:       navigator.deviceMemory || 0,
    touchPoints:  navigator.maxTouchPoints || 0,
    cookieEnabled: navigator.cookieEnabled,
    colorScheme:  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'd' : 'l',
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? '1' : '0',
  });

  /**
   * Font detection — checks which fonts are installed
   * Different devices have different font sets
   */
  const fontSignal = () => {
    const testFonts = [
      'Arial', 'Georgia', 'Helvetica', 'Courier New',
      'Trebuchet MS', 'Times New Roman', 'Verdana',
      'Comic Sans MS', 'Impact', 'Tahoma',
    ];

    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const base   = 'monospace';
    const text   = 'mmmmmmmmmmlli';

    ctx.font = `16px ${base}`;
    const baseW = ctx.measureText(text).width;

    const present = testFonts.filter(font => {
      ctx.font = `16px '${font}', ${base}`;
      return ctx.measureText(text).width !== baseW;
    });

    return present.join(',');
  };

  // ─── SHA-256 HASH ──────────────────────────────────────────

  const sha256 = async (message) => {
    try {
      const buf  = new TextEncoder().encode(message);
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback simple hash if SubtleCrypto unavailable
      let h = 0;
      for (let i = 0; i < message.length; i++) {
        h = Math.imul(31, h) + message.charCodeAt(i) | 0;
      }
      return `fallback_${Math.abs(h).toString(16)}`;
    }
  };

  // ─── GENERATE FINGERPRINT ──────────────────────────────────

  /**
   * Generate the full fingerprint
   * Combines all signals and hashes to a short stable string
   * Format: fp_{16 hex chars}
   */
  const generate = async () => {
    // Check cache first (same session)
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return cached;

    // Collect all signals in parallel where possible
    const [audioFp] = await Promise.all([audioSignal()]);

    const signals = {
      ...hardwareSignals(),
      canvas:  canvasSignal(),
      webgl:   webglSignal(),
      audio:   audioFp,
      fonts:   fontSignal(),
    };

    const raw  = JSON.stringify(signals);
    const hash = await sha256(raw);
    const fp   = `fp_${hash.substring(0, 16)}`;

    // Cache in sessionStorage (faster subsequent calls)
    try { sessionStorage.setItem(CACHE_KEY, fp); } catch {}

    return fp;
  };

  /**
   * Fuzzy match — check if two fingerprints are from same device
   * Returns 0.0–1.0 similarity score
   * 0.7+ = likely same device, even if some signals changed
   */
  const similarity = async (fp1Signals, fp2Signals) => {
    const keys  = Object.keys(fp1Signals);
    const matches = keys.filter(k => fp1Signals[k] === fp2Signals[k]).length;
    return matches / keys.length;
  };

  // ─── PUBLIC API ────────────────────────────────────────────

  return {
    generate,
    similarity,
    // Exposed for testing
    _signals: hardwareSignals,
  };

})();

export default Fingerprinter;
