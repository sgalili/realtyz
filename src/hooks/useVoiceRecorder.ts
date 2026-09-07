import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { encodeWav } from '@/lib/wavEncoder';

export type VoiceRecorderState = 'idle' | 'recording' | 'transcribing';

interface Options {
  /** Called with the clean transcript once transcription succeeds. */
  onTranscript?: (text: string) => void;
  onError?: (message: string) => void;
  /** ISO-639-1 code, or 'auto' to let the model detect Hebrew/English. */
  language?: 'he' | 'en' | 'auto';
  /** Hard cap on recording length (seconds). */
  maxSeconds?: number;
}

/** Pick a container the browser can actually produce (Safari only does mp4). */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch { /* older browsers throw */ }
  }
  return undefined;
}

function micErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'הגישה למיקרופון נחסמה. אשרו הרשאת מיקרופון בדפדפן ונסו שוב';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'לא נמצא מיקרופון פעיל במחשב';
  }
  if (name === 'NotReadableError') {
    return 'המיקרופון תפוס על ידי אפליקציה אחרת. סגרו אותה ונסו שוב';
  }
  if (!window.isSecureContext) {
    return 'הקלטה אפשרית רק בחיבור מאובטח (https)';
  }
  return 'לא ניתן לגשת למיקרופון. אשרו הרשאות בדפדפן';
}

/**
 * Global voice-to-text recorder.
 *
 * Primary path: MediaRecorder captures ONE complete file (no timeslice, so the
 * container header is always present). Fallback path: Web Audio PCM encoded to
 * a 16kHz mono WAV, for browsers without MediaRecorder audio support.
 * The audio is transcribed through the `transcribe-audio` edge function and the
 * transcript is handed to `onTranscript` — never submitted anywhere.
 */
export function useVoiceRecorder({ onTranscript, onError, language = 'auto', maxSeconds = 120 }: Options = {}) {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [seconds, setSeconds] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const blobPartsRef = useRef<Blob[]>([]);
  const stoppedRef = useRef<Promise<void> | null>(null);
  // Web Audio fallback
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(44100);

  const tickRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const stateRef = useRef<VoiceRecorderState>('idle');
  const stopRef = useRef<() => Promise<string | null> | void>(() => {});

  useEffect(() => { stateRef.current = state; }, [state]);

  const teardown = useCallback(() => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    try { nodeRef.current?.disconnect(); } catch { /* noop */ }
    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const ctx = ctxRef.current;
    ctxRef.current = null;
    nodeRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    recorderRef.current = null;
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const transcribe = useCallback(async (blob: Blob) => {
    setState('transcribing');
    try {
      // Base MIME only: `audio/webm;codecs=opus` would put extra parameters
      // between the media type and the `;base64` marker of the data URL.
      const baseMime = (blob.type || 'audio/webm').split(';')[0].trim() || 'audio/webm';
      const clean = blob.type === baseMime ? blob : new Blob([blob], { type: baseMime });
      if (clean.size < 1024) throw new Error('ההקלטה הייתה ריקה — נסו שוב');

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const out = typeof reader.result === 'string' ? reader.result : '';
          if (!out) reject(new Error('קריאת ההקלטה נכשלה — נסו שוב'));
          else resolve(out);
        };
        reader.onerror = () => reject(reader.error ?? new Error('קריאת ההקלטה נכשלה — נסו שוב'));
        reader.onabort = () => reject(new Error('קריאת ההקלטה בוטלה'));
        try {
          reader.readAsDataURL(clean);
        } catch (e) {
          reject(e instanceof Error ? e : new Error('קריאת ההקלטה נכשלה — נסו שוב'));
        }
      });

      // Validate the payload before it ever leaves the browser.
      const comma = dataUrl.indexOf(',');
      const payload = comma >= 0 ? dataUrl.slice(comma + 1) : '';
      if (!dataUrl.startsWith('data:') || !/^data:audio\//i.test(dataUrl) || payload.length < 64) {
        throw new Error('ההקלטה לא נקראה כראוי — נסו להקליט שוב');
      }

      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio_data_url: dataUrl,
          mime_type: baseMime,
          ...(language !== 'auto' ? { language } : {}),
        },
      });

      if (error) {
        const detail = error instanceof FunctionsHttpError
          ? await error.context.json().catch(() => null) as { error?: string } | null
          : null;
        if (detail?.error === 'empty_recording') throw new Error('ההקלטה הייתה ריקה — נסו שוב');
        throw new Error(detail?.error || error.message || 'תמלול נכשל');
      }
      const text = String((data as { text?: string } | null)?.text ?? '').trim();
      if (!text) throw new Error('לא זוהה דיבור בהקלטה');
      onTranscript?.(text);
      return text;
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'תמלול נכשל');
      return null;
    } finally {
      setState('idle');
      setSeconds(0);
    }
  }, [language, onError, onTranscript]);

  const start = useCallback(async () => {
    if (stateRef.current !== 'idle') return;
    cancelledRef.current = false;
    blobPartsRef.current = [];
    pcmRef.current = [];
    stoppedRef.current = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('הדפדפן הזה לא תומך בהקלטה קולית');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      teardown();
      setState('idle');
      onError?.(micErrorMessage(e));
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    try {
      if (typeof MediaRecorder !== 'undefined') {
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) blobPartsRef.current.push(e.data);
        };
        stoppedRef.current = new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
          recorder.onerror = () => resolve();
        });
        // No timeslice: one complete, decodable file when we stop.
        recorder.start();
      } else {
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
        sampleRateRef.current = ctx.sampleRate;
        const source = ctx.createMediaStreamSource(stream);
        sourceRef.current = source;
        const node = ctx.createScriptProcessor(4096, 1, 1);
        nodeRef.current = node;
        node.onaudioprocess = (e) => {
          pcmRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        source.connect(node);
        node.connect(ctx.destination);
      }
    } catch (e) {
      teardown();
      setState('idle');
      onError?.(micErrorMessage(e));
      return;
    }

    setSeconds(0);
    setState('recording');
    tickRef.current = window.setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= maxSeconds) window.setTimeout(() => { void stopRef.current(); }, 0);
        return next;
      });
    }, 1000);
  }, [maxSeconds, onError, teardown]);

  const stop = useCallback(async () => {
    if (stateRef.current !== 'recording') return null;
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }

    const recorder = recorderRef.current;
    let blob: Blob | null = null;

    if (recorder) {
      try {
        if (recorder.state !== 'inactive') {
          recorder.requestData?.();
          recorder.stop();
          await Promise.race([
            stoppedRef.current ?? Promise.resolve(),
            new Promise<void>((r) => window.setTimeout(r, 3000)),
          ]);
        }
      } catch { /* fall through to the size check */ }
      const parts = blobPartsRef.current;
      blobPartsRef.current = [];
      if (parts.length) {
        blob = new Blob(parts, { type: recorder.mimeType || parts[0].type || 'audio/webm' });
      }
    } else {
      const chunks = pcmRef.current;
      pcmRef.current = [];
      if (chunks.length) blob = encodeWav(chunks, sampleRateRef.current);
    }

    teardown();

    if (cancelledRef.current) { setState('idle'); setSeconds(0); return null; }

    if (!blob || blob.size < 1400) {
      setState('idle');
      setSeconds(0);
      onError?.('ההקלטה קצרה מדי — החזיקו את ההקלטה כמה שניות ודברו לתוך המיקרופון');
      return null;
    }

    return transcribe(blob);
  }, [teardown, transcribe, onError]);

  useEffect(() => { stopRef.current = stop; }, [stop]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    blobPartsRef.current = [];
    pcmRef.current = [];
    try { if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop(); } catch { /* noop */ }
    teardown();
    setState('idle');
    setSeconds(0);
  }, [teardown]);

  const toggle = useCallback(() => {
    if (stateRef.current === 'recording') return stop();
    if (stateRef.current === 'idle') return start();
    return undefined;
  }, [start, stop]);

  return {
    state,
    seconds,
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
    isBusy: state !== 'idle',
    start,
    stop,
    cancel,
    toggle,
  };
}
