import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Mic, Volume2, Upload, Square, Play, Pause, Trash2, Check, PhoneForwarded, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { AddVoiceDialog } from '@/components/voice/AddVoiceDialog';

type IvrLead = { id: string; full_name: string | null; phone: string | null; city?: string | null };
type ClonedVoice = { id: string; name: string; voice_id: string; preview_url?: string | null };
type ListingOpt = {
  id: string; property_title: string | null; address: string | null; city: string | null;
  neighborhood: string | null; rooms: number | null; sqm: number | null; asking_price: number | null;
  features: any;
};

const UDI_VOICE = { id: 'udi', label: 'אודי ויטמן', voice_id: '4eohDAy1kTS18Cnf0HiN' };
const PRESET_VOICES: { id: string; label: string; voice_id: string }[] = [UDI_VOICE];

type SourceType = 'tts' | 'recording' | 'upload';
type AudienceMode = 'all' | 'manual' | 'csv' | 'paste';

type HistoryItem = {
  id: string;
  text: string;
  agentName: string;
  audioUrl: string;
  createdAt: string; // ISO
};

const HISTORY_KEY = 'realtyz_ivr_audio_history';

const loadHistory = (): HistoryItem[] => {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
};
const saveHistory = (items: HistoryItem[]) => {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50))); } catch { /* ignore */ }
};

const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
};

const fmtTs = (iso: string) => {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}, ${hh}:${mi}:${ss}`;
};

export const IvrBroadcastDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [source, setSource] = useState<SourceType>('tts');
  const [leads, setLeads] = useState<IvrLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [clonedVoices, setClonedVoices] = useState<ClonedVoice[]>([]);
  const [agentVoiceId, setAgentVoiceId] = useState<string>(UDI_VOICE.voice_id);
  const [addVoiceOpen, setAddVoiceOpen] = useState(false);
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [listingId, setListingId] = useState<string>("none");

  // Audience
  const [audience, setAudience] = useState<AudienceMode | ''>('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [csvPhones, setCsvPhones] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  // TTS
  const [ttsText, setTtsText] = useState('');
  const [generatingTts, setGeneratingTts] = useState(false);

  // Recording
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<number | null>(null);

  // Upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const [dispatching, setDispatching] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setHistory(loadHistory());
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    (async () => {
      setLoadingLeads(true);
      const [{ data: leadRows }, { data: voiceRows }, { data: listingRows }] = await Promise.all([
        supabase.from('leads').select('id, full_name, phone_number, city')
          .not('phone_number', 'is', null).order('full_name', { ascending: true }).limit(1000),
        supabase.from('cloned_voices').select('id, name, voice_id, preview_url').order('created_at', { ascending: false }),
        supabase.from('listings')
          .select('id, property_title, address, city, neighborhood, rooms, sqm, asking_price, features')
          .in('status', ['live', 'pending'])
          .order('created_at', { ascending: false })
          .limit(200),
      ]);
      setLeads(((leadRows as any[]) ?? []).map((r) => ({
        id: r.id, full_name: r.full_name, phone: r.phone_number, city: r.city,
      })));
      setClonedVoices((voiceRows ?? []) as ClonedVoice[]);
      setListings((listingRows ?? []) as ListingOpt[]);
      setLoadingLeads(false);
    })();
  }, [open]);

  const allAgents = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string; voice_id: string; preview_url?: string | null }[] = [];
    for (const v of clonedVoices) {
      if (!v.voice_id || seen.has(v.voice_id)) continue;
      seen.add(v.voice_id);
      out.push({ id: `cv:${v.id}`, label: v.name, voice_id: v.voice_id, preview_url: v.preview_url ?? null });
    }
    for (const p of PRESET_VOICES) {
      if (seen.has(p.voice_id)) continue;
      seen.add(p.voice_id);
      out.push({ id: p.id, label: p.label, voice_id: p.voice_id });
    }
    return out;
  }, [clonedVoices]);

  const agentLabel = useMemo(
    () => allAgents.find((a) => a.voice_id === agentVoiceId)?.label ?? 'נציג AI',
    [allAgents, agentVoiceId],
  );

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  const playVoicePreview = async (voice: { voice_id: string; label: string; preview_url?: string | null }) => {
    try {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
        if (previewingVoiceId === voice.voice_id) { setPreviewingVoiceId(null); return; }
      }
      setPreviewingVoiceId(voice.voice_id);
      let url = voice.preview_url || null;
      if (!url) {
        const { data, error } = await supabase.functions.invoke('ivr-broadcast', {
          body: { source: 'tts', text: 'שלום, זה קול לדוגמה.', voice_id: voice.voice_id, generate_only: true },
        });
        if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message ?? 'preview_failed');
        url = (data as any)?.audio_url ?? null;
      }
      if (!url) throw new Error('no_url');
      const a = new Audio(url);
      previewAudioRef.current = a;
      a.onended = () => { if (previewAudioRef.current === a) { previewAudioRef.current = null; setPreviewingVoiceId(null); } };
      await a.play();
    } catch (e: any) {
      setPreviewingVoiceId(null);
      toast.error(`תצוגה מקדימה נכשלה: ${e?.message ?? 'שגיאה'}`);
    }
  };

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    const digits = q.replace(/\D/g, '');
    return leads.filter((l) =>
      (l.full_name ?? '').toLowerCase().includes(q) ||
      (digits.length > 0 && (l.phone ?? '').replace(/\D/g, '').includes(digits)),
    );
  }, [leads, search]);

  const allFilteredSelected = filteredLeads.length > 0 && filteredLeads.every((l) => selectedLeadIds.has(l.id));
  const toggleAllFiltered = () => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredLeads.forEach((l) => next.delete(l.id));
      else filteredLeads.forEach((l) => next.add(l.id));
      return next;
    });
  };
  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = () => {
        setRecordedBlob(new Blob(chunks, { type: 'audio/webm' }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecRef.current = mr;
      mr.start();
      setRecording(true);
      setRecElapsed(0);
      recTimerRef.current = window.setInterval(() => setRecElapsed((s) => s + 1), 1000);
    } catch {
      toast.error('לא ניתן לגשת למיקרופון');
    }
  };
  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setRecording(false);
    if (recTimerRef.current) window.clearInterval(recTimerRef.current);
  };

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === listingId) ?? null,
    [listings, listingId],
  );
  const listingLabel = (l: ListingOpt) => {
    const parts = [l.property_title, l.address || l.neighborhood, l.city].filter(Boolean);
    return parts.join(' · ') || 'נכס ללא כותרת';
  };
  const buildTtsPrompt = (raw: string): string => {
    if (!selectedListing) return raw;
    const l = selectedListing;
    const ctx: string[] = [];
    if (l.property_title) ctx.push(l.property_title);
    if (l.address) ctx.push(`כתובת: ${l.address}`);
    if (l.neighborhood) ctx.push(`שכונה: ${l.neighborhood}`);
    if (l.city) ctx.push(`עיר: ${l.city}`);
    if (l.rooms) ctx.push(`${l.rooms} חדרים`);
    if (l.sqm) ctx.push(`${l.sqm} מ"ר`);
    if (l.asking_price) ctx.push(`מחיר מבוקש: ${Number(l.asking_price).toLocaleString('he-IL')} ₪`);
    const header = `הקשר הנכס לקמפיין: ${ctx.join(', ')}.`;
    return `${header}\n\n${raw}`;
  };

  // Generate TTS audio (calls ivr-broadcast in generate-only mode for an audio_url)
  const generateTtsAudio = async () => {
    if (!ttsText.trim()) { toast.error('הקלידו טקסט'); return; }
    setGeneratingTts(true);
    try {
      const finalText = buildTtsPrompt(ttsText.trim());
      const { data, error } = await supabase.functions.invoke('ivr-broadcast', {
        body: { source: 'tts', text: finalText, voice_id: agentVoiceId, generate_only: true },
      });
      const audioUrl = (data as any)?.audio_url;
      if (error || !audioUrl) {
        toast.error(`הפקת האודיו נכשלה${(data as any)?.error ? `: ${(data as any).error}` : ''}`);
        return;
      }
      const item: HistoryItem = {
        id: crypto.randomUUID(),
        text: ttsText.trim(),
        agentName: agentLabel,
        audioUrl,
        createdAt: new Date().toISOString(),
      };
      const next = [item, ...history];
      setHistory(next); saveHistory(next);
      toast.success('האודיו נוצר');
    } catch (e: any) {
      toast.error(`הפקת האודיו נכשלה: ${e?.message ?? 'שגיאה'}`);
    } finally {
      setGeneratingTts(false);
    }
  };

  // CSV / Excel upload — parse phone numbers from text
  const handleCsvFile = async (f: File) => {
    const text = await f.text();
    const phones = Array.from(text.matchAll(/(\+?\d[\d\-\s().]{6,}\d)/g)).map((m) => m[1].replace(/\D/g, ''));
    const unique = Array.from(new Set(phones)).filter((p) => p.length >= 9);
    setCsvPhones(unique);
    toast.success(`נטענו ${unique.length} מספרים`);
  };
  const parsedPasteNumbers = useMemo(() => {
    const phones = Array.from(pasteText.matchAll(/(\+?\d[\d\-\s().]{6,}\d)/g)).map((m) => m[1].replace(/\D/g, ''));
    return Array.from(new Set(phones)).filter((p) => p.length >= 9);
  }, [pasteText]);

  const targetLeads = useMemo(() => {
    if (audience === 'manual') return leads.filter((l) => selectedLeadIds.has(l.id)).map((l) => ({ id: l.id, phone: l.phone ?? '' }));
    if (audience === 'all') return leads.map((l) => ({ id: l.id, phone: l.phone ?? '' }));
    if (audience === 'csv') return csvPhones.map((p) => ({ phone: p }));
    if (audience === 'paste') return parsedPasteNumbers.map((p) => ({ phone: p }));
    return [];
  }, [audience, leads, selectedLeadIds, csvPhones, parsedPasteNumbers]);

  const playHistory = (item: HistoryItem) => {
    if (playingId === item.id && audioElRef.current) {
      audioElRef.current.pause();
      setPlayingId(null);
      return;
    }
    if (audioElRef.current) audioElRef.current.pause();
    const a = new Audio(item.audioUrl);
    audioElRef.current = a;
    a.onended = () => setPlayingId(null);
    a.play().then(() => setPlayingId(item.id)).catch(() => toast.error('נכשלה ההשמעה'));
  };
  const deleteHistory = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    setHistory(next); saveHistory(next);
  };

  const dispatchAudio = async (audioUrl: string | null, fallbackPayload?: Record<string, unknown>) => {
    const targets = targetLeads.filter((x) => x.phone);
    if (targets.length === 0) { toast.error('בחרו רשימת יעד'); return; }
    setDispatching(true);
    try {
      const payload: Record<string, unknown> = audioUrl
        ? { source: 'tts', audio_url: audioUrl, leads: targets }
        : { ...(fallbackPayload || {}), leads: targets };
      toast.loading(`משגר ל-${targets.length} יעדים…`, { id: 'ivr-dispatch' });
      const { data, error } = await supabase.functions.invoke('ivr-broadcast', { body: payload });
      toast.dismiss('ivr-dispatch');
      if (error || (data as any)?.error) {
        toast.error(`הוצאת השיחה נכשלה: ${(data as any)?.error ?? error?.message ?? ''}`);
        return;
      }
      const ok = (data as any)?.ok ?? 0;
      const failed = (data as any)?.failed ?? 0;
      toast.success(`שודרו ${ok} שיחות${failed ? ` · ${failed} נכשלו` : ''}`);
    } catch (e: any) {
      toast.dismiss('ivr-dispatch');
      toast.error(`הוצאת השיחה נכשלה: ${e?.message ?? 'שגיאה'}`);
    } finally {
      setDispatching(false);
    }
  };

  const dispatchFromHistory = (item: HistoryItem) => dispatchAudio(item.audioUrl);

  const dispatchCurrent = async () => {
    if (source === 'tts') {
      // create audio if no fresh one is generated, then dispatch
      const last = history[0];
      if (last && last.text === ttsText.trim()) return dispatchAudio(last.audioUrl);
      if (!ttsText.trim()) { toast.error('צרו אודיו תחילה'); return; }
      await generateTtsAudio();
      const newest = loadHistory()[0];
      if (newest) await dispatchAudio(newest.audioUrl);
    } else if (source === 'recording' && recordedBlob) {
      await dispatchAudio(null, {
        source: 'recording',
        audio_b64: arrayBufferToBase64(await recordedBlob.arrayBuffer()),
        ext: 'webm',
      });
    } else if (source === 'upload' && uploadFile) {
      await dispatchAudio(null, {
        source: 'upload',
        audio_b64: arrayBufferToBase64(await uploadFile.arrayBuffer()),
        ext: uploadFile.name.split('.').pop()?.toLowerCase() || 'mp3',
      });
    } else {
      toast.error('אין אודיו לשליחה');
    }
  };

  const tabBtn = (id: SourceType, label: string, Icon: any) => (
    <button
      type="button"
      onClick={() => setSource(id)}
      className={cn(
        'flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-colors border',
        source === id
          ? 'bg-[#0f1b3d] text-white border-[#0f1b3d] shadow-sm'
          : 'bg-background text-[#0f1b3d] border-[#0f1b3d]/15 hover:bg-muted/40',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  const mm = String(Math.floor(recElapsed / 60)).padStart(2, '0');
  const ss = String(recElapsed % 60).padStart(2, '0');

  const audienceCount = targetLeads.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto p-5" dir="rtl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-center text-[#0f1b3d] text-[17px] font-bold leading-tight">
            מערך שידור והפצה לאומי · IVR וקול AI
          </DialogTitle>
          <DialogDescription className="text-center text-[12px] text-muted-foreground">
            צרו הודעה קולית והפיצו אותה לרשימת יעד
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Top 3-tab toggle: TTS active first */}
          <div className="flex gap-2">
            {tabBtn('tts', 'טקסט לדיבור', Volume2)}
            {tabBtn('recording', 'הקלטה', Mic)}
            {tabBtn('upload', 'העלאת קובץ', Upload)}
          </div>

          {source === 'tts' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[#0f1b3d] text-right block">בחירת נציג/ת AI להקלטה</label>
                <Select value={agentVoiceId} onValueChange={setAgentVoiceId} dir="rtl">
                  <SelectTrigger className="w-full h-12 text-right border-[#0f1b3d]/20 rounded-xl bg-background font-semibold">
                    <SelectValue placeholder="נציג AI">{agentLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {allAgents.map((a) => (
                      <SelectItem key={a.voice_id} value={a.voice_id} className="pe-8">
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="truncate">{a.label}</span>
                          <button
                            type="button"
                            aria-label="השמע דוגמה"
                            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); playVoicePreview(a); }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted text-[#0f1b3d]"
                          >
                            {previewingVoiceId === a.voice_id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </SelectItem>
                    ))}
                    <div className="border-t border-border/60 my-1" />
                    <button type="button" onClick={() => setAddVoiceOpen(true)}
                      className="w-full flex items-center gap-2 px-2 py-2 text-right text-[13px] font-medium text-[#0f1b3d] hover:bg-muted/50 rounded-md">
                      <Plus className="h-4 w-4" /> הוסף קול (שיבוט מהיר)
                    </button>
                    <button type="button" onClick={() => setAddVoiceOpen(true)}
                      className="w-full flex items-center gap-2 px-2 py-2 text-right text-[13px] font-medium text-[#0f1b3d] hover:bg-muted/50 rounded-md">
                      <Plus className="h-4 w-4" /> הוסף קול לפי Voice ID של ElevenLabs
                    </button>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[#0f1b3d] text-right block">בחירת נכס לקמפיין</label>
                <Select value={listingId} onValueChange={setListingId} dir="rtl">
                  <SelectTrigger className="w-full h-12 text-right border-[#0f1b3d]/20 rounded-xl bg-background font-semibold">
                    <SelectValue placeholder="קדם נכס ספציפי מהמאגר" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="none">ללא נכס · הודעה כללית</SelectItem>
                    {listings.map((l) => (
                      <SelectItem key={l.id} value={l.id} className="pe-2">
                        <span className="truncate block max-w-[22rem]">{listingLabel(l)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedListing && (
                  <p className="text-[11px] text-muted-foreground text-right leading-snug">
                    הטקסט שייווצר ישלב אוטומטית את פרטי הנכס (כתובת, חדרים, מחיר) למסר מותאם.
                  </p>
                )}
              </div>

              <Textarea
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder={selectedListing ? "כתבו זווית/הצעה — פרטי הנכס ישולבו אוטומטית" : "הקלידו את ההודעה שתישמע ביעד..."}
                className="text-right min-h-[120px] border-[#0f1b3d]/20 rounded-xl bg-background"
              />


              <div className="flex justify-start">
                <Button
                  onClick={generateTtsAudio}
                  disabled={generatingTts || !ttsText.trim()}
                  className="bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 px-6 rounded-xl font-semibold"
                >
                  <Volume2 className="ml-2 h-4 w-4" />
                  {generatingTts ? 'יוצר…' : 'צור אודיו'}
                </Button>
              </div>
            </div>
          )}

          {source === 'recording' && (
            <div className="rounded-xl border border-[#0f1b3d]/15 bg-muted/30 p-5 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', recording ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/40')} />
                {recording ? 'מקליט…' : recordedBlob ? 'הקלטה מוכנה' : 'מוכן להקלטה'}
              </div>
              <div className="text-3xl font-mono tabular-nums text-[#0f1b3d]" dir="ltr">{mm}:{ss}</div>
              {!recording ? (
                <Button onClick={startRecording} className="bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 px-6 rounded-xl">
                  <Mic className="ml-2 h-4 w-4" /> התחל הקלטה
                </Button>
              ) : (
                <Button onClick={stopRecording} variant="destructive" className="h-11 px-6 rounded-xl">
                  <Square className="ml-2 h-4 w-4" /> עצור הקלטה
                </Button>
              )}
              {recordedBlob && !recording && (
                <audio controls src={URL.createObjectURL(recordedBlob)} className="mx-auto mt-2 w-full max-w-xs" />
              )}
            </div>
          )}

          {source === 'upload' && (
            <label className="rounded-xl border-2 border-dashed border-[#0f1b3d]/25 bg-muted/30 p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-muted/50">
              <Upload className="h-8 w-8 text-[#0f1b3d]/50" />
              <p className="text-xs text-muted-foreground text-center">גררו לכאן קובץ mp3 / wav / m4a או לחצו לבחירה</p>
              <input type="file" accept="audio/*" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} className="hidden" />
              <div className="text-[11px] text-[#0f1b3d] font-medium">{uploadFile ? uploadFile.name : 'בחרו קובץ'}</div>
            </label>
          )}

          {/* Audience selector */}
          <div className="space-y-2">
            <Select value={audience} onValueChange={(v) => setAudience(v as AudienceMode)} dir="rtl">
              <SelectTrigger className="w-full h-12 text-right border-[#0f1b3d]/20 rounded-xl bg-background">
                <SelectValue placeholder="למי מחייגים?" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">כל הרשימה ({loadingLeads ? '…' : leads.length})</SelectItem>
                <SelectItem value="manual">בחירה מהרשימה</SelectItem>
                <SelectItem value="csv">העלאת רשימה (CSV / Excel)</SelectItem>
                <SelectItem value="paste">הדבקת טקסט</SelectItem>
              </SelectContent>
            </Select>

            {audience === 'manual' && (
              <div className="rounded-xl border border-[#0f1b3d]/15 bg-background">
                <div className="p-2 border-b border-[#0f1b3d]/10">
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש לפי שם או טלפון..."
                    className="text-right h-9 rounded-lg" />
                </div>
                <label className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#0f1b3d]/10 bg-muted/40 cursor-pointer">
                  <span className="text-xs font-semibold text-[#0f1b3d]">בחר הכל ({filteredLeads.length})</span>
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered} />
                </label>
                <div className="max-h-44 overflow-y-auto divide-y divide-border/50">
                  {filteredLeads.map((l) => (
                    <label key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                      <div className="flex-1 min-w-0 text-right">
                        <div className="text-sm font-medium truncate">{l.full_name || 'ללא שם'}</div>
                        <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">{formatPhoneDisplay(l.phone)}</div>
                      </div>
                      <Checkbox checked={selectedLeadIds.has(l.id)} onCheckedChange={() => toggleLead(l.id)} />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {audience === 'csv' && (
              <div className="rounded-xl border border-[#0f1b3d]/15 bg-background p-3 space-y-2">
                <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])} />
                <Button variant="outline" onClick={() => csvInputRef.current?.click()} className="w-full rounded-lg">
                  <Upload className="ml-2 h-4 w-4" /> בחירת קובץ CSV / Excel
                </Button>
                {csvPhones.length > 0 && (
                  <div className="text-[11px] text-muted-foreground text-right">נטענו {csvPhones.length} מספרים</div>
                )}
              </div>
            )}

            {audience === 'paste' && (
              <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                placeholder="הדביקו מספרי טלפון, מופרדים בפסיק / רווח / שורה חדשה"
                className="text-right min-h-[90px] rounded-xl border-[#0f1b3d]/20" />
            )}

            {audience && audienceCount > 0 && (
              <div className="text-[11px] text-muted-foreground text-right flex items-center justify-end gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                {audienceCount} יעדים נבחרו
              </div>
            )}
          </div>

          {/* Dispatch button */}
          <Button onClick={dispatchCurrent} disabled={dispatching || audienceCount === 0}
            className="w-full bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-12 rounded-xl text-base font-semibold">
            <PhoneForwarded className="ml-2 h-5 w-5" />
            {dispatching ? 'משגר…' : 'שגר חיוג קולי'}
          </Button>

          {/* History feed */}
          {history.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-[#0f1b3d]/10">
              <div className="text-[12px] font-semibold text-[#0f1b3d] text-right">היסטוריית אודיו</div>
              <div className="space-y-2">
                {history.map((h, idx) => (
                  <div key={h.id}
                    className={cn(
                      'rounded-xl border bg-background p-3 flex items-start gap-3',
                      idx === 0 ? 'border-[#0f1b3d] ring-1 ring-[#0f1b3d]/20' : 'border-[#0f1b3d]/15',
                    )}>
                    <button type="button" onClick={() => playHistory(h)}
                      className="shrink-0 h-9 w-9 rounded-lg border border-[#0f1b3d]/20 flex items-center justify-center hover:bg-muted/50">
                      {playingId === h.id ? <Pause className="h-4 w-4 text-[#0f1b3d]" /> : <Play className="h-4 w-4 text-[#0f1b3d]" />}
                    </button>
                    <div className="flex-1 min-w-0 text-right space-y-1">
                      <div className="text-[12.5px] leading-snug text-foreground whitespace-pre-wrap">{h.text}</div>
                      <div className="text-[10.5px] text-muted-foreground font-mono" dir="ltr">
                        {h.agentName} · {fmtTs(h.createdAt)}
                      </div>
                      {audience && audienceCount > 0 && (
                        <button type="button" onClick={() => dispatchFromHistory(h)}
                          className="text-[10.5px] text-[#0f1b3d] underline hover:text-[#1e3a5f]">
                          שגר אודיו זה
                        </button>
                      )}
                    </div>
                    <button type="button" onClick={() => deleteHistory(h.id)}
                      className="shrink-0 h-9 w-9 rounded-lg border border-[#0f1b3d]/15 flex items-center justify-center hover:bg-red-50 hover:border-red-200">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
      <AddVoiceDialog
        open={addVoiceOpen}
        onClose={() => setAddVoiceOpen(false)}
        onAdded={(v) => {
          setClonedVoices((prev) => [{ id: v.id, name: v.name, voice_id: v.voice_id }, ...prev]);
          setAgentVoiceId(v.voice_id);
        }}
      />
    </Dialog>
  );
};
