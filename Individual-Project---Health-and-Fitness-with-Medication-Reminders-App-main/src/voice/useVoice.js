/**
 * useVoice.js – React hook for TTS with guard on voiceEnabled.
 *
 * Usage:
 *   const { speak, stop } = useVoice(voiceEnabled);
 *   speak("Hello world");      // only speaks if voiceEnabled === true
 *   stop();                    // immediately stops any speech
 */

import { useCallback, useRef } from "react";
import { speak as ttsSpeak, stop as ttsStop } from "./tts";

export default function useVoice(voiceEnabled) {
  // Guard against multiple rapid calls
  const speakingRef = useRef(false);

  const speak = useCallback(
    (text, options = {}) => {
      if (!voiceEnabled) return;
      if (!text || typeof text !== "string" || !text.trim()) return;

      // Cancel previous speech before starting new one
      ttsStop().then(() => {
        speakingRef.current = true;
        ttsSpeak(text, options).catch((err) => {
          console.error("[useVoice] speak error:", err);
        }).finally(() => {
          speakingRef.current = false;
        });
      });
    },
    [voiceEnabled]
  );

  const stop = useCallback(() => {
    speakingRef.current = false;
    ttsStop();
  }, []);

  return { speak, stop };
}
