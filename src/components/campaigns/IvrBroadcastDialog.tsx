import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Volume2, Upload, PhoneForwarded, Square, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatPhoneDisplay } from '@/lib/formatPhone';

type IvrLead = { id: string; full_name: string | null; phone: string | null; city?: string | null };
type ClonedVoice = { id: string; name: string; voice_id: string; preview_url?: string | null };

const PRESET_VOICES: { id: string; label: string; voice_id: string }[] = [
  { id: 'sarah',   label: 'שרה (אישה)',     voice_id: 'EXAVITQu4vr4xnSDxMaL' },
  { id: 'matilda', label: 'מטילדה (אישה)',  voice_id: 'XrExE9yKIg1WjnnlVkGX' },
  { id: 'charlie', label: 'צ׳רלי (גבר)',    voice_id: 'IKne3meq5aSn9XLyUdCD' },
];

type SourceType = 'recording' | 'tts' | 'upload';

const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
};

export const IvrBroadcastDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [source, setSource] = useState<SourceType>('recording');
  const [leads, setLeads] = useState<IvrLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [listGroup, setListGroup] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Tab A — recording
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<number | null>(null);

  // Tab B — TTS
  const [ttsVoice, setTtsVoice] = useState<string>(PRESET_VOICES[0].voice_id);
  const [clonedVoices, setClonedVoices] = useState<ClonedVoice[]>([]);
  const [ttsText, setTtsText] = useState('');
  const [generatingTts, setGeneratingTts] = useState(false);
  const [ttsPreviewUrl, setTtsPreviewUrl] = useState<string | null>(null);

  // Tab C — upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [dispatching, setDispatching] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!open || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    (async () => {
      setLoadingLeads(true);
      const [{ data: leadRows }, { data: voiceRows }] = await Promise.all([
        supabase.from('leads').select('id, full_name, phone_number, city')
          .not('phone_number', 'is', null).order('full_name', { ascending: true }).limit(1000),
        supabase.from('cloned_voices').select('id, name, voice_id, preview_url').order('created_at', { ascending: false }),
      ]);
      setLeads(((leadRows as any[]) ?? []).map((r) => ({
        id: r.id, full_name: r.full_name, phone: r.phone_number, city: r.city,
      })));
      setClonedVoices((voiceRows ?? []) as ClonedVoice[]);
      setLoadingLeads(false);
    })();
  }, [open]);

  const allVoices = useMemo(
    () => [
      ...PRESET_VOICES,
      ...clonedVoices.map((v) => ({ id: `cv:${v.id}`, label: `${v.name} (קול מותאם)`, voice_id: v.voice_id })),
    ],
    [clonedVoices],
  );

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    const digits = q.replace(/\D/g, '');
    return leads.filter((l) =>
      (l.full_name ?? '').toLowerCase().includes(q) ||
      (l.city ?? '').toLowerCase().includes(q) ||
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

  // TTS generate preview
  const generateTtsPreview = async () => {
    if (!ttsText.trim()) { toast.error('הקלידו טקסט'); return; }
    setGeneratingTts(true);
    try {
      const { data, error } = await supabase.functions.invoke('ivr-broadcast', {
        body: { source: 'tts', text: ttsText.trim(), voice_id: ttsVoice, leads: [{ phone: '+972000000000' }], dry_run: true },
      });
      // dry_run not supported; we use a lighter path: just request the audio_url after upload
      // Backend will reject without twilio; fall back to using audio_url it returned
      if ((data as any)?.audio_url) {
        setTtsPreviewUrl((data as any).audio_url);
        toast.success('האודיו נוצר');
      } else if ((data as any)?.error === 'twilio_not_configured' && (data as any)?.audio_url) {
        setTtsPreviewUrl((data as any).audio_url);
        toast.success('האודיו נוצר (Twilio לא מחובר עדיין)');
      } else {
        toast.error(`יצירת אודיו נכשלה: ${(data as any)?.error ?? error?.message ?? ''}`);
      }
    } finally {
      setGeneratingTts(false);
    }
  };

  const targetLeads = useMemo(() => {
    if (listGroup === 'manual') return leads.filter((l) => selectedLeadIds.has(l.id));
    if (listGroup === 'all') return leads;
    return [];
  }, [listGroup, leads, selectedLeadIds]);

  const canDispatch = !dispatching && targetLeads.length > 0 && (
    (source === 'recording' && !!recordedBlob) ||
    (source === 'tts' && (ttsText.trim().length > 0 || !!ttsPreviewUrl)) ||
    (source === 'upload' && !!uploadFile)
  );

  const dispatch = async () => {
    setDispatching(true);
    try {
      const payload: Record<string, unknown> = {
        source,
        leads: targetLeads.map((l) => ({ id: l.id, phone: l.phone ?? '' })).filter((x) => x.phone),
      };
      if (ttsPreviewUrl && source === 'tts') {
        payload.audio_url = ttsPreviewUrl;
      } else if (source === 'tts') {
        payload.text = ttsText.trim();
        payload.voice_id = ttsVoice;
      } else if (source === 'recording' && recordedBlob) {
        payload.audio_b64 = arrayBufferToBase64(await recordedBlob.arrayBuffer());
        payload.ext = 'webm';
      } else if (source === 'upload' && uploadFile) {
        payload.audio_b64 = arrayBufferToBase64(await uploadFile.arrayBuffer());
        payload.ext = uploadFile.name.split('.').pop()?.toLowerCase() || 'mp3';
      }

      toast.loading(`משגר ל-${(payload.leads as any[]).length} יעדים…`, { id: 'ivr-dispatch' });
      const { data, error } = await supabase.functions.invoke('ivr-broadcast', { body: payload });
      toast.dismiss('ivr-dispatch');
      if (error || (data as any)?.error) {
        toast.error(`שגיאה: ${(data as any)?.error ?? error?.message ?? ''}`);
        return;
      }
      const ok = (data as any)?.ok ?? 0;
      const failed = (data as any)?.failed ?? 0;
      toast.success(`שודרו ${ok} שיחות${failed ? ` · ${failed} נכשלו` : ''}`);
      onClose();
    } finally {
      setDispatching(false);
    }
  };

  const tabBtn = (id: SourceType, label: string, Icon: any) => (
    <button
      type="button"
      onClick={() => setSource(id)}
      className={cn(
        'flex-1 flex items-center justify-center gap-2 h-11 rounded-lg text-sm font-semibold transition-colors border',
        source === id
          ? 'bg-[#0f1b3d] text-white border-[#0f1b3d] shadow-sm'
          : 'bg-muted/40 text-[#0f1b3d] border-[#0f1b3d]/15 hover:bg-muted/70',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  const mm = String(Math.floor(recElapsed / 60)).padStart(2, '0');
  const ss = String(recElapsed % 60).padStart(2, '0');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-[#0f1b3d] text-lg font-bold">
            מערך שידור והפצה לאומי · IVR וקול AI
          </DialogTitle>
          <DialogDescription className="text-right text-[12px] text-muted-foreground">
            צרו הודעה קולית והפיצו אותה לרשימת יעד · עלות ₪0.20 לדקה ליעד
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Top segmented tabs */}
          <div className="flex gap-2">
            {tabBtn('recording', 'הקלטה', Mic)}
            {tabBtn('tts', 'טקסט לדיבור', Volume2)}
            {tabBtn('upload', 'העלאת קובץ', Upload)}
          </div>

          {/* Dynamic container */}
          {source === 'recording' && (
            <div className="rounded-xl border border-[#0f1b3d]/15 bg-muted/30 p-5 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', recording ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/40')} />
                {recording ? 'מקליט…' : recordedBlob ? 'הקלטה מוכנה' : 'מוכן להקלטה'}
              </div>
              <div className="text-3xl font-mono tabular-nums text-[#0f1b3d]" dir="ltr">{mm}:{ss}</div>
              {!recording ? (
                <Button onClick={startRecording} className="bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 px-6">
                  <Mic className="ml-2 h-4 w-4" /> התחל הקלטה
                </Button>
              ) : (
                <Button onClick={stopRecording} variant="destructive" className="h-11 px-6">
                  <Square className="ml-2 h-4 w-4" /> עצור הקלטה
                </Button>
              )}
              {recordedBlob && !recording && (
                <audio controls src={URL.createObjectURL(recordedBlob)} className="mx-auto mt-2 w-full max-w-xs" />
              )}
            </div>
          )}

          {source === 'tts' && (
            <div className="rounded-xl border border-[#0f1b3d]/15 bg-muted/30 p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0f1b3d] text-right block">בחר קול</label>
                <Select value={ttsVoice} onValueChange={setTtsVoice} dir="rtl">
                  <SelectTrigger className="w-full text-right border-[#0f1b3d]/30 focus:ring-[#C9A84C]">
                    <SelectValue placeholder="בחירת נציג/ת AI" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {allVoices.map((v) => (
                      <SelectItem key={v.id} value={v.voice_id}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0f1b3d] text-right block">טקסט להמרה</label>
                <Textarea
                  value={ttsText}
                  onChange={(e) => { setTtsText(e.target.value); setTtsPreviewUrl(null); }}
                  placeholder="הקלידו את ההודעה שתישמע ביעד..."
                  className="text-right min-h-[110px] border-[#0f1b3d]/30 focus-visible:ring-[#C9A84C] bg-background"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                {ttsPreviewUrl ? (
                  <audio controls src={ttsPreviewUrl} className="flex-1 h-9" />
                ) : <span />}
                <Button onClick={generateTtsPreview} disabled={generatingTts || !ttsText.trim()}
                  variant="outline" className="border-[#0f1b3d]/30 text-[#0f1b3d]">
                  <Volume2 className="ml-2 h-4 w-4" />
                  {generatingTts ? 'יוצר…' : 'צור אודיו'}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-right leading-tight">
                ElevenLabs Multilingual v3 · עברית
              </p>
            </div>
          )}

          {source === 'upload' && (
            <label className="rounded-xl border-2 border-dashed border-[#0f1b3d]/25 bg-muted/30 p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="h-8 w-8 text-[#0f1b3d]/50" />
              <p className="text-xs text-muted-foreground text-center">
                גררו לכאן קובץ mp3 / wav / m4a או לחצו לבחירה
              </p>
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <div className="text-[11px] text-[#0f1b3d] font-medium">
                {uploadFile ? uploadFile.name : 'Choose File · No file chosen'}
              </div>
            </label>
          )}

          {/* Shared target picker */}
          <div className="space-y-2 pt-2 border-t border-[#0f1b3d]/10">
            <label className="text-xs font-semibold text-[#0f1b3d] text-right block">רשימת יעד</label>
            <Select value={listGroup} onValueChange={setListGroup} dir="rtl">
              <SelectTrigger className="w-full h-11 text-right border-[#0f1b3d]/20 focus:ring-[#C9A84C]">
                <SelectValue placeholder="למי מחייגים?" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">כל הרשימה ({loadingLeads ? '…' : leads.length})</SelectItem>
                <SelectItem value="manual">בחירה מהרשימה</SelectItem>
              </SelectContent>
            </Select>

            {listGroup === 'manual' && (
              <div className="rounded-lg border border-[#0f1b3d]/15 bg-background">
                <div className="p-2 border-b border-[#0f1b3d]/10">
                  <Input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="חיפוש לפי שם או טלפון..."
                    className="text-right h-9 border-[#0f1b3d]/20 focus-visible:ring-[#C9A84C]" />
                </div>
                <label className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#0f1b3d]/10 bg-muted/40 cursor-pointer">
                  <span className="text-xs font-semibold text-[#0f1b3d]">בחר הכל ({filteredLeads.length})</span>
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered}
                    className="data-[state=checked]:bg-[#0f1b3d] data-[state=checked]:border-[#0f1b3d]" />
                </label>
                <div className="max-h-52 overflow-y-auto divide-y divide-border/50">
                  {loadingLeads && <div className="p-3 text-center text-xs text-muted-foreground">טוען…</div>}
                  {!loadingLeads && filteredLeads.length === 0 && (
                    <div className="p-3 text-center text-xs text-muted-foreground">לא נמצאו מתעניינים</div>
                  )}
                  {!loadingLeads && filteredLeads.map((l) => {
                    const checked = selectedLeadIds.has(l.id);
                    return (
                      <label key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                        <div className="flex-1 min-w-0 text-right">
                          <div className="text-sm font-medium text-foreground truncate">{l.full_name || 'ללא שם'}</div>
                          <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                            {formatPhoneDisplay(l.phone)}
                          </div>
                        </div>
                        <Checkbox checked={checked} onCheckedChange={() => toggleLead(l.id)}
                          className="rounded-full data-[state=checked]:bg-[#0f1b3d] data-[state=checked]:border-[#0f1b3d]" />
                      </label>
                    );
                  })}
                </div>
                <div className="px-3 py-1.5 text-[11px] text-muted-foreground text-right border-t border-[#0f1b3d]/10">
                  נבחרו {selectedLeadIds.size}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button onClick={dispatch} disabled={!canDispatch}
            className="w-full bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 text-base font-semibold shadow-md">
            <PhoneForwarded className="ml-2 h-5 w-5" />
            {dispatching ? 'משגר…' : 'שגר חיוג קולי (IVR)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
