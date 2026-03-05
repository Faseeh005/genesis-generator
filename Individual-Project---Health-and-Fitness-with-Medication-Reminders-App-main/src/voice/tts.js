/**
 * tts.js – Production-ready Text-to-Speech wrapper
 *
 * Priority: Native Capacitor TTS → Web Speech API fallback.
 * Safe for Android WebView where speechSynthesis is unreliable.
 */

/* ---------- helpers ---------- */

let nativePlugin = null;
let nativeChecked = false;

const getNativePlugin = async () => {
  if (nativeChecked) return nativePlugin;
  nativeChecked = true;

  try {
    if (typeof window === "undefined") return null;

    const capacitor = window.Capacitor;
    const platform = capacitor?.getPlatform?.();
    const isNative = capacitor?.isNativePlatform?.() || platform === "android" || platform === "ios";

    if (!isNative) {
      console.log("[TTS] Running on web, using Web Speech fallback");
      return null;
    }

    const plugin = capacitor?.Plugins?.TextToSpeech;
    if (plugin && typeof plugin.speak === "function") {
      nativePlugin = plugin;
      console.log("[TTS] Native Capacitor plugin loaded ✅");
    } else {
      console.warn("[TTS] Native TextToSpeech plugin not found on Capacitor bridge");
    }
  } catch {
    console.log("[TTS] Native plugin unavailable, will use Web Speech API");
  }

  return nativePlugin;
};

/* ---------- Web Speech fallback ---------- */

let webUnlocked = false;

const unlockWebSpeech = () => {
  if (webUnlocked) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  webUnlocked = true;

  const unlock = () => {
    try {
      window.speechSynthesis.resume?.();
      window.speechSynthesis.getVoices();
    } catch (_) {
      // ignore
    }
  };

  ["click", "touchstart", "keydown"].forEach((evt) =>
    document.addEventListener(evt, unlock, { once: true, passive: true })
  );
  unlock();
};

const speakWeb = (text, opts) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("[TTS] Web Speech API not available");
    return;
  }

  unlockWebSpeech();
  const synth = window.speechSynthesis;

  try {
    synth.cancel(); // stop anything in progress
  } catch (_) {}

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = opts.lang || "en-GB";
  utter.rate = opts.rate ?? 1.0;
  utter.pitch = opts.pitch ?? 1.0;
  utter.volume = opts.volume ?? 1.0;

  // Try to pick a good voice
  const voices = synth.getVoices() || [];
  const preferred =
    voices.find((v) => v.lang?.startsWith("en") && /natural|enhanced|premium|neural/i.test(v.name)) ||
    voices.find((v) => v.lang?.startsWith(opts.lang?.substring(0, 2) || "en")) ||
    voices[0];
  if (preferred) {
    utter.voice = preferred;
    utter.lang = preferred.lang;
  }

  utter.onerror = (e) => console.error("[TTS] Web Speech error:", e?.error || e);

  // Short delay helps on some Android WebViews
  setTimeout(() => {
    try {
      synth.speak(utter);
    } catch (err) {
      console.error("[TTS] speak() threw:", err);
    }
  }, 80);
};

/* ---------- public API ---------- */

const DEFAULT_OPTS = {
  lang: "en-GB",
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

/**
 * Speak the given text. Cancels any prior utterance first.
 * @param {string} text
 * @param {{ lang?: string, rate?: number, pitch?: number, volume?: number }} options
 */
export const speak = async (text, options = {}) => {
  if (!text || typeof text !== "string" || !text.trim()) return;

  const opts = { ...DEFAULT_OPTS, ...options };
  const cleaned = text.trim();

  try {
    const plugin = await getNativePlugin();

    if (plugin) {
      // Stop previous speech first
      try { await plugin.stop(); } catch (_) {}

      await plugin.speak({
        text: cleaned,
        lang: opts.lang,
        rate: opts.rate,
        pitch: opts.pitch,
        volume: opts.volume,
        category: "ambient",
      });
      return; // success via native
    }
  } catch (err) {
    console.warn("[TTS] Native speak failed, falling back to Web Speech:", err);
  }

  // Fallback
  speakWeb(cleaned, opts);
};

/**
 * Stop any speech in progress (native + web).
 */
export const stop = async () => {
  try {
    const plugin = await getNativePlugin();
    if (plugin) await plugin.stop();
  } catch (_) {}

  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } catch (_) {}
};
