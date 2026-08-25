import { Loader2, Mic, Square } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

interface Props {
  /** Receives the transcript. Return value ignored. */
  onTranscript: (text: string) => void;
  /** 'he' | 'en' | 'auto' (default: auto-detect Hebrew/English). */
  language?: 'he' | 'en' | 'auto';
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * Global voice-to-text toggle. Drop next to any input: click to record,
 * click again to stop — the transcript is injected via onTranscript.
 */
export function VoiceInputButton({
  onTranscript,
  language = 'auto',
  size = 'md',
  className,
  disabled,
  title,
}: Props) {
  const rec = useVoiceRecorder({
    language,
    onTranscript,
    onError: (m) => toast.error(m),
  });

  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <button
      type="button"
      onClick={() => { void rec.toggle(); }}
      disabled={disabled || rec.isTranscribing}
      aria-label={rec.isRecording ? 'עצור הקלטה ותמלל' : 'הקלטה קולית'}
      title={title ?? (rec.isRecording ? `מקליט… ${rec.seconds}s — לחצו לסיום` : 'דיבור לטקסט')}
      className={cn(
        'shrink-0 inline-flex items-center justify-center rounded-full transition-colors',
        dim,
        rec.isRecording
          ? 'bg-destructive/15 text-destructive animate-pulse'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        (disabled || rec.isTranscribing) && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      {rec.isTranscribing ? (
        <Loader2 className={cn(icon, 'animate-spin')} />
      ) : rec.isRecording ? (
        <Square className={cn(icon, 'fill-current')} />
      ) : (
        <Mic className={icon} />
      )}
    </button>
  );
}

export default VoiceInputButton;
