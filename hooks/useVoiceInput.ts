/**
 * useVoiceInput — thin wrapper over the browser SpeechRecognition API.
 *
 * Why a hook (not a context): voice input is hyper-local to one
 * input box. Different surfaces (Brief, AiAdvisor, maybe a future
 * task-quick-add bar) instantiate their own recognizer; there's no
 * shared session state worth promoting to a context.
 *
 * Browser support:
 *   • Chromium-based (Chrome, Edge, Arc, Brave): native SpeechRecognition
 *     OR vendor-prefixed webkitSpeechRecognition. Both work.
 *   • Safari: webkitSpeechRecognition. Works.
 *   • Firefox: NOT supported — `isSupported` returns false and the
 *     consumer should hide the mic button.
 *
 * Usage:
 *   const { isListening, isSupported, error, start, stop } = useVoiceInput({
 *     lang: 'es-AR',
 *     onPartial: text => setInput(text),       // live updates
 *     onFinal:   text => { setInput(text); },  // last update before stop
 *   });
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface VoiceInputOptions {
  /** BCP-47 language tag. Defaults to 'en-US'. Pass 'es-AR' / 'es-ES'
   *  / 'pt-BR' to match the user's preferred language. */
  lang?: string;
  /** Fired on every interim recognition update. Use to update the
   *  text field live so the user sees their words appear. */
  onPartial?: (text: string) => void;
  /** Fired once when recognition ends (user stopped or silence
   *  timeout). Receives the final concatenated transcript. */
  onFinal?: (text: string) => void;
}

interface VoiceInputState {
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useVoiceInput(opts: VoiceInputOptions = {}): VoiceInputState {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recogRef = useRef<any>(null);
  // Keep the latest options in a ref so onresult/onend always see the
  // current onPartial/onFinal callbacks, even if the consumer doesn't
  // memoize them. Closure-capture would otherwise pin stale refs.
  const optsRef = useRef(opts);
  optsRef.current = opts;
  // Accumulate the running transcript outside of React state so we can
  // hand the final string to onFinal without an extra render.
  const transcriptRef = useRef('');

  const isSupported = typeof window !== 'undefined' && !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  const stop = useCallback(() => {
    const r = recogRef.current;
    if (!r) return;
    try { r.stop(); } catch { /* already stopped */ }
    recogRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      setError('Voice input is not supported in this browser. Try Chrome, Edge, or Safari.');
      return;
    }
    // If something's already running, stop it first — defensive, the
    // mic button click handler should toggle, but a quick double-click
    // shouldn't double-start the recognizer.
    if (recogRef.current) stop();

    setError(null);
    transcriptRef.current = '';
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recog = new SR();
    recog.continuous = true;       // keep listening until we explicitly stop
    recog.interimResults = true;   // fire partials so the UI updates live
    recog.lang = opts.lang || 'en-US';

    recog.onresult = (e: any) => {
      // SpeechRecognition emits a growing list of results; concatenate
      // all final + interim transcripts so the live text is monotonic.
      let full = '';
      for (let i = 0; i < e.results.length; i++) {
        full += e.results[i][0].transcript;
      }
      transcriptRef.current = full;
      optsRef.current.onPartial?.(full);
    };

    recog.onerror = (e: any) => {
      // 'no-speech' fires on natural silence — not an error worth
      // surfacing to the user. 'aborted' fires when we call stop().
      const err = e.error || 'unknown';
      if (err === 'no-speech' || err === 'aborted') return;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setError('Mic access was blocked. Allow it in your browser settings.');
      } else if (err === 'audio-capture') {
        setError('No microphone found. Check your input device.');
      } else {
        setError(`Voice error: ${err}`);
      }
      setIsListening(false);
    };

    recog.onend = () => {
      setIsListening(false);
      recogRef.current = null;
      if (transcriptRef.current) {
        optsRef.current.onFinal?.(transcriptRef.current);
      }
    };

    try {
      recog.start();
      recogRef.current = recog;
      setIsListening(true);
    } catch (e: any) {
      setError(e?.message || 'Could not start voice input');
      setIsListening(false);
    }
  }, [isSupported, opts.lang, stop]);

  // Cleanup on unmount — avoid leaving a hot recognizer hogging the
  // mic if the component disappears mid-listen.
  useEffect(() => () => stop(), [stop]);

  return { isListening, isSupported, error, start, stop };
}
