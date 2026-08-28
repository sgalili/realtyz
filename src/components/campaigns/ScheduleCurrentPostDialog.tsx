// Dialog: schedule the CURRENT composer content (post body + first comment +
// attached media) at a chosen day/time-window, with optional recurrence.
// Mirrors the UI/UX of the calendar's "New scheduled campaign" dialog.
//
// Unlike the calendar-side flow, this does NOT create a new draft — it directly
// dispatches the composer payload to `meta-publish` for each computed slot
// with a `scheduled_at` timestamp.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Repeat, Users, ChevronLeft, X, Loader2, MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { CampaignGroupSelector } from '@/components/campaigns/CampaignGroupSelector';
import { loadSchedulePrefs, saveSchedulePrefs, randomSlotMinutes } from '@/lib/schedulePrefs';
import { listingImagePool, randomImageSet, MAX_POST_IMAGES } from '@/lib/listingImages';
import { loadGroupLimitState, saveGroupDailyLimit, allowedGroupsForDay, type GroupLimitState } from '@/lib/groupDailyLimits';
import { celebrate } from '@/lib/celebrate';
import { cn } from '@/lib/utils';


type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

const HEBREW_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export type ScheduleTarget = {
  id: string;
  name: string;
  accountRef?: string | null;
  profileKey?: string | null;
};

export function ScheduleCurrentPostDialog({
  open,
  onClose,
  onScheduled,
  channelId,
  channelLabel,
  brandName,
  body,
  firstComment,
  mediaUrls,
  listingId,
  defaultGroupIds,
  targets,
  isSocialChannel,
}: {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
  channelId: string;
  channelLabel: string;
  brandName: string;
  body: string;
  firstComment: string;
  mediaUrls: string[];
  listingId: string | null;
  defaultGroupIds: string[];
  targets: ScheduleTarget[];
  isSocialChannel: boolean;
}) {
  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();

  const [day, setDay] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const initialPrefs = useMemo(() => loadSchedulePrefs(workspaceOwnerId, 'composer'), [workspaceOwnerId]);
  const [winStart, setWinStart] = useState(initialPrefs.winStart);
  const [winEnd, setWinEnd] = useState(initialPrefs.winEnd);
  const [winCount, setWinCount] = useState(initialPrefs.winCount);
  const [recurrence, setRecurrence] = useState<Recurrence>(initialPrefs.recurrence);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(initialPrefs.recurrenceDays);
  // Rolling series: the queue never holds more than ONE future version.
  // The first slot publishes now/at the chosen time, exactly one next version
  // is materialized, and every further version is created by the dispatcher
  // only after the previous one was published successfully. The series runs
  // forever until the property is marked sold / rented / hold / disabled.
  const ROLLING_CYCLES = 2; // current slot + the single next version
  const recurrenceCount = ROLLING_CYCLES;
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);

  const [groupsOpen, setGroupsOpen] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    initialPrefs.selectedGroupIds.length > 0 ? initialPrefs.selectedGroupIds : (defaultGroupIds || []),
  );
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  // Up to 10 random property photos are always attached to the scheduled posts.
  const [postImages, setPostImages] = useState<string[]>([]);
  // Full allowed photo pool — every scheduled slot draws its own random mix.
  const [imagePool, setImagePool] = useState<string[]>([]);
  const [groupDailyLimit, setGroupDailyLimit] = useState<number>(initialPrefs.groupDailyLimit);
  const [limitState, setLimitState] = useState<GroupLimitState>({ limits: {}, usedToday: {} });
  const [listingHeader, setListingHeader] = useState<{ title: string; address: string } | null>(null);
  const navigate = useNavigate();

  // JIT generation cap: only fully generate distinct AI variants for the next
  // few slots. Every slot beyond this cap is scheduled with the ORIGINAL body
  // as a placeholder — the user can edit each one later from the calendar.
  const JIT_GENERATION_LOOKAHEAD = 4;

  useEffect(() => {
    if (open) {
      const prefs = loadSchedulePrefs(workspaceOwnerId, 'composer');
      setWinStart(prefs.winStart);
      setWinEnd(prefs.winEnd);
      setWinCount(prefs.winCount);
      setRecurrence(prefs.recurrence);
      setRecurrenceDays(prefs.recurrenceDays);
      setGroupDailyLimit(prefs.groupDailyLimit);

      setSelectedGroupIds(
        prefs.selectedGroupIds.length > 0 ? prefs.selectedGroupIds : (defaultGroupIds || []),
      );
      setSubmitting(false);
      setProgress(0);
    }
  }, [open, defaultGroupIds, workspaceOwnerId]);

  // Persist the configuration so it is still there after a refresh.
  useEffect(() => {
    if (!open) return;
    saveSchedulePrefs(
      workspaceOwnerId,
      {
        winStart, winEnd, winCount, recurrence, recurrenceDays,
        recurrenceCount, selectedGroupIds, groupDailyLimit,
      },
      'composer',
    );
  }, [open, workspaceOwnerId, winStart, winEnd, winCount, recurrence, recurrenceDays, recurrenceCount, selectedGroupIds, groupDailyLimit]);


  // Property name + address for the dialog header.
  useEffect(() => {
    if (!open || !listingId) { setListingHeader(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('listings')
        .select('property_title, address, neighborhood, city')
        .eq('id', listingId)
        .maybeSingle();
      if (cancelled || !data) return;
      setListingHeader({
        title: String((data as any).property_title || (data as any).address || 'נכס'),
        address: [(data as any).address, (data as any).neighborhood, (data as any).city].filter(Boolean).join(', '),
      });
    })();
    return () => { cancelled = true; };
  }, [open, listingId]);

  // Live per-group daily limits + today's usage for the selected groups.
  useEffect(() => {
    if (!open || selectedGroupIds.length === 0) { setLimitState({ limits: {}, usedToday: {} }); return; }
    let cancelled = false;
    (async () => {
      const state = await loadGroupLimitState(selectedGroupIds);
      if (!cancelled) setLimitState(state);
    })();
    return () => { cancelled = true; };
  }, [open, selectedGroupIds]);

  // Resolve the media attached to every scheduled slot: the composer's own
  // media first, topped up with random property photos (max 10 in total).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const own = (Array.isArray(mediaUrls) ? mediaUrls : []).filter(Boolean);
      const pool = await listingImagePool(listingId);
      if (cancelled) return;
      setImagePool(Array.from(new Set([...own, ...pool])));
      const extra = own.length >= MAX_POST_IMAGES ? [] : randomImageSet(pool, MAX_POST_IMAGES);
      const merged = Array.from(new Set([...own, ...extra])).slice(0, MAX_POST_IMAGES);
      setPostImages(merged);
    })();
    return () => { cancelled = true; };
  }, [open, mediaUrls, listingId]);




  const dayLabel = useMemo(() => {
    try {
      return new Date(day + 'T00:00:00').toLocaleDateString('he-IL');
    } catch {
      return day;
    }
  }, [day]);

  const buildSlots = (): Date[] => {
    const base = new Date(day + 'T00:00:00');
    const [sh, sm] = winStart.split(':').map(Number);
    const [eh, em] = winEnd.split(':').map(Number);
    const startMin = (sh || 0) * 60 + (sm || 0);
    const endMin = (eh || 0) * 60 + (em || 0);
    if (endMin <= startMin) {
      toast.error('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
      return [];
    }
    const n = Math.max(1, winCount);
    const span = endMin - startMin;
    const bucket = span / n;

    const buildDaySlots = (dayBase: Date): Date[] => {
      const out: Date[] = [];
      for (let i = 0; i < n; i++) {
        // Random minute inside the window — never on the start/end boundary.
        const offset = randomSlotMinutes(startMin, endMin, i, n);
        const total = Math.floor(offset);
        const d = new Date(dayBase);
        d.setHours(Math.floor(total / 60), total % 60, Math.floor(Math.random() * 60), 0);
        if (d.getTime() <= Date.now() + 60_000) {
          d.setTime(Date.now() + (i + 1) * 5 * 60_000);
        }
        out.push(d);
      }
      return out;
    };

    const recDates: Date[] = [];
    if (recurrence === 'none') {
      recDates.push(new Date(base));
    } else if (recurrence === 'daily') {
      for (let i = 0; i < recurrenceCount; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i);
        recDates.push(d);
      }
    } else if (recurrence === 'weekly') {
      for (let i = 0; i < recurrenceCount; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i * 7);
        recDates.push(d);
      }
    } else if (recurrence === 'monthly') {
      for (let i = 0; i < recurrenceCount; i++) {
        const d = new Date(base); d.setMonth(d.getMonth() + i);
        recDates.push(d);
      }
    } else if (recurrence === 'custom') {
      if (recurrenceDays.length === 0) {
        toast.error('בחר לפחות יום אחד בשבוע');
        return [];
      }
      const weeks = Math.max(1, recurrenceCount);
      for (let w = 0; w < weeks; w++) {
        for (let dow = 0; dow < 7; dow++) {
          if (!recurrenceDays.includes(dow)) continue;
          const b = new Date(base);
          b.setDate(b.getDate() - b.getDay() + dow + w * 7);
          if (b.getTime() < new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()) continue;
          recDates.push(b);
        }
      }
    }

    // Rolling queue: keep only the current date + the single NEXT recurrence
    // date. Later versions are generated after a successful publish.
    const capped = recDates
      .sort((a, b) => a.getTime() - b.getTime())
      .slice(0, recurrence === 'none' ? 1 : 2);
    return capped.flatMap((d) => buildDaySlots(d)).sort((a, b) => a.getTime() - b.getTime());
  };

  const extractErr = async (error: any, data: any): Promise<string | null> => {
    try {
      const resp = error?.context?.response;
      if (resp && typeof resp.json === 'function') {
        const b = await resp.clone().json();
        return b?.message || b?.error || null;
      }
    } catch { /* ignore */ }
    return (
      data?.message ||
      data?.error ||
      error?.message ||
      null
    );
  };

  // Rotation templates used to vary the phrasing/opening/CTA for every repeat
  // slot in a scheduled recurrence. All variants MUST retain the full property
  // information and highlight the benefits — we just rotate tone/structure.
  const REPEAT_TEMPLATES = [
    'תבנית מאסטר קלאסית של אודי — הוק כותרת חד, ואז בלוקים 2-5 כרגיל.',
    'פתח בשאלה סקרנית ("מחפשים דירה שמרגישה כמו בית?") ואז שמור על מבנה 5 הבלוקים.',
    'פתח באמירה חדה של יתרון מרכזי אחד (נוף/מיקום/שדרוג) ואז המשך במבנה הרגיל.',
    'סגנון "סיפור קצר" — משפט פתיחה חוויתי בגוף ראשון, ואז מעבר למבנה הרגיל.',
    'סגנון "רשימת יתרונות" — תפתח בהוק, ואז הדגש 3 יתרונות בולטים לפני המחיר וה-CTA.',
    'סגנון "הזדמנות/דחיפות עדינה" בלי קלישאות — הוק שמדגיש שהנכס חדש בשוק/נדיר, ואז מבנה מלא.',
  ];

  const buildRotateInstruction = (index: number, total: number) => {
    if (total <= 1) return null;
    const style = REPEAT_TEMPLATES[index % REPEAT_TEMPLATES.length];
    return [
      `זהו פרסום מספר ${index + 1} מתוך ${total} באותה סדרה על אותו הנכס.`,
      `סגנון לפרסום הזה: ${style}`,
      'חובה: לכלול את כל פרטי הנכס (סוג עסקה, סוג נכס, חדרים, רחוב, שכונה, עיר, מחיר) ולהדגיש את היתרונות הבולטים.',
      'חובה: לגוון את משפט הפתיחה, ניסוח היתרונות ומשפט ה-CTA לעומת הגרסה הקודמת — לא לחזור על אותן מילים.',
      'אסור: להמציא נתונים שלא קיימים בנכס, ואסור לכלול מספרי בית/דירה בכתובת.',
      'שמור על מבנה מאסטר: הוק כותרת → 1-2 משפטים על הנכס → שכונה/נגישות → יתרון אורח חיים → מחיר + CTA.',
      'החתימה הקנונית תתווסף אוטומטית בשרת — אל תכתוב אותה בעצמך.',
    ].join('\n');
  };

  const generateVariantBody = async (index: number, total: number): Promise<string> => {
    if (!listingId) return body;
    try {
      const rotateNote = buildRotateInstruction(index, total);
      if (!rotateNote) return body;
      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: {
          topic: 'פוסט קידום נכס (וריאציה בסדרה מתוזמנת)',
          platform: channelId,
          customInstructions: rotateNote,
          selectedListingId: listingId,
          listingFocusOnly: true,
        },
      });
      if (error) return body;
      const next = (data as any)?.content || (data as any)?.text || (data as any)?.body;
      const clean = typeof next === 'string' ? next.trim() : '';
      return clean || body;
    } catch {
      return body;
    }
  };

  const handleSubmit = async () => {
    // Entry-level diagnostic — surfaces the exact state at the moment the
    // button is clicked so silent early-returns become traceable.
    console.log('[ScheduleCurrentPostDialog] Submit clicked', {
      day,
      winStart,
      winEnd,
      winCount,
      recurrence,
      recurrenceDays,
      recurrenceCount,
      channelId,
      listingId,
      hasUser: !!user,
      bodyLen: body?.length ?? 0,
      firstCommentLen: firstComment?.length ?? 0,
      mediaUrlsCount: mediaUrls?.length ?? 0,
      selectedGroupIds,
      targetsCount: targets?.length ?? 0,
    });

    if (!user) {
      console.warn('[ScheduleCurrentPostDialog] blocked: no user');
      toast.error('יש להתחבר כדי לתזמן פרסום');
      return;
    }
    if (!body || !body.trim()) {
      console.warn('[ScheduleCurrentPostDialog] blocked: empty body');
      toast.error('אין תוכן לתזמון — כתוב טקסט לפוסט לפני התזמון');
      return;
    }
    if (!channelId) {
      console.warn('[ScheduleCurrentPostDialog] blocked: missing channel');
      toast.error('לא נבחר ערוץ לפרסום');
      return;
    }
    if (!winStart || !winEnd) {
      console.warn('[ScheduleCurrentPostDialog] blocked: missing time window');
      toast.error('בחר שעת התחלה ושעת סיום לחלון הפרסום');
      return;
    }
    if (!day) {
      console.warn('[ScheduleCurrentPostDialog] blocked: missing day');
      toast.error('בחר תאריך לפרסום');
      return;
    }
    if (recurrence === 'custom' && recurrenceDays.length === 0) {
      console.warn('[ScheduleCurrentPostDialog] blocked: custom recurrence with no days');
      toast.error('בחר לפחות יום אחד בשבוע לחזרתיות מותאמת');
      return;
    }

    const slots = buildSlots();
    console.log('[ScheduleCurrentPostDialog] built slots', {
      count: slots.length,
      first: slots[0]?.toISOString(),
      last: slots[slots.length - 1]?.toISOString(),
    });
    if (slots.length === 0) {
      // buildSlots already toasts specific reasons; add a generic fallback so
      // the user never sees a silent no-op.
      toast.error('לא נוצרו מועדים לפרסום — בדוק את חלון השעות והחזרתיות');
      return;
    }

    setSubmitting(true);
    const ownerScope = workspaceOwnerId ?? user.id;
    const campaignName = `${brandName} · ${channelLabel}`;
    const fanoutTargets =
      isSocialChannel && channelId === 'facebook' && targets.length > 0
        ? targets
        : [null as ScheduleTarget | null];

    // Every series gets one shared series_id so the calendar (and future
    // "cancel series" actions) can group all slots without a name heuristic.
    const seriesId = (crypto as any)?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const progressToastId = toast.loading(`מתזמן ${slots.length} פרסומים…`);
    let ok = 0;
    let failed = 0;
    let firstErr: string | null = null;
    setProgress(0);

    // ---- Per-group daily limits -------------------------------------------
    // Persist the cap the broker typed, then plan the groups slot-by-slot so no
    // group receives more posts on a single day than its daily limit allows.
    const baseGroupIds = channelId === 'facebook' ? (selectedGroupIds || []) : [];
    if (channelId === 'facebook' && baseGroupIds.length > 0) {
      await saveGroupDailyLimit(baseGroupIds, groupDailyLimit > 0 ? groupDailyLimit : null);
    }
    const liveLimits: GroupLimitState = channelId === 'facebook' && baseGroupIds.length > 0
      ? {
          limits: baseGroupIds.reduce<Record<string, number>>((acc, id) => {
            const cap = groupDailyLimit > 0 ? groupDailyLimit : limitState.limits[id];
            if (cap) acc[id] = cap;
            return acc;
          }, {}),
          usedToday: limitState.usedToday,
        }
      : { limits: {}, usedToday: {} };

    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const todayKey = dayKey(new Date());
    const plannedPerDay = new Map<string, Record<string, number>>();
    const blockedGroups = new Set<string>();
    const groupsForSlot = (slot: Date): string[] => {
      if (baseGroupIds.length === 0) return [];
      const key = dayKey(slot);
      const planned = plannedPerDay.get(key) ?? {};
      const { allowed, blocked } = allowedGroupsForDay(baseGroupIds, liveLimits, planned, key === todayKey);
      for (const b of blocked) blockedGroups.add(b);
      for (const id of allowed) planned[id] = (planned[id] ?? 0) + 1;
      plannedPerDay.set(key, planned);
      return allowed;
    };

    // Every slot gets its own random mix: distinct main picture + 9 more.
    const imagesForSlot = (): string[] =>
      imagePool.length > 0 ? randomImageSet(imagePool, MAX_POST_IMAGES) : postImages;


    try {
      // ---- SLOT 0 -----------------------------------------------------------
      // Publish the first chronological slot for real via meta-publish so it
      // rides Meta's own scheduler. This is the only heavy call in the
      // whole series — everything after it is a lightweight DB insert.
      const firstSlot = slots[0];
      const totalOps = slots.length * fanoutTargets.length;
      let done = 0;

      const firstSlotGroups = groupsForSlot(firstSlot);
      const firstSlotImages = imagesForSlot();

      for (const target of fanoutTargets) {
        const nameForTarget = target ? `${campaignName} · ${target.name}` : campaignName;
        try {
          window.dispatchEvent(new CustomEvent('rz:campaign-optimistic', {
            detail: {
              channel: channelId,
              body,
              media_urls: firstSlotImages,
              campaign_name: nameForTarget,
              scheduled_at: firstSlot.toISOString(),
              needs_regeneration: false,
            },
          }));
        } catch { /* noop */ }

        const invokeBody: Record<string, unknown> = {
          post: body,
          channels: [channelId],
          campaign_name: nameForTarget,
          media_urls: firstSlotImages,
          scheduled_at: firstSlot.toISOString(),
          workspace_owner_id: ownerScope,
          group_ids: firstSlotGroups,
          target_profile_id: target?.id ?? null,
          target_account_ref: target?.accountRef ?? null,
          target_profile_key: target?.profileKey ?? null,
          first_comment: firstComment || null,
          listing_id: listingId ?? null,
          series_id: seriesId,
          series_index: 0,
          series_total: slots.length,
        };

        try {
          const { data, error } = await supabase.functions.invoke('meta-publish', {
            body: invokeBody,
          });
          const payload: any = data;
          if (error || payload?.error || payload?.success === false) {
            failed++;
            const msg = await extractErr(error, payload);
            console.error('[ScheduleCurrentPostDialog] first-slot failed', { error, payload, msg });
            if (!firstErr) firstErr = msg;
          } else {
            ok++;
          }
        } catch (slotErr: any) {
          failed++;
          console.error('[ScheduleCurrentPostDialog] first-slot exception:', slotErr);
          if (!firstErr) firstErr = slotErr?.message || 'שגיאה לא צפויה בתזמון';
        }
        done++;
        setProgress(Math.round((done / totalOps) * 100));
      }

      // ---- SLOTS 1..N-1 : lightweight placeholders --------------------------
      // Bulk insert every future slot as a campaign_logs row with
      // needs_regeneration=true so the dispatcher generates the real AI body
      // and publishes it just before its send time. No AI call happens here.
      const placeholderRows: any[] = [];
      for (let i = 1; i < slots.length; i++) {
        const slot = slots[i];
        const slotGroups = groupsForSlot(slot);
        const slotImages = imagesForSlot();
        for (const target of fanoutTargets) {
          const nameForTarget = target ? `${campaignName} · ${target.name}` : campaignName;
          const rotateNote = buildRotateInstruction(i, slots.length);
          placeholderRows.push({
            user_id: ownerScope,
            workspace_owner_id: ownerScope,
            campaign_name: nameForTarget,
            channel: channelId,
            message_body: body, // fallback body if regeneration ever fails
            status: 'scheduled',
            sent_at: slot.toISOString(),
            source_account: 'meta-placeholder',
            needs_regeneration: true,
            regen_prompt: rotateNote,
            listing_id: listingId ?? null,
            first_comment: firstComment || null,
            media_urls: slotImages,
            group_ids: slotGroups,
            target_profile_key: target?.profileKey ?? null,
            target_account_ref: target?.accountRef ?? null,
            series_id: seriesId,
            series_index: i,
            series_total: slots.length,
            // Endless rolling repeat: the dispatcher uses this rule to create
            // the NEXT single version only after this one was published.
            recurrence_rule: recurrence === 'none' ? null : {
              pattern: recurrence,
              days: recurrenceDays,
              win_start: winStart,
              win_end: winEnd,
              per_day: Math.max(1, winCount),
              endless: true,
            },

          });

          try {
            window.dispatchEvent(new CustomEvent('rz:campaign-optimistic', {
              detail: {
                channel: channelId,
                body,
                media_urls: slotImages,
                campaign_name: nameForTarget,
                scheduled_at: slot.toISOString(),
                needs_regeneration: true,
              },
            }));
          } catch { /* noop */ }
        }
      }


      if (placeholderRows.length > 0) {
        // Chunk to keep single requests small.
        const CHUNK = 250;
        for (let i = 0; i < placeholderRows.length; i += CHUNK) {
          const slice = placeholderRows.slice(i, i + CHUNK);
          const { error: insErr } = await (supabase as any)
            .from('campaign_logs')
            .insert(slice);
          if (insErr) {
            console.error('[ScheduleCurrentPostDialog] placeholder insert failed', insErr);
            failed += slice.length;
            if (!firstErr) firstErr = insErr.message;
          } else {
            ok += slice.length;
          }
          done += slice.length;
          setProgress(Math.round((done / totalOps) * 100));
        }
      }

      toast.dismiss(progressToastId);

      if (ok > 0) {
        try {
          window.dispatchEvent(new CustomEvent('rz:campaign-scheduled', {
            detail: { count: ok, channel: channelId },
          }));
        } catch { /* noop */ }
        toast.success(
          `תוזמנו ${ok} פרסומים${failed ? ` (${failed} נכשלו)` : ''}`,
          {
            description: blockedGroups.size > 0
              ? `${blockedGroups.size} קבוצות הגיעו למקסימום הפרסומים היומי ולכן דולגו בחלק מהמועדים.`
              : 'הפוסט הראשון נוצר עכשיו. כל השאר יווצרו אוטומטית רגע לפני מועד הפרסום.',
            duration: 8000,
          },
        );
        celebrate();
        onScheduled();
        onClose();
        navigate('/campaigns?tab=calendar');
        try { window.dispatchEvent(new CustomEvent('rz:open-schedule-calendar')); } catch { /* noop */ }

      } else {

        toast.error(firstErr ? `תזמון נכשל: ${firstErr}` : 'תזמון נכשל');
      }
    } catch (e: any) {
      toast.dismiss(progressToastId);
      console.error('[ScheduleCurrentPostDialog] Detailed scheduling error:', e);
      toast.error(e?.message || 'תזמון נכשל');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          {listingHeader && (
            <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-right mb-1">
              <div className="text-base font-bold text-foreground">{listingHeader.title}</div>
              {listingHeader.address && (
                <div className="mt-0.5 inline-flex flex-row-reverse items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  {listingHeader.address}
                </div>
              )}
            </div>
          )}
          <DialogTitle className="flex items-center gap-2 justify-end">
            תזמון פרסומים ליום {dayLabel}
          </DialogTitle>
          <DialogDescription className="text-right">
            {"\n"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">תאריך</label>
            <Input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              dir="rtl"
              className="text-right"
            />
          </div>
          <div className="flex items-end gap-2 flex-row-reverse">
            <Popover open={recurrenceOpen} onOpenChange={setRecurrenceOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="חזרתיות"
                  aria-label="חזרתיות"
                  className={cn(
                    'relative inline-flex items-center justify-center h-9 w-9 rounded-md text-foreground hover:text-primary transition-colors',
                    recurrence !== 'none' && 'text-primary',
                  )}
                >
                  <Repeat className="h-5 w-5" />
                  {recurrence !== 'none' && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="w-64 p-2" dir="rtl">
                <div className="text-xs font-semibold text-muted-foreground px-2 py-1">חזרתיות</div>
                <div className="flex flex-col">
                  {([
                    ['none', 'ללא חזרה'],
                    ['daily', 'בכל יום'],
                    ['weekly', 'בכל שבוע'],
                    ['monthly', 'בכל חודש'],
                    ['custom', 'ימים ושעות נבחרים'],
                  ] as Array<[Recurrence, string]>).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRecurrence(key)}
                      className={cn(
                        'text-right text-sm rounded-md px-2 py-1.5 hover:bg-muted/60',
                        recurrence === key && 'bg-primary/10 text-primary font-semibold',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {recurrence === 'custom' && (
                  <div className="mt-2 border-t pt-2">
                    <div className="text-[11px] text-muted-foreground mb-1 text-right">בחר ימי שבוע</div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {HEBREW_WEEKDAYS.map((d, i) => {
                        const active = recurrenceDays.includes(i);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() =>
                              setRecurrenceDays((prev) =>
                                prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                              )
                            }
                            className={cn(
                              'h-7 w-7 text-[11px] rounded-full border',
                              active
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-foreground border-border hover:bg-muted/60',
                            )}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {recurrence !== 'none' && (
                  <div className="mt-2 border-t pt-2">
                    <p className="text-[10px] text-muted-foreground text-right leading-relaxed">
                      הסדרה תמשיך לרוץ ללא הגבלה. בכל רגע נשמרת בתור רק הגרסה הבאה אחת,
                      והגרסה שאחריה נוצרת רק אחרי פרסום מוצלח. הסדרה נעצרת אוטומטית כשהנכס
                      מסומן כנמכר / הושכר / בהמתנה / מושבת.
                    </p>
                  </div>
                )}

              </PopoverContent>
            </Popover>
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">עד שעה</label>
              <Input
                type="time"
                value={winEnd}
                onChange={(e) => setWinEnd(e.target.value)}
                dir="rtl"
                className="text-left"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">משעה</label>
              <Input
                type="time"
                value={winStart}
                onChange={(e) => setWinStart(e.target.value)}
                dir="rtl"
                className="text-left"
              />
            </div>
          </div>
          <div className="flex items-end gap-2 flex-row-reverse">
            <div className="w-28">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">כמות פוסטים</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={winCount}
                onChange={(e) => setWinCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="text-right"
              />
            </div>
            <div className="w-32">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block text-right">מקס' לקבוצה/יום</label>
              <Input
                type="number"
                min={0}
                max={50}
                placeholder="ללא הגבלה"
                value={groupDailyLimit || ''}
                onChange={(e) => setGroupDailyLimit(Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                className="text-right"
              />
            </div>
            <div className="flex-1 h-9 flex items-center justify-end rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
              {"\n"}
            </div>

          </div>

          {/* Preview before posting: text, attached photos, first comment */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground text-right">{"\n"}</div>
            <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-input bg-background p-2 text-[13px] text-right leading-relaxed">
              {body?.trim() || 'אין תוכן לפוסט'}
            </div>
            {firstComment?.trim() && (
              <div className="rounded-md border border-dashed border-input bg-background/60 p-2 text-right">
                <div className="text-[11px] font-semibold text-muted-foreground mb-1">תגובה ראשונה</div>
                <div className="whitespace-pre-wrap text-[12px] leading-relaxed">{firstComment.trim()}</div>
              </div>
            )}
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground mb-1 text-right">
                תמונות מצורפות ({postImages.length})
              </div>
              {postImages.length === 0 ? (
                <div className="text-[11px] text-muted-foreground text-right">אין תמונות זמינות לנכס הזה</div>
              ) : (
                <div className="grid grid-cols-5 gap-1">
                  {postImages.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt="תמונת נכס לפוסט"
                      loading="lazy"
                      className="h-14 w-full rounded-md object-cover ring-1 ring-border"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2 w-full items-center">
          <Button variant="outline" onClick={onClose} disabled={submitting}>ביטול</Button>
          {channelId === 'facebook' && (
            <Popover open={groupsOpen} onOpenChange={setGroupsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="בחר קבוצות פייסבוק לפרסום"
                  aria-label="קבוצות פייסבוק"
                  className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-foreground hover:text-primary transition-colors"
                >
                  <Users className="h-5 w-5" />
                  {selectedGroupIds.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {selectedGroupIds.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" side="top" className="w-[360px] p-0" dir="rtl">
                <CampaignGroupSelector
                  selectedIds={selectedGroupIds}
                  onChange={setSelectedGroupIds}
                  className="border-0 shadow-none"
                />
              </PopoverContent>
            </Popover>
          )}
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
            {submitting ? `מתזמן... ${progress}%` : 'פרסום'}
          </Button>


        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleCurrentPostDialog;
