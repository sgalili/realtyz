import { formatIvrDuration, ivrMaximumEstimate, readIvrAudioDuration } from '@/lib/ivrAudioDuration';
import { useCampaignPricing } from '@/hooks/useCampaignPricing';
import { campaignServicePrice, formatCampaignCredits } from '@/lib/campaignServicePricing';
import { IVR_DEFAULT_VOICES } from '../../../supabase/functions/_shared/ivrVoices';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { CampaignServiceIcon } from '@/components/campaigns/CampaignServiceIcon';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Mic, Volume2, Upload, Square, Play, Pause, Trash2, Check, PhoneForwarded, Plus, RefreshCw, Search, Loader2 } from 'lucide-react';
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

const PRESET_VOICES = IVR_DEFAULT_VOICES;

type SourceType = 'tts' | 'recording' | 'upload';
type AudienceMode = 'all' | 'manual' | 'csv' | 'paste';

type HistoryItem = {
  id: string;
  text: string;
  agentName: string;
  audioUrl: string;
  durationSeconds?: number | null;
  voiceId?: string;
  createdAt: string; // ISO
};

const HISTORY_KEY = 'realtyz_ivr_audio_history';

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
  const workspaceId = useActiveWorkspaceOwnerId();
  const { user } = useAuth();
  const historyKey = `${HISTORY_KEY}:${user?.id}:${workspaceId}`;
  const loadScopedHistory = (): HistoryItem[] => { try { return JSON.parse(localStorage.getItem(historyKey) || '[]'); } catch { return []; } };
  const saveScopedHistory = (items: HistoryItem[]) => { try { localStorage.setItem(historyKey, JSON.stringify(items.slice(0, 50))); } catch { /* ignore */ } };
  const { data: prices = [] } = useCampaignPricing(open);
  const price = campaignServicePrice('ivr', prices);
  const [includeWhatsapp, setIncludeWhatsapp] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState<number | null>(null);
  const [review, setReview] = useState<{ audioUrl: string | null; payload?: Record<string, unknown>; seconds: number | null } | null>(null);
  const [source, setSource] = useState<SourceType>('tts');
  const [leads, setLeads] = useState<IvrLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [clonedVoices, setClonedVoices] = useState<ClonedVoice[]>([]);
  const [agentVoiceId, setAgentVoiceId] = useState<string>('');
  const [addVoiceOpen, setAddVoiceOpen] = useState(false);
  const [listings, setListings] = useState<ListingOpt[]>([]);
  const [listingId, setListingId] = useState<string>('');
  const [ownerName, setOwnerName] = useState<string>('');

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
  const [autoScripting, setAutoScripting] = useState(false);
  const lastAutoScriptRef = useRef<string>('');
  const [listingSearch, setListingSearch] = useState('');

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
  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    setHistory(loadScopedHistory());
    setClonedVoices([]); setLeads([]); setListings([]); setListingId('');
    setAgentVoiceId(''); setTtsText(''); setAudioSeconds(null);
    setSelectedLeadIds(new Set()); setAudience(''); setIncludeWhatsapp(false); setReview(null);
    (async () => {
      setLoadingLeads(true);
      const [{ data: leadRows }, { data: voiceRows }, { data: listingRows }, { data: ownerRow }] = await Promise.all([
        supabase.from('leads').select('id, full_name, phone_number, city')
          .eq('workspace_owner_id', workspaceId)
          .not('phone_number', 'is', null).order('full_name', { ascending: true }).limit(1000),
        supabase.from('cloned_voices').select('id, name, voice_id, preview_url').eq('workspace_owner_id', workspaceId).order('created_at', { ascending: false }),
        supabase.from('listings')
          .select('id, property_title, address, city, neighborhood, rooms, sqm, asking_price, features')
          .eq('workspace_owner_id', workspaceId)
          .in('status', ['live', 'pending'])
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('profiles').select('full_name').eq('id', workspaceId).maybeSingle(),
      ]);
      if (cancelled) return;
      setOwnerName(String((ownerRow as any)?.full_name ?? '').trim());
      setLeads(((leadRows as any[]) ?? []).map((r) => ({
        id: r.id, full_name: r.full_name, phone: r.phone_number, city: r.city,
      })));
      setClonedVoices((voiceRows ?? []) as ClonedVoice[]);
      setListings((listingRows ?? []) as ListingOpt[]);
      setLoadingLeads(false);
    })();
    return () => { cancelled = true; };
  }, [open, workspaceId, user?.id]);

  const allAgents = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string; voice_id: string; preview_url?: string | null }[] = [];
    const rita = PRESET_VOICES[0];
    seen.add(rita.voice_id);
    out.push({ id: rita.id, label: rita.label, voice_id: rita.voice_id });
    for (const v of clonedVoices) {
      if (!v.voice_id || seen.has(v.voice_id)) continue;
      seen.add(v.voice_id);
      out.push({ id: `cv:${v.id}`, label: v.name.trim().split(/[\s·]+/)[0], voice_id: v.voice_id, preview_url: v.preview_url ?? null });
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

  // Every message must open with the agent introducing herself/himself as the
  // digital assistant of the ad owner, using the chosen voice's first name.
  const introLine = useMemo(() => {
    const voice = allAgents.find((a) => a.voice_id === agentVoiceId);
    const name = voice?.label || PRESET_VOICES[0].label;
    const feminine = (voice?.voice_id ?? PRESET_VOICES[0].voice_id) === PRESET_VOICES[0].voice_id;
    const owner = ownerName || 'המשרד';
    return `שלום, אני ${name}, ${feminine ? 'העוזרת הדיגיטלית' : 'העוזר הדיגיטלי'} של ${owner}.`;
  }, [allAgents, agentVoiceId, ownerName]);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  const previewRequestRef = useRef(0);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const demoCache = useRef(new Map<string, Promise<string>>());
  const demoTexts = ['שלום, שמחתי לשמוע על ההתעניינות שלכם. מוזמנים לקבל פרטים נוספים ולתאם ביקור.', 'היי, נעים להכיר. אשמח לספר לכם בקצרה על הנכס ולהזמין אתכם לביקור.'];
  const getDemo = (voiceId: string, sample: number) => {
    const key = `${workspaceId}:${voiceId}:${sample}`;
    const cached = demoCache.current.get(key);
    if (cached) return cached;
    const request = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('נדרשת התחברות');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ivr-broadcast`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'tts', text: demoTexts[sample], voice_id: voiceId, generate_only: true, preview_only: true }),
      });
      if (!response.ok) throw new Error(await response.text());
      return URL.createObjectURL(await response.blob());
    })();
    demoCache.current.set(key, request);
    void request.catch(() => demoCache.current.delete(key));
    return request;
  };
  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    void (async () => {
      for (const voice of PRESET_VOICES) {
        for (let sample = 0; sample < demoTexts.length; sample++) {
          if (cancelled) return;
          try { await getDemo(voice.voice_id, sample); } catch { /* Retry only on an explicit demo click. */ }
        }
      }
    })();
    return () => {
      cancelled = true;
      previewRequestRef.current++;
      previewAudioRef.current?.pause();
      setPreviewingVoiceId(null); setLoadingPreviewId(null);
      for (const pending of demoCache.current.values()) void pending.then(url => URL.revokeObjectURL(url)).catch(() => {});
      demoCache.current.clear();
    };
  }, [open, workspaceId]);
  const playVoicePreview = async (voice: { voice_id: string; label: string }) => {
    const request = ++previewRequestRef.current;
    previewAudioRef.current?.pause();
    if (previewingVoiceId === voice.voice_id) { setPreviewingVoiceId(null); return; }
    setPreviewingVoiceId(null); setLoadingPreviewId(voice.voice_id);
    try {
      const url = await getDemo(voice.voice_id, Math.floor(Math.random() * demoTexts.length));
      if (request !== previewRequestRef.current) return;
      const audio = new Audio(url);
      audio.setAttribute('data-allow-sound', 'true');
      previewAudioRef.current = audio;
      audio.onended = () => { if (previewAudioRef.current === audio) setPreviewingVoiceId(null); };
      await audio.play();
      setPreviewingVoiceId(voice.voice_id);
    } catch (error: any) {
      if (request === previewRequestRef.current) toast.error(`הדגמת הקול נכשלה: ${error?.message ?? 'שגיאה'}`);
    } finally {
      if (request === previewRequestRef.current) setLoadingPreviewId(null);
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

  // Filtered listings for dropdown free-search
  const filteredListings = useMemo(() => {
    const q = listingSearch.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((l) => {
      const hay = [l.property_title, l.address, l.neighborhood, l.city, l.rooms ? `${l.rooms} חדרים` : '']
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [listings, listingSearch]);

  // Auto-generate a punchy promo script when a property is selected
  const autoGenerateScriptForListing = async (l: ListingOpt | null) => {
    setAutoScripting(true);
    try {
      const facts: string[] = [];
      if (l?.property_title) facts.push(l.property_title);
      if (l?.address) facts.push(`כתובת ${l.address}`);
      if (l?.neighborhood) facts.push(`שכונת ${l.neighborhood}`);
      if (l?.city) facts.push(l.city);
      if (l?.rooms) facts.push(`${l.rooms} חדרים`);
      if (l?.sqm) facts.push(`${l.sqm} מ"ר`);
      if (l?.asking_price) facts.push(`מחיר ${Number(l.asking_price).toLocaleString('he-IL')} ₪`);
      const topic = `כתוב הודעת מכירה קולית חד-צדדית קצרה למי שמתעניין בנכס הזה בלבד, 2-4 משפטים עד כ-35 שניות בהקראה. עובדות: ${l ? facts.join(', ') : 'הודעה כללית בלבד ללא פרטי נכס מומצאים. כוונת המשתמש: ' + ttsText.trim().slice(0, 1500)}. ללא אימוג׳ים, עיצוב פוסט, חתימה, טלפון, רישיון או מלל מיותר. סיים בהזמנה קצרה לתיאום ביקור, ללא שאלות או הוראות ללחיצה על מקש. וריאציה חדשה ${crypto.randomUUID()}: שנה את הפתיחה והניסוח אך לא את העובדות. אין לחזור על התסריט הקודם: ${lastAutoScriptRef.current.slice(0, 700)}`;
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: { topic, platform: 'ivr', selectedListingId: l?.id, listingFocusOnly: !!l },
      });
      if (error) throw new Error(error.message);
      const text = String((data as any)?.content ?? (data as any)?.text ?? '').trim();
      if (!text) throw new Error('empty');
      setTtsText(text);
      lastAutoScriptRef.current = text;
    } catch (e: any) {
      toast.error(`יצירת סקריפט נכשלה: ${e?.message ?? 'שגיאה'}`);
    } finally {
      setAutoScripting(false);
    }
  };

  // Re-generate variation
  const regenerateScript = () => {
    void autoGenerateScriptForListing(selectedListing);
  };

  // When listing changes, auto-generate
  useEffect(() => {
    if (selectedListing) autoGenerateScriptForListing(selectedListing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  // Generate TTS audio (calls ivr-broadcast in generate-only mode for an audio_url)
  const generateTtsAudio = async () => {
    if (!ttsText.trim()) { toast.error('הקלידו טקסט'); return; }
    if (!agentVoiceId) { toast.error('בחרו נציג/ת AI להקלטה'); return; }
    setGeneratingTts(true);
    try {
      const finalText = `${introLine} ${ttsText.trim()}`;
      const { data, error } = await supabase.functions.invoke('ivr-broadcast', {
        body: { source: 'tts', text: finalText, voice_id: agentVoiceId, generate_only: true },
      });
      const audioUrl = (data as any)?.audio_url;
      if (error || !audioUrl) {
        toast.error(`הפקת האודיו נכשלה${(data as any)?.error ? `: ${(data as any).error}` : ''}`);
        return;
      }
      const durationSeconds = await readIvrAudioDuration(audioUrl);
      const item: HistoryItem = {
        id: crypto.randomUUID(),
        text: ttsText.trim(),
        agentName: agentLabel,
        audioUrl,
        durationSeconds,
        voiceId: agentVoiceId,
        createdAt: new Date().toISOString(),
      };
      const next = [item, ...history];
      setHistory(next); saveScopedHistory(next);
      setAudioSeconds(durationSeconds);
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

  const currentAudio = history.find(item => item.text === ttsText.trim() && item.voiceId === agentVoiceId);
  const localAudio = source === 'recording' ? recordedBlob : source === 'upload' ? uploadFile : null;
  useEffect(() => {
    let cancelled = false;
    setAudioSeconds(null);
    const localUrl = localAudio ? URL.createObjectURL(localAudio) : null;
    const url = source === 'tts' ? currentAudio?.audioUrl : localUrl;
    if (url) {
      void readIvrAudioDuration(url).then(seconds => { if (!cancelled) setAudioSeconds(seconds); });
    }
    return () => { cancelled = true; if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [source, localAudio, currentAudio?.audioUrl]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const missing = history.filter(item => item.durationSeconds == null);
    if (missing.length) void Promise.all(missing.map(async item => ({ id: item.id, seconds: await readIvrAudioDuration(item.audioUrl) }))).then(results => {
      if (cancelled || !results.some(result => result.seconds != null)) return;
      setHistory(previous => {
        const next = previous.map(item => ({ ...item, durationSeconds: item.durationSeconds ?? results.find(result => result.id === item.id)?.seconds }));
        saveScopedHistory(next);
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [open, historyKey, history]);

  const selectedSeconds = review ? review.seconds : audioSeconds;
  const totalCredits = ivrMaximumEstimate(prices, targetLeads.length, selectedSeconds, includeWhatsapp);
  const totalLabel = totalCredits != null ? formatCampaignCredits(totalCredits) : selectedSeconds == null ? 'מחיר יחושב לאחר מדידת ההקלטה' : 'המחירון אינו זמין';

  const playHistory = (item: HistoryItem) => {
    if (playingId === item.id && audioElRef.current) {
      audioElRef.current.pause();
      setPlayingId(null);
      return;
    }
    if (audioElRef.current) audioElRef.current.pause();
    const a = new Audio(item.audioUrl);
    a.setAttribute('data-allow-sound', 'true');
    a.muted = false;
    a.volume = 1;
    audioElRef.current = a;
    a.onended = () => setPlayingId(null);
    a.play().then(() => setPlayingId(item.id)).catch(() => toast.error('נכשלה ההשמעה'));
  };
  const deleteHistory = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    setHistory(next); saveScopedHistory(next);
  };

  const dispatchAudio = async (audioUrl: string | null, fallbackPayload?: Record<string, unknown>, confirmed = false) => {
    if (!price) { toast.error('המחירון אינו זמין כרגע'); return; }
    if (!confirmed) {
      let seconds: number | null = null;
      const localBlob = recordedBlob ?? uploadFile;
      const localUrl = !audioUrl && localBlob ? URL.createObjectURL(localBlob) : null;
      const url = audioUrl ?? localUrl;
      if (url) {
        seconds = await readIvrAudioDuration(url);
      }
      if (localUrl) URL.revokeObjectURL(localUrl);
      if (seconds == null) { toast.error('לא ניתן למדוד את משך ההקלטה; נסו קובץ אודיו אחר'); return; }
      setAudioSeconds(seconds);
      setReview({ audioUrl, payload: fallbackPayload, seconds });
      return;
    }
    const targets = targetLeads.filter((x) => x.phone);
    if (targets.length === 0) { toast.error('בחרו רשימת יעד'); return; }
    setDispatching(true);
    try {
      const payload: Record<string, unknown> = audioUrl
        ? { source: 'tts', audio_url: audioUrl, leads: targets }
        : { ...(fallbackPayload || {}), leads: targets };
      payload.include_whatsapp = includeWhatsapp;
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
      if (includeWhatsapp) toast.info(`וואטסאפ: ${(data as any)?.whatsapp_ok ?? 0} נשלחו · ${(data as any)?.whatsapp_failed ?? 0} לא נשלחו`);
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
      if (currentAudio) return dispatchAudio(currentAudio.audioUrl);
      if (!ttsText.trim()) { toast.error('צרו אודיו תחילה'); return; }
      await generateTtsAudio();
      const newest = loadScopedHistory()[0];
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
        'flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-[17px] font-semibold transition-colors border',
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
      <DialogContent className="w-full max-w-lg h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto p-5" dir="rtl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-center text-[#0f1b3d] text-[17px] font-bold leading-tight">
            <span className="inline-flex items-center gap-2"><CampaignServiceIcon channel="ivr" />IVR וקול AI</span>
          </DialogTitle>
          <DialogDescription className="text-center text-[12px] text-muted-foreground">
            צרו הודעה קולית והפיצו אותה לרשימת יעד
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <p className="text-center text-xs text-muted-foreground">{price ? `${formatCampaignCredits(price.credits)} ל${price.unit}` : 'המחירון אינו זמין'}</p>
          {/* Top 3-tab toggle: TTS active first */}
          <div className="flex gap-2">
            {tabBtn('tts', 'טקסט לדיבור', Volume2)}
            {tabBtn('recording', 'הקלטה', Mic)}
            {tabBtn('upload', 'העלאת קובץ', Upload)}
          </div>

          {source === 'tts' && (
            <div className="space-y-3">
              <div className="relative space-y-1.5">
                <Select value={agentVoiceId} onValueChange={value => { setAgentVoiceId(value); const voice = allAgents.find(item => item.voice_id === value); if (voice) void playVoicePreview(voice); }} dir="rtl">
                  <SelectTrigger className="w-full h-12 text-[17px] text-right border-[#0f1b3d]/20 rounded-xl bg-background font-semibold pl-16 [&>svg]:absolute [&>svg]:left-2 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2">
                    <SelectValue placeholder="בחירת נציג/ת AI להקלטה">{agentVoiceId ? agentLabel : undefined}</SelectValue>
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {allAgents.map((a) => (
                      <SelectItem key={a.voice_id} value={a.voice_id} className="pe-8 text-[17px]">
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="truncate">{a.label}</span>
                          <Button variant="ghost" size="icon"
                            type="button"
                            aria-label={`השמע דוגמה · ${a.label}`}
                            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); playVoicePreview(a); }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted text-[#0f1b3d]"
                          >
                            {loadingPreviewId === a.voice_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : previewingVoiceId === a.voice_id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </Button>
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
                {agentVoiceId && <Button type="button" variant="ghost" size="icon" aria-label="השמע את הקול הנבחר" title="השמע את הקול הנבחר" className="absolute left-8 top-1 h-9 w-9" onClick={() => { const voice = allAgents.find(item => item.voice_id === agentVoiceId); if (voice) void playVoicePreview(voice); }}>
                  {loadingPreviewId === agentVoiceId ? <Loader2 className="h-4 w-4 animate-spin" /> : previewingVoiceId === agentVoiceId ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>}
              </div>

              <div className="space-y-1.5">
                <Select value={listingId} onValueChange={setListingId} dir="rtl">
                  <SelectTrigger className="w-full h-12 text-[17px] text-right border-[#0f1b3d]/20 rounded-xl bg-background font-semibold">
                    <SelectValue placeholder="בחירת נכס לקמפיין" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <div className="sticky top-0 z-10 bg-popover p-2 border-b border-border/60">
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          autoFocus
                          value={listingSearch}
                          onChange={(e) => setListingSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder="חיפוש לפי כתובת, עיר, חדרים..."
                          className="h-8 text-right text-[12.5px] pr-7 rounded-md"
                        />
                      </div>
                    </div>
                    <SelectItem value="none" className="text-[17px]">ללא נכס · הודעה כללית</SelectItem>
                    {filteredListings.map((l) => (
                      <SelectItem key={l.id} value={l.id} className="pe-2 text-[17px]">
                        <span className="truncate block max-w-[22rem]">{listingLabel(l)}</span>
                      </SelectItem>
                    ))}
                    {filteredListings.length === 0 && (
                      <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">לא נמצאו נכסים תואמים</div>
                    )}
                  </SelectContent>
                </Select>
                {selectedListing && (
                  <p className="text-[11px] text-muted-foreground text-right leading-snug">
                    סקריפט קצר ומותאם נכתב אוטומטית מפרטי הנכס. ניתן לרענן או לערוך ידנית.
                  </p>
                )}
              </div>

              <div className="relative">
                <Textarea
                  value={ttsText}
                  onChange={(e) => {
                    setTtsText(e.target.value);

                  }}
                  placeholder={autoScripting ? 'מייצר תסריט להודעה מוקלטת…' : 'כתבו כאן הודעה קצרה להקראה, או צרו תסריט באמצעות AI.'}
                  className="text-right min-h-[140px] border-[#0f1b3d]/20 rounded-xl bg-background pl-12"
                  disabled={autoScripting}
                />
                <Button variant="outline" size="icon"
                    type="button"
                    onClick={regenerateScript}
                    disabled={autoScripting}
                    title="ייצר מחדש"
                    aria-label="ייצר תסריט חדש"
                    className="absolute top-2 left-2 h-8 w-8"
                  >
                    <RefreshCw className={cn('h-4 w-4 text-foreground', autoScripting && 'animate-spin')} />
                  </Button>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={generateTtsAudio}
                  disabled={generatingTts || !ttsText.trim() || !agentVoiceId}
                  className="bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 px-6 rounded-xl font-semibold text-[17px]"
                >
                  <Volume2 className="ml-2 h-4 w-4" />
                  {generatingTts ? 'יוצר…' : 'צור הודעה מוקלטת'}
                </Button>
              </div>

              {history.length > 0 && (
                <div className="rounded-xl border border-[#0f1b3d]/20 bg-muted/30 p-3 flex items-center gap-3">
                  <button type="button" onClick={() => playHistory(history[0])}
                    className="shrink-0 h-9 w-9 rounded-lg border border-[#0f1b3d]/20 flex items-center justify-center hover:bg-muted/50">
                    {playingId === history[0].id ? <Pause className="h-4 w-4 text-[#0f1b3d]" /> : <Play className="h-4 w-4 text-[#0f1b3d]" />}
                  </button>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-[11px] font-semibold text-[#0f1b3d]">ההקלטה האחרונה</div>
                    <div className="text-[11px] text-muted-foreground truncate">{history[0].text}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {source === 'recording' && (
            <div className="rounded-xl border border-[#0f1b3d]/15 bg-muted/30 p-5 text-center space-y-3">
              <p className="rounded-lg bg-background border border-[#0f1b3d]/10 px-3 py-2 text-[12.5px] text-[#0f1b3d] text-center leading-snug">
                התחילו את ההקלטה בהצגה: <span className="font-semibold">{introLine}</span>
              </p>
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

          {source !== 'tts' && audioSeconds != null && <p className="text-sm text-muted-foreground">משך ההקלטה: <span dir="ltr" className="font-mono tabular-nums">{formatIvrDuration(audioSeconds)}</span></p>}

          {/* Audience selector */}
          <div className="space-y-2">
            <Select value={audience} onValueChange={(v) => setAudience(v as AudienceMode)} dir="rtl">
              <SelectTrigger className="w-full h-12 text-[17px] text-right border-[#0f1b3d]/20 rounded-xl bg-background">
                <SelectValue placeholder={<span className="font-bold">למי מחייגים?</span>} />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all" className="text-[17px]">כל הרשימה ({loadingLeads ? '…' : leads.length})</SelectItem>
                <SelectItem value="manual" className="text-[17px]">בחירה מהרשימה</SelectItem>
                <SelectItem value="csv" className="text-[17px]">העלאת רשימה (CSV / Excel)</SelectItem>
                <SelectItem value="paste" className="text-[17px]">הדבקת טקסט</SelectItem>
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
          <label className="flex items-center gap-2 text-[17px] cursor-pointer">
            <Checkbox checked={includeWhatsapp} onCheckedChange={value => setIncludeWhatsapp(value === true)} />
            שליחת ההקלטה גם בוואטסאפ הרשמי
          </label>
          {includeWhatsapp && <p className="text-xs text-muted-foreground">קובץ אודיו נשלח רק לנמענים עם חלון שיחה פתוח בוואטסאפ ב־24 השעות האחרונות.</p>}
          <Button onClick={dispatchCurrent} disabled={dispatching || audienceCount === 0 || !price || (source === 'tts' ? !ttsText.trim() || !agentVoiceId : audioSeconds == null)}
            className="w-full min-h-12 h-auto py-3 whitespace-normal rounded-xl text-[17px] font-semibold">
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
                        {h.voiceId === PRESET_VOICES[0].voice_id || /^זינה\b|^זינה(?:\s|$)|^zina(?:\s|$)/i.test(h.agentName) ? 'ריטה' : h.agentName} · {fmtTs(h.createdAt)} · {formatIvrDuration(h.durationSeconds)}
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
      <AlertDialog open={!!review} onOpenChange={(value) => { if (!value) setReview(null); }}>
        <AlertDialogContent dir="rtl"><AlertDialogHeader>
          <AlertDialogTitle>אישור הפצת IVR</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="flex items-center gap-2"><CampaignServiceIcon channel="ivr" />{audienceCount} נמענים · {price ? `${formatCampaignCredits(price.credits)} ל${price.unit}` : 'המחירון אינו זמין'}</span>
            <span className="block mt-2">משך ההקלטה: <span dir="ltr">{formatIvrDuration(review?.seconds)}</span></span>
            <span className="block mt-2">מחיר מקסימום משוער לקמפיין: {totalLabel}</span>
          </AlertDialogDescription>
        </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>ביטול</AlertDialogCancel><AlertDialogAction className="h-auto whitespace-normal" disabled={totalCredits == null} onClick={() => { if (!review) return; const current = review; setReview(null); void dispatchAudio(current.audioUrl, current.payload, true); }}>אישור ושיגור · {totalLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
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
