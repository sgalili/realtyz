import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { encodeWav, peakLevel } from '@/lib/wavEncoder';

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

/**
 * Global voice-to-text recorder. Captures PCM via the Web Audio API,
 * encodes a complete 16kHz mono WAV and transcribes it through the
 * `transcribe-audio` edge function (Hebrew + English).
 */
export function useVoiceRecorder({ onTranscript, onError, language = 'auto', maxSeconds = 120 }: Options = {}) {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [seconds, setSeconds] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmRef = useRef<Float32Array[]>([]);
  const tickRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

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
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const transcribe = useCallback(async (blob: Blob) => {
    setState('transcribing');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsDataURL(blob);
      });
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio_data_url: dataUrl,
          mime_type: blob.type,
          ...(language !== 'auto' ? { language } : {}),
        },
      });
      if (error) {
        const detail = error instanceof FunctionsHttpError
          ? await error.context.json().catch(() => null) as { error?: string } | null
          : null;
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
    if (state !== 'idle') return;
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const node = ctx.createScriptProcessor(4096, 1, 1);
      nodeRef.current = node;
      pcmRef.current = [];
      node.onaudioprocess = (e) => {
        pcmRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(node);
      node.connect(ctx.destination);
      setSeconds(0);
      setState('recording');
      tickRef.current = window.setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= maxSeconds) window.setTimeout(() => stop(), 0);
          return next;
        });
      }, 1000);
    } catch {
      teardown();
      setState('idle');
      onError?.('לא ניתן לגשת למיקרופון. אשרו הרשאות בדפדפן');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, maxSeconds, onError, teardown]);

  const stop = useCallback(async () => {
    if (state !== 'recording') return null;
    const sampleRate = ctxRef.current?.sampleRate ?? 44100;
    const chunks = pcmRef.current;
    pcmRef.current = [];
    teardown();
    if (cancelledRef.current) { setState('idle'); setSeconds(0); return null; }
    const level = peakLevel(chunks);
    const blob = encodeWav(chunks, sampleRate);
    if (blob.size < 4096 || level < 0.01) {
      setState('idle');
      setSeconds(0);
      onError?.('ההקלטה הייתה ריקה — נסו שוב');
      return null;
    }
    return transcribe(blob);
  }, [state, teardown, transcribe, onError]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    pcmRef.current = [];
    teardown();
    setState('idle');
    setSeconds(0);
  }, [teardown]);

  const toggle = useCallback(() => {
    if (state === 'recording') return stop();
    if (state === 'idle') return start();
    return undefined;
  }, [state, start, stop]);

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
