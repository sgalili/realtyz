import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ClipboardList, Globe, Loader2, Pause, Pencil, Phone, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { isReadyForBoard } from '@/lib/readyForBoard';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useUserRole } from '@/hooks/useUserRole';
import { publishInventory, publicationErrorMessage } from '@/lib/publishInventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { commissionOfferFromPrice } from '@/lib/commissionDisplay';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClosingFeeSlider } from '@/components/affiliate/ClosingFeeSlider';
import { LeadPriceSlider } from '@/components/public/LeadPriceSlider';
import { WhatsAppIcon } from './WhatsAppIcon';
import { PublicationLeadHelp } from './PublicationLeadHelp';
import { brokerOnlyPricing, isTerminalListing, parseDailyLimit, validPublicationFees } from '@/lib/publicationSettings';
import { pauseInventory } from '@/lib/publishInventory';
import { LeadQuestionConfigurator } from '@/components/affiliate/LeadQuestionConfigurator';
import { cleanFormFields, resolveLeadQuestions, type LeadFormField } from '@/lib/leadTiers';
import { PauseDistributionDialog } from './PauseDistributionDialog';

/** Shared square publication control; status remains accessible and tooltip-only. */
export function PublishStatusGlobe({ live, busy = false, actionable = false, onClick }: { live: boolean; busy?: boolean; actionable?: boolean; onClick?: (event: ReactMouseEvent) => void }) {
  const label = live ? 'מפורסם בלוח הציבורי' : actionable ? 'לא מפורסם בלוח הציבורי — לחיצה תפתח את חלון הפרסום' : 'לא מפורסם בלוח הציבורי';
  const icon = (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Globe className="h-4 w-4" aria-hidden="true" />}
      {!live && !busy && <span aria-hidden="true" className="publication-globe-slash pointer-events-none absolute h-[2px] w-[23px] -rotate-45 rounded-full bg-current" />}
    </span>
  );
  const body = onClick
    ? <Button type="button" variant="ghost" size="icon" className={cn('publication-globe h-8 w-8 shrink-0 rounded-sm', live ? 'publication-globe-live' : 'publication-globe-draft')} aria-label={label} onClick={onClick}>{icon}</Button>
    : <span role="img" aria-label={label} className={cn('publication-globe inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm', live ? 'publication-globe-live' : 'publication-globe-draft')}>{icon}</span>;
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

type PromotionRow = { id: string; property_title: string | null; address: string | null; house_number: string | null; city: string | null; asking_price: number | null; status: string | null; is_published: boolean | null; affiliate_enabled: boolean | null; deal_type?: string | null; affiliate_tier1_amount?: number | null; affiliate_tier2_amount?: number | null; affiliate_tier3_amount?: number | null; affiliate_tier4_amount?: number | null; affiliate_tier4_type?: string | null; canonical_duplicate_of?: string | null; contact_options?: Record<string, unknown>; features?: Record<string, unknown> };
type FeeDraft = { t1: string; t2: string; t3: string; t4: string; unit: 'fixed' | 'percent'; form: string; whatsapp: string; phone: string; questions: string[]; questionsPhone: string[]; formFields: LeadFormField[] };
const FEE_FIELDS = [
  { key: 't4', label: 'אומדן סגירה', Icon: Trophy, tone: 'text-primary', tier: null },
  { key: 't1', label: 'ליד טופס', Icon: ClipboardList, tone: 'text-lead-form', tier: 'form' },
  { key: 't2', label: 'ליד וואטסאפ', Icon: WhatsAppIcon, tone: 'text-lead-whatsapp', tier: 'whatsapp' },
  { key: 't3', label: 'ליד שיחה', Icon: Phone, tone: 'text-lead-phone', tier: 'phone' },
] as const;
const feeDraft = (r: PromotionRow): FeeDraft => {
  const limits = r.contact_options?.lead_daily_limits as Record<string, number | null> | undefined;
  return { t1: String(r.affiliate_tier1_amount ?? 0), t2: String(r.affiliate_tier2_amount ?? 0), t3: String(r.affiliate_tier3_amount ?? 0), t4: String(r.affiliate_tier4_amount ?? 0), unit: r.affiliate_tier4_type === 'percent' ? 'percent' : 'fixed', form: String(limits?.form ?? ''), whatsapp: String(limits?.whatsapp ?? ''), phone: String(limits?.phone ?? ''), questions: resolveLeadQuestions(r.contact_options?.questions, r.deal_type), questionsPhone: resolveLeadQuestions(r.contact_options?.questions_phone ?? r.contact_options?.questions, r.deal_type), formFields: (r.contact_options?.form_fields as LeadFormField[] | undefined) ?? [] };
};
/** Commission text: shekels first with the percentage in parentheses; a bare percentage stays only when no price is known. */
const feeText = (row: PromotionRow, k: string, raw: string): string => {
  const value = Number(raw) || 0;
  if (k === 't4' && row.affiliate_tier4_type === 'percent') return commissionOfferFromPrice(Number(row.asking_price) || 0, value);
  return `₪${value.toLocaleString('he-IL')}`;
};
export function QuickPublicPromotion({ ids, onPublished, compact = false, statusLive, fallback }: { ids: string[]; onPublished: (ids: string[], live?: boolean) => void; compact?: boolean; statusLive?: boolean; fallback?: ReactNode }) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { roles, loading: rolesLoading } = useUserRole();
  const scopeRef = useRef(activeWorkspaceId);
  scopeRef.current = activeWorkspaceId;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, FeeDraft>>({});
  const [expanded, setExpanded] = useState(false);
  const [editingLimit, setEditingLimit] = useState<string | null>(null);
  // Membership roles may remain "user" after the owner's broker approval.
  // Use server-backed owner/account roles; RLS remains the write boundary.
  const allowed = !rolesLoading && roles.some(role => ['managing_broker', 'lead_agent', 'agent', 'admin', 'super_admin', 'affiliate'].includes(role));
  useEffect(() => { setOpen(false); setPauseOpen(false); setRows([]); setAccepted(false); setBusy(false); }, [activeWorkspaceId]);
  if (!allowed || !activeWorkspaceId || !ids.length) return <>{fallback ?? null}</>;
  const eligible = rows.filter(row => !row.canonical_duplicate_of && !isTerminalListing(row.status) && (isReadyForBoard(row) || (row.status === 'live' && (row.is_published || row.affiliate_enabled))));
  const published = eligible.filter(row => row.is_published || row.affiliate_enabled);
  const zeroRows = eligible.filter(row => { const d = drafts[row.id] ?? feeDraft(row); return brokerOnlyPricing([d.t1, d.t2, d.t3]); });
  const updateDraft = (id: string, patch: Partial<FeeDraft>) => setDrafts(previous => ({ ...previous, [id]: { ...previous[id], ...patch } as FeeDraft }));
  const prepare = async () => {
    const workspaceId = activeWorkspaceId;
    setBusy(true); setAccepted(false); setExpanded(true); setPauseOpen(false); setEditingLimit(null);
    try {
      const { data, error } = await supabase.from('listings').select('id,property_title,address,house_number,city,asking_price,status,is_published,affiliate_enabled,deal_type,affiliate_tier1_amount,affiliate_tier2_amount,affiliate_tier3_amount,affiliate_tier4_amount,affiliate_tier4_type,contact_options,features,canonical_duplicate_of').eq('workspace_owner_id', activeWorkspaceId).in('id', [...new Set(ids)]);
      if (error) throw error;
      if (scopeRef.current !== workspaceId) return;
      if (!data?.length) throw new Error('הנכס לא נמצא במשרד הפעיל או שאין הרשאה לצפות בו.');
      setRows(data as PromotionRow[]); setDrafts(Object.fromEntries((data as PromotionRow[]).map(r => [r.id, feeDraft(r)]))); setOpen(true);
    } catch (error) {
      console.error('[QuickPublicPromotion] prepare failed', { workspaceId, listingIds: ids, error });
      if (scopeRef.current === workspaceId) toast.error(publicationErrorMessage(error));
    }
    finally { if (scopeRef.current === workspaceId) setBusy(false); }
  };
  const publish = async () => {
    if (!accepted || !eligible.length || busy) return;
    const workspaceId = activeWorkspaceId;
    setBusy(true);
    try {
      for (const row of eligible) {
        const d = drafts[row.id]; if (!d) throw new Error('יש לטעון ולאשר את התמחור לפני הפרסום.');
        const nums = [d.t1, d.t2, d.t3, d.t4].map(Number);
        if (!validPublicationFees(row.deal_type, Number(row.asking_price), nums.slice(0, 3), nums[3], d.unit)) throw new Error('יש לבחור עמלות בטווחים המותרים ולהגדיר עמלת סגירה.');
        const lead_daily_limits = { form: parseDailyLimit(d.form, 50), whatsapp: parseDailyLimit(d.whatsapp, 50), phone: parseDailyLimit(d.phone, 50) };
        const questions = d.questions.map(question => question.trim()).filter(Boolean);
        const questions_phone = d.questionsPhone.map(question => question.trim()).filter(Boolean);
        const { data: upd, error: updError } = await supabase.from('listings').update({ affiliate_tier1_amount: nums[0], affiliate_tier2_amount: nums[1], affiliate_tier3_amount: nums[2], affiliate_tier4_amount: nums[3], affiliate_tier4_type: d.unit, contact_options: { ...row.contact_options, lead_daily_limits, questions, questions_phone, form_fields: cleanFormFields(d.formFields) }, features: { ...row.features, screening_questions: { whatsapp: questions, phone: questions_phone }, deal_closing_commission: { value: nums[3], type: d.unit }, commission_terms_accepted_at: new Date().toISOString() } } as never).eq('workspace_owner_id', workspaceId).eq('id', row.id).select('id').maybeSingle();
        if (updError || !upd) throw updError ?? new Error('לא ניתן לשמור את העמלות לנכס.');
        if (scopeRef.current !== workspaceId) return;
      }
      void qc.invalidateQueries({ queryKey: ['affiliate-configs'] });
      const saved = await publishInventory(supabase, workspaceId, eligible.map(row => row.id));
      if (scopeRef.current !== workspaceId) return;
      onPublished(saved);
      void qc.invalidateQueries({ queryKey: ['my-ads-stats'] });
      void qc.invalidateQueries({ queryKey: ['owner-listings'] });
      void qc.invalidateQueries({ queryKey: ['ready-board-properties'] });
      void qc.invalidateQueries({ queryKey: ['properties-total-count'] });
      void qc.invalidateQueries({ queryKey: ['affiliate-marketplace'] });
      toast.success(zeroRows.length === saved.length ? `${saved.length} נכסים פורסמו למתווכים שותפים מורשים בלבד` : `${saved.length} נכסים פורסמו בהתאם לקהל שהוגדר`);
      if (saved.length !== eligible.length) toast.warning('חלק מהנכסים לא פורסמו. יש לבדוק הרשאות.');
      setOpen(false);
    } catch (error) {
      console.error('[QuickPublicPromotion] publish failed', { workspaceId, listingIds: eligible.map(row => row.id), error });
      if (scopeRef.current === workspaceId) toast.error(publicationErrorMessage(error));
    }
    finally { if (scopeRef.current === workspaceId) setBusy(false); }
  };
  const pause = async () => {
    if (busy || !pauseOpen || !published.length) return;
    const workspaceId = activeWorkspaceId;
    setBusy(true);
    try {
      const saved = await pauseInventory(supabase, workspaceId, published.map(row => row.id));
      if (scopeRef.current !== workspaceId) return;
      onPublished(saved, false);
      void Promise.all(['properties-search', 'affiliate-configs', 'owner-listings', 'ready-board-properties', 'my-ads-stats', 'affiliate-marketplace', 'public-listings'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      toast.success('הפרסום הושהה. הנכס נשאר בנכסים שלי'); setPauseOpen(false); setOpen(false);
    } catch (error) { if (scopeRef.current === workspaceId) toast.error(publicationErrorMessage(error)); }
    finally { if (scopeRef.current === workspaceId) setBusy(false); }
  };
  const limitControl = (row: PromotionRow, tier: 'form' | 'whatsapp' | 'phone', label: string) => {
    const value = (drafts[row.id] ?? feeDraft(row))[tier];
    const controlId = `${row.id}-${tier}`;
    return editingLimit === controlId ? (
      <Input autoFocus className="h-8 w-24 text-center placeholder:text-[12px]" aria-label={`מגבלה יומית: ${label}`} type="number" inputMode="numeric" min={1} max={50} placeholder="ללא הגבלה" value={value}
        onChange={event => updateDraft(row.id, { [tier]: event.target.value })}
        onBlur={() => setEditingLimit(null)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setEditingLimit(null); } }} />
    ) : (
      <Button type="button" variant="link" className="publication-limit-link h-auto p-0 text-xs underline" disabled={busy} aria-label={`מגבלה יומית: ${label}`} title="מקסימום פניות ב־24 שעות" onClick={() => setEditingLimit(controlId)}>{value ? `${value} / 24 שעות` : 'ללא הגבלה'}</Button>
    );
  };
  return <>
    {compact && statusLive !== undefined ? (
      <PublishStatusGlobe live={statusLive} busy={busy} actionable={!statusLive} onClick={(event) => { event.stopPropagation(); void prepare(); }} />
    ) : (
      <Button variant="outline" size={compact ? 'icon' : 'sm'} className={compact ? 'h-8 w-8 text-primary' : 'gap-1.5'} disabled={busy} title="פרסום בלוח הציבורי" aria-label="פרסום בלוח הציבורי" onClick={(event) => { event.stopPropagation(); void prepare(); }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}{!compact && 'פרסום בלוח הציבורי'}
      </Button>
    )}
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onClick={event => event.stopPropagation()}>
        <PublicationLeadHelp />
        <DialogHeader className="px-6"><DialogTitle className="text-right">תמחור ותגמולים לפני פרסום</DialogTitle><DialogDescription className="text-right">{eligible.length} נכסים במשרד {activeWorkspace?.workspace_name}</DialogDescription></DialogHeader>
        {zeroRows.length > 0 && <div role="alert" className="rounded-md border border-warning/50 bg-warning/10 p-3 text-right text-sm leading-relaxed"><strong>כל מחירי הפניות הם ₪0{eligible.length > 1 ? ` ב־${zeroRows.length} נכסים` : ''}.</strong> הנכסים האלה יופצו רק בקרב מתווכים שותפים מורשים ולא בלוח הציבורי לכל השותפים. התמחור אינו חובה, אך מומלץ מאוד לתמחר לפחות סוג פנייה אחד. ניתן להגביל את מספר הפניות וההוצאה ב־24 שעות.</div>}
        <div className="max-h-64 overflow-y-auto divide-y divide-border">
          {rows.map(row => <div key={row.id} className="flex items-center gap-2 py-2 text-sm"><BadgeCheck className={`h-4 w-4 shrink-0 ${eligible.some(item => item.id === row.id) ? 'text-success' : 'text-muted-foreground'}`} /><span className="min-w-0 flex-1 break-words">{row.property_title || row.address}</span><span className="max-w-[45%] text-xs text-muted-foreground">{isTerminalListing(row.status) || row.canonical_duplicate_of ? 'הוסר או אינו פעיל' : row.is_published || row.affiliate_enabled ? brokerOnlyPricing([row.affiliate_tier1_amount, row.affiliate_tier2_amount, row.affiliate_tier3_amount]) ? 'מפורסם למתווכים מורשים בלבד; לא בלוח הציבורי' : 'מפורסם בלוח הציבורי' : 'טרם פורסם'}</span></div>)}
        </div>
        {eligible.length > 0 && <div className="space-y-2 text-sm">
          <div className="flex justify-end"><Button type="button" variant="ghost" size="icon" aria-label="עריכת עמלות ותמחור לידים" title="עריכת עמלות ותמחור לידים" aria-expanded={expanded} disabled={busy} onClick={() => setExpanded(value => !value)}><Pencil className="h-4 w-4" /></Button></div>
          {eligible.map(row => { const d = drafts[row.id] ?? feeDraft(row); return (
            <div key={row.id} className="space-y-1">
              {eligible.length > 1 && <div className="text-xs text-muted-foreground">{row.property_title || row.address}</div>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{FEE_FIELDS.map(({ key, label, Icon, tone, tier }) => <div key={key} className="flex min-w-0 flex-col items-start gap-1 text-xs"><Tooltip><TooltipTrigger asChild><span className="flex items-center gap-1.5" aria-label={label}><Icon className={cn('h-5 w-5 shrink-0', tone)} /><b>{feeText({ ...row, affiliate_tier4_type: d.unit }, key, d[key])}</b></span></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>{tier && limitControl(row, tier, label)}</div>)}</div>
            </div>); })}
          {expanded && <div>
            <div className="space-y-3 py-2">
              {eligible.map(row => { const d = drafts[row.id] ?? feeDraft(row); return (
                <div key={row.id} className="space-y-1">
                  {eligible.length > 1 && <div className="text-xs font-medium">{row.property_title || row.address}</div>}
                  <fieldset disabled={busy} className="space-y-3">
                    <ClosingFeeSlider publisherCard dealType={row.deal_type} price={Number(row.asking_price)} value={Number(d.t4)} valueType={d.unit} dualMode onChange={value => updateDraft(row.id, { t4: String(value) })} onValueChange={(value, unit) => updateDraft(row.id, { t4: String(value), unit })} />
                    {([{ key: 't1', tier: 'form', label: 'פנייה דרך טופס', Icon: ClipboardList, tone: 'text-lead-form' }, { key: 't2', tier: 'whatsapp', label: 'פנייה מסוננת בוואטסאפ עם ריטה AI', Icon: WhatsAppIcon, tone: 'text-lead-whatsapp' }, { key: 't3', tier: 'phone', label: 'פנייה מסוננת טלפונית עם ריטה AI', Icon: Phone, tone: 'text-lead-phone' }] as const).map(({ key, tier, label, Icon, tone }) => <section key={key} className="space-y-2 rounded-md border border-border bg-background p-3">
                      <Tooltip><TooltipTrigger asChild><h3 aria-label={label} className="flex items-center gap-2 font-semibold"><Icon className={cn('h-7 w-7 shrink-0', Number(d[key]) > 0 ? tone : 'text-muted-foreground')} /></h3></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
                      <LeadPriceSlider tier={tier} label={label} value={d[key]} dynamicFeedback onChange={value => updateDraft(row.id, { [key]: value })} />
                      {limitControl(row, tier, label)}
                      <LeadQuestionConfigurator tier={tier} dealType={row.deal_type} fields={d.formFields} questions={tier === 'phone' ? d.questionsPhone : d.questions} onFieldsChange={next => updateDraft(row.id, { formFields: next })} onQuestionsChange={next => updateDraft(row.id, tier === 'phone' ? { questionsPhone: next } : { questions: next })} disabled={busy} />
                    </section>)}
                  </fieldset>
                </div>); })}
            </div>
          </div>}
        </div>}
        {eligible.length > 0 && <label className="flex items-start gap-2 text-sm"><Checkbox aria-label="אישור התקנון והעמלות" checked={accepted} onCheckedChange={value => setAccepted(value === true)} /><span>אני מורשה לפרסם את הנכסים. קראתי ואישרתי את פרטי <a className="text-primary" href="/terms" target="_blank" rel="noopener noreferrer">התקנון</a>, מנגנון העמלות ואת תנאי התיווך.</span></label>}
        {published.length > 0 && <Button variant="outline" className="justify-self-start gap-2 text-destructive" disabled={busy} onClick={() => setPauseOpen(true)}><Pause className="h-4 w-4" />השעיית פרסום</Button>}
        <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>ביטול</Button><Button disabled={busy || !accepted || !eligible.length} onClick={() => void publish()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שמירת תמחור ופרסום'}</Button></div>
      </DialogContent>
    </Dialog>
    <PauseDistributionDialog open={pauseOpen} busy={busy} onOpenChange={setPauseOpen} onConfirm={() => void pause()} />
  </>;
}
