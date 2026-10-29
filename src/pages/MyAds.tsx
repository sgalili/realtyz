import { Table } from '@/components/ui/table';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PublicListingPublisher } from '@/components/public/PublicListingPublisher';
import MyFavoriteAds from '@/components/public/MyFavoriteAds';
import { personalPropertyLink } from '@/lib/propertyReferral';
import { readPublicListingDraft, clearPublicListingDraft, type PublicListingDraft } from '@/lib/publicListingDraft';
import { SelectModeToggle, SelectBox, SelectAllRow } from '@/components/ui/multi-select-controls';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Trash2, Share2, Megaphone, ExternalLink, Pencil, MoreVertical, Link2 } from 'lucide-react';
import { PropertyShareMenu } from '@/components/properties/PropertyShareMenu';
import { useDeleteListings } from '@/hooks/useDeleteListings';
import { publicUrl } from '@/lib/publicUrl';
import { listingToDraft, missingAdFields } from '@/lib/adRecovery';
import { Eye, Loader2, MousePointerClick, Users, ImageIcon, Banknote, ChevronDown, BadgeCheck } from 'lucide-react';
import ListingLifecycleStatus from '@/components/listings/ListingLifecycleStatus';
import TransparencyWidget from '@/components/transparency/TransparencyWidget';
import LeadDisputesPanel from '@/components/transparency/LeadDisputesPanel';
import TransparencyResults from '@/components/transparency/TransparencyResults';
import type { TransparencyFilter } from '@/components/transparency/TransparencyWidget';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useExclusiveExpansion } from '@/hooks/useExclusiveExpansion';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { Button } from '@/components/ui/button';
import { HorizontalTableScroll } from '@/components/ui/horizontal-table-scroll';
import { formatPrice } from '@/pages/PublicListingPage';
import StandardPropertyCard from '@/components/public/StandardPropertyCard';
import PublicAdHeading from '@/components/public/PublicAdHeading';
import type { PublicCard } from '@/pages/PublicListingsBoard';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import { toast } from 'sonner';
import { useListingAudience } from '@/hooks/useListingAudience';

type Row = {
  listing_id: string; relation: 'owned' | 'promoting'; title: string | null; city: string | null; address: string | null;
  deal_type: string | null; asking_price: number | null; slug: string | null; image_url: string | null;
  views: number; clicks: number; affiliates: number;
};
type Affiliate = { affiliate_id: string; name: string; views: number; clicks: number; leads: number; paid_bids: number; paid_count: number; since: string | null; last_activity: string | null };
type History = { id: string; at: string; type: string; amount: number; name: string };
type Details = { affiliates: Affiliate[]; history: History[]; history_started_at: string | null; has_older_history: boolean; owned: boolean };
const number = (value: number) => Number(value || 0).toLocaleString('he-IL');
const date = (value: string | null) => value ? new Date(value).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const labels: Record<string, string> = { view: 'צפייה במודעה', click: 'לחיצה על קישור', promotion: 'תחילת קידום', contact: 'ליד חדש', purchase: 'רכישת ליד' };

function AdDetails({ listingId }: { listingId: string }) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const history = useInfiniteQuery({
    queryKey: ['my-ad-history', user?.id, activeWorkspaceId, listingId],
    initialPageParam: 0,
    refetchInterval: 30_000,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_my_ad_history', { _listing_id: listingId, _offset: pageParam });
      if (error) throw error;
      return data as unknown as { items: History[]; total: number };
    },
    getNextPageParam: (last, pages) => { const count = pages.reduce((total, p) => total + p.items.length, 0); return count < last.total ? count : undefined; },
  });
  const events = history.data?.pages.flatMap(p => p.items) ?? [];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-ad-details', user?.id, activeWorkspaceId, listingId],
    refetchInterval: 120_000, refetchOnWindowFocus: false, staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_ad_details', { _listing_id: listingId });
      if (error) throw error;
      return data as unknown as Details;
    },
  });
  if (isLoading) return <div className="flex justify-center p-5"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError) return <div role="alert" className="p-4 text-sm">לא ניתן לטעון את הנתונים <Button variant="link" onClick={() => void refetch()}>ניסיון נוסף</Button></div>;
  return <div className="space-y-5 bg-muted/20 p-4">
    <section className="space-y-2">
      <h3 className="font-semibold">{data?.owned ? 'תוצאות השותפים' : 'תוצאות הקידום שלי'}</h3>
      {!data?.affiliates.length ? <p className="text-sm text-muted-foreground">אין עדיין שותפים מקדמים</p> : <HorizontalTableScroll>
        <Table className="w-full min-w-[680px] text-right text-sm">
          <thead><tr className="text-muted-foreground">{['שותף', 'צפיות מתועדות', 'קליקים', 'לידים', 'רכישות בתשלום', 'סכום ששולם', 'תחילת קידום', 'פעילות אחרונה'].map(t => <th key={t} className="p-2 font-medium">{t}</th>)}</tr></thead>
          <tbody>{data.affiliates.map(a => <tr key={a.affiliate_id} className="border-t"><td className="p-2 font-semibold">{a.name}</td><td className="p-2">{number(a.views)}</td><td className="p-2">{number(a.clicks)}</td><td className="p-2">{number(a.leads)}</td><td className="p-2">{number(a.paid_count)}</td><td className="p-2 whitespace-nowrap">₪{number(a.paid_bids)}</td><td className="p-2 whitespace-nowrap">{date(a.since)}</td><td className="p-2 whitespace-nowrap">{date(a.last_activity)}</td></tr>)}</tbody>
        </Table>
      </HorizontalTableScroll>}
    </section>
    <section className="space-y-2">
      <h3 className="font-semibold">היסטוריית פעילות</h3>
      <p className="text-sm text-muted-foreground">צפיות וקליקים מהעבר נכללים במונים; פירוט לפי זמן זמין מתחילת תיעוד ההיסטוריה{data?.history_started_at ? ` (${date(data.history_started_at)})` : ''}.</p>
      {history.isError ? <p role="alert">לא ניתן לטעון את ההיסטוריה <Button variant="link" onClick={() => void history.refetch()}>ניסיון נוסף</Button></p> : history.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : !events.length ? <p className="text-sm text-muted-foreground">אין עדיין פעילות מתועדת</p> : <ol className="max-h-80 divide-y overflow-y-auto">
        {events.map(h => <li key={h.id + h.type} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{labels[h.type] || 'פעילות'}</span>{h.name && <span className="text-muted-foreground">{h.name}</span>}{(h.type === 'view' || h.type === 'click') && h.amount > 1 && <span>×{number(h.amount)}</span>}{h.type === 'purchase' && <span className="text-success">₪{number(h.amount)}</span>}</div><time className="text-muted-foreground" dateTime={h.at}>{date(h.at)}</time></li>)}
      </ol>}
      {history.hasNextPage && <Button variant="ghost" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>פעילות קודמת</Button>}
    </section>
  </div>;
}
/** Per-ad quick actions collapsed into a single three-dots menu; copy link lives inside the share menu. */
function AdActions({ row: r, owned, title }: { row: Row; owned: boolean; title: string }) {
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const url = publicUrl(`/p/${r.slug || r.listing_id}`);
  const result = { key: r.listing_id, localId: r.listing_id, source: 'mine', title: r.title ?? title, address: r.address ?? null, city: r.city ?? null, price: Number(r.asking_price) || null, listing_type: r.deal_type === 'rent' ? 'rent' : 'sale', photos: r.image_url ? [r.image_url] : [] } as any;
  const copyPartnerLink = async () => {
    try {
      await navigator.clipboard.writeText(await personalPropertyLink(r.listing_id));
      toast.success('הקישור האישי הועתק');
    } catch { toast.error('לא ניתן להעתיק קישור אישי לנכס זה'); }
  };
  return <div className="relative flex items-center justify-start" onClick={(e) => e.stopPropagation()}>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="פעולות המודעה" title="פעולות המודעה"><MoreVertical className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem className="gap-2 text-sm" onSelect={() => setShareOpen(true)}><Share2 className="h-4 w-4" /> שיתוף נכס</DropdownMenuItem>
        <DropdownMenuItem className="gap-2 text-sm" onSelect={() => void copyPartnerLink()}><Link2 className="h-4 w-4" /> העתקת קישור שותף אישי</DropdownMenuItem>
        <DropdownMenuItem className="gap-2 text-sm" onSelect={() => navigate(`/campaigns?tab=create&channel=facebook&properties=${r.listing_id}&listing=${r.listing_id}`)}><Megaphone className="h-4 w-4" /> יצירת קמפיין</DropdownMenuItem>
        <DropdownMenuItem className="gap-2 text-sm" onSelect={() => window.open(url, '_blank', 'noopener,noreferrer')}><ExternalLink className="h-4 w-4" /> פתיחה בחלון חדש</DropdownMenuItem>
        {owned && <DropdownMenuItem className="gap-2 text-sm" onSelect={() => navigate(`/properties/${r.listing_id}`)}><Pencil className="h-4 w-4" /> עריכת הנכס</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    <PropertyShareMenu results={[result]} iconOnly variant="ghost" hideTrigger open={shareOpen} onOpenChange={setShareOpen} />
  </div>;
}
function AdCard({ row: r, owned = false }: { row: Row; owned?: boolean }) {
  const { activeWorkspaceId } = useWorkspace();
  const [open, setOpen] = useExclusiveExpansion(`my-ads:${activeWorkspaceId}`, `${r.relation}:${r.listing_id}`);
  const title = [r.address, r.city].filter(Boolean).join(', ') || r.title || 'נכס';
  return <article className="relative min-w-0 py-3" data-my-ad={r.listing_id}>
    <div className="absolute top-3 end-0 z-10">
      <AdActions row={r} owned={owned} title={title} />
    </div>
    <div className="flex min-w-0 gap-3">
      <Link to={`/p/${r.slug || r.listing_id}`} state={{ returnTo: '/my-ads' }} className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted" aria-label={title}>
        {r.image_url ? <img src={r.image_url} alt={title} loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/p/${r.slug || r.listing_id}`} state={{ returnTo: '/my-ads' }} className="block pe-9" title={title}><PublicAdHeading compact dense title={title} price={formatPrice(Number(r.asking_price) || 0, null)} dealType={r.deal_type} /></Link>
        <div className="mt-1 flex items-center justify-end gap-2">

          <button type="button" className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground" aria-expanded={open} aria-controls={`stats-${r.relation}-${r.listing_id}`} onClick={() => setOpen(v => !v)}>
            {([{ icon: Eye, value: r.views, label: 'צפיות' }, { icon: MousePointerClick, value: r.clicks, label: 'קליקים' }, { icon: Users, value: r.affiliates, label: 'שותפים' }]).map(({ icon: Icon, value, label }) => <span key={label} title={label} className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" aria-label={label} /><span className="tabular-nums text-foreground">{number(value)}</span></span>)}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-label="פירוט" />
          </button>
        </div>
      </div>
    </div>
    <AnimatedExpansion open={open} id={`stats-${r.relation}-${r.listing_id}`}>{owned && <div className="pt-3"><ListingLifecycleStatus listingId={r.listing_id} /></div>}<AdDetails listingId={r.listing_id} /></AnimatedExpansion>
  </article>;
}
function ActivityProperties() {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const remove = useDeleteListings();
  const [limit, setLimit] = useState(30);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setSelectMode(false); setSelected(new Set()); }, [user?.id, activeWorkspaceId]);
  const ads = useQuery({
    queryKey: ['my-ads-stats', user?.id, activeWorkspaceId], enabled: !!user?.id && !!activeWorkspaceId,
    refetchInterval: 120_000, refetchOnWindowFocus: false, staleTime: 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_my_ads_stats'); if (error) throw error; return (data ?? []) as Row[]; },
  });
  const audience = useListingAudience((ads.data ?? []).map(row => row.listing_id));
  const owned = (ads.data ?? []).filter(row => row.relation === 'owned' && audience.isVisible(row.listing_id));
  if (ads.isLoading || audience.isLoading) return <p role="status" className="py-8 text-center text-muted-foreground">טוען נכסים…</p>;
  if (ads.isError) return <div role="alert" className="py-8 text-center">לא ניתן לטעון את הנכסים <Button variant="link" onClick={() => void ads.refetch()}>ניסיון נוסף</Button></div>;
  if (!owned.length) return <p className="py-8 text-center text-muted-foreground">עדיין אין נכסים שפרסמתם בלוח.</p>;
  const ids = [...selected];
  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const share = async () => {
    const links = owned.filter(r => selected.has(r.listing_id)).map(r => publicUrl(`/p/${r.slug || r.listing_id}`)).join('\n');
    try { if (navigator.share) await navigator.share({ text: links }); else { await navigator.clipboard.writeText(links); toast.success('הקישורים הועתקו'); } } catch { /* cancelled */ }
  };
  const sharingPartners = owned.reduce((total, r) => total + Number(r.affiliates || 0), 0);
  return <div className="space-y-2 py-2">
    <div className="flex items-center justify-between gap-2">
      <SelectModeToggle active={selectMode} onToggle={() => { setSelectMode(v => !v); setSelected(new Set()); }} count={selected.size} total={owned.length} onSelectAll={() => setSelected(selected.size === owned.length ? new Set() : new Set(owned.map(r => r.listing_id)))} />
      <span className="text-xs text-muted-foreground"><Users className="ms-0 me-1 inline h-3.5 w-3.5" />{number(sharingPartners)} שיתופים פעילים של שותפים</span>
    </div>
    {selectMode && selected.size > 0 && <div className="flex items-center justify-end gap-1 border-b pb-2">
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="שיתוף" title="שיתוף" onClick={() => void share()}><Share2 className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="צור קמפיין" title="צור קמפיין" onClick={() => navigate(`/campaigns?tab=create&channel=facebook&properties=${ids.join(',')}&listing=${ids[0]}`)}><Megaphone className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="מחיקה" title="מחיקה" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" /></Button>
    </div>}
    <ul className="divide-y">
      {owned.slice(0, limit).map(r => {
        const title = [r.address, r.city].filter(Boolean).join(', ') || r.title || 'נכס';
        return <li key={r.listing_id} className="flex min-w-0 items-center gap-2 py-2">
          {selectMode && <SelectBox checked={selected.has(r.listing_id)} onChange={() => toggle(r.listing_id)} label={`בחירת ${title}`} />}
          <Link to={`/p/${r.slug || r.listing_id}`} className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted" aria-label={title}>{r.image_url ? <img src={r.image_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}</Link>
          <div className="min-w-0 flex-1">
            <Link to={`/p/${r.slug || r.listing_id}`} className="block" title={title}><PublicAdHeading compact dense title={title} price={formatPrice(Number(r.asking_price) || 0, null)} dealType={r.deal_type} /></Link>
            <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground"><span className="font-semibold text-foreground"><Users className="me-0.5 inline h-3 w-3" />{number(r.affiliates)} שותפים משתפים</span><span><Eye className="me-0.5 inline h-3 w-3" />{number(r.views)}</span><span><MousePointerClick className="me-0.5 inline h-3 w-3" />{number(r.clicks)}</span></div>
          </div>
        </li>;
      })}
    </ul>
    {owned.length > limit && <div className="text-center"><Button variant="outline" onClick={() => setLimit(value => value + 30)}>נכסים נוספים</Button></div>}
    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>למחוק {selected.size} נכסים?</AlertDialogTitle><AlertDialogDescription>הנכסים יימחקו לצמיתות מהלוח.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>ביטול</AlertDialogCancel><AlertDialogAction disabled={remove.isPending} onClick={() => remove.mutate(ids, { onSuccess: () => { toast.success('הנכסים נמחקו'); setSelected(new Set()); void ads.refetch(); }, onError: (e) => toast.error(e instanceof Error ? e.message : 'המחיקה נכשלה') })}>מחיקה</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

export default function MyAds({ activityOnly = false }: { activityOnly?: boolean } = {}) {
  return activityOnly ? <ActivityProperties /> : <MyAdsPage />;
}

function MyAdsPage() {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [resumeDraft, setResumeDraft] = useState<PublicListingDraft>();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { setResumeDraft(undefined); setSelectMode(false); setSelected(new Set()); }, [activeWorkspaceId, user?.id]);
  const recovery = useQuery({
    queryKey: ['my-ad-recovery', user?.id, activeWorkspaceId], enabled: Boolean(user?.id && activeWorkspaceId), refetchOnMount: 'always', refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user?.id || !activeWorkspaceId) return [];
      const [local, result] = await Promise.all([readPublicListingDraft(`${user.id}:${activeWorkspaceId}`), supabase.from('listings').select('id, property_title, address, city, house_number, neighborhood, asking_price, deal_type, rooms, sqm, floor, description, long_description, features, attributes, contact_options, affiliate_tier1_amount, affiliate_tier2_amount, affiliate_tier3_amount, affiliate_tier4_amount, affiliate_tier4_type, elevator, parking, media_photos, image_url, status, is_published, source_metadata, extraction_metadata, updated_at').eq('workspace_owner_id', activeWorkspaceId).eq('is_published', false).neq('status', 'discarded').order('updated_at', { ascending: false })]);
      if (result.error) throw result.error;
      const rows = (result.data || []).flatMap(row => {
        const draft = listingToDraft(row);
        const missing = missingAdFields(draft).filter(field => !['שם מפרסם', 'מספר ווטסאפ', 'אישור התקנון'].includes(field));
        if (!['pending', 'live'].includes(row.status)) return [];
        if (row.status !== 'pending' && !draft.publicationError && !missing.length) return [];
        return [{ ...draft, files: [], videos: [], savedAt: new Date(row.updated_at).getTime(), publicationError: draft.publicationError || (row.status === 'failed' ? 'הפרסום הקודם לא הושלם. לא נשמר פירוט שגיאה.' : '') } satisfies PublicListingDraft];
      });
      if (local && (local.city || local.propertyType || local.dealType || local.importedListing || local.publicationError || local.files.length)) return [local, ...rows.filter(row => !local.listingId || row.listingId !== local.listingId)];
      return rows;
    },
  });
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['my-ads-stats', user?.id, activeWorkspaceId], enabled: !!user?.id && !!activeWorkspaceId,
    refetchInterval: 120_000, refetchOnWindowFocus: false, staleTime: 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_my_ads_stats'); if (error) throw error; return (data ?? []) as Row[]; },
  });
  const navigate = useNavigate();
  const [tFilter, setTFilter] = useState<TransparencyFilter | null>(null);
  const { data: sharedIds } = useQuery({
    queryKey: ['transparency-shared-ids', user?.id, activeWorkspaceId], enabled: !!user?.id,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_transparency_shared_listing_ids'); if (error) throw error; return new Set((data ?? []) as string[]); },
  });
  const onTFilter = (f: TransparencyFilter | null) => { if (f?.key === 'wallet') { navigate('/wallet'); return; } setTFilter(f); };
  const listingFilter = tFilter?.key === 'active_listings' || tFilter?.key === 'promoted_listings';
  const audience = useListingAudience(data.map(row => row.listing_id));
  const audienceRows = data.filter(row => audience.isVisible(row.listing_id));
  const visible = !listingFilter ? audienceRows : tFilter?.key === 'promoted_listings' ? audienceRows.filter(r => r.relation === 'promoting') : audienceRows.filter(r => r.relation === 'owned' && sharedIds?.has(r.listing_id));
  const { data: favCount = 0 } = useQuery({
    queryKey: ['my-fav-ads-count', user?.id], enabled: !!user?.id,
    queryFn: async () => { const { count, error } = await supabase.from('listing_favorites').select('listing_id', { count: 'exact', head: true }).eq('user_id', user!.id); if (error) throw error; return count ?? 0; },
  });
  return <div dir="rtl" className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
    <Tabs defaultValue="ads" dir="rtl">
      <TabsList className="mb-1.5 grid h-[44px] w-full grid-cols-3 gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
        <TabsTrigger value="ads" className="h-9 min-w-0 rounded-lg px-2 py-2 text-[15px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{sharedIds?.size ?? 0}{'\u00a0'}נכסים משותפים</TabsTrigger>
        <TabsTrigger value="failed" className="h-9 min-w-0 rounded-lg px-2 py-2 text-[15px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{recovery.data?.length ?? 0} טיוטות</TabsTrigger>
        <TabsTrigger value="favorites" className="h-9 min-w-0 rounded-lg px-2 py-2 text-[15px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{favCount}{'\u00a0'}מועדפים</TabsTrigger>
      </TabsList>
      <TabsContent value="favorites" className="pt-3"><MyFavoriteAds /></TabsContent>
      <TabsContent value="failed" className="space-y-3 pt-3">
        {recovery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : recovery.isError ? <p role="alert">לא ניתן לטעון טיוטות <Button variant="link" onClick={() => void recovery.refetch()}>ניסיון נוסף</Button></p> : !recovery.data?.length ? <p className="py-10 text-center text-muted-foreground">אין מודעות שנכשלו או טיוטות חסרות.</p> : (() => {
          const drafts = recovery.data;
          const keys = drafts.map((d, i) => d.listingId || `local-${i}`);
          const toggle = (key: string) => setSelected(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
          const deleteSelected = async () => {
            setDeleting(true);
            try {
              const ids = drafts.filter((d, i) => selected.has(keys[i]) && d.listingId).map(d => d.listingId as string);
              if (ids.length) {
                const { error } = await supabase.from('listings').delete().in('id', ids).eq('workspace_owner_id', activeWorkspaceId!);
                if (error) throw error;
              }
              if (drafts.some((d, i) => selected.has(keys[i]) && !d.listingId)) await clearPublicListingDraft(`${user!.id}:${activeWorkspaceId}`);
              setSelected(new Set()); setSelectMode(false); setConfirmDelete(false);
              await recovery.refetch();
            } finally { setDeleting(false); }
          };
          return <>
            <div className="flex items-center justify-between gap-2">
              <SelectModeToggle total={keys.length} active={selectMode} count={selected.size} onSelectAll={() => setSelected(new Set(keys))} onToggle={() => { setSelectMode(v => !v); setSelected(new Set()); }} />
              {selectMode && selected.size > 0 && <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" />מחיקת {selected.size} טיוטות</Button>}
            </div>
            {selectMode && <SelectAllRow total={keys.length} selected={selected.size} onToggle={() => setSelected(selected.size === keys.length ? new Set() : new Set(keys))} />}
            {drafts.map((draft, i) => {
              const key = keys[i];
              const title = [draft.street || draft.address, draft.city].filter(Boolean).join(', ') || draft.propertyType || 'טיוטת מודעה';
              const photo = draft.importedListing?.photos?.[0];
              const missing = missingAdFields(draft);
              return <article key={key} className="rounded-lg border bg-card p-3 space-y-3">
                <div className="flex min-w-0 gap-3">
                  {selectMode && <SelectBox checked={selected.has(key)} onChange={() => toggle(key)} label={`בחר ${title}`} className="mt-1" />}
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">{typeof photo === 'string' ? <img src={photo} alt={title} className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}</div>
                  <div className="min-w-0 flex-1"><h2 className="break-words font-semibold">{title}</h2><p className={`text-sm ${draft.publicationError ? 'text-destructive' : 'text-muted-foreground'}`}>{draft.publicationError ? 'הפרסום נכשל' : 'טיוטה שלא הושלמה'}</p><time className="text-xs text-muted-foreground">{date(new Date(draft.savedAt).toISOString())}</time></div>
                </div>
                {draft.publicationError && <p className="break-words text-sm text-destructive">{draft.publicationError}</p>}
                {missing.length > 0 && <p className="break-words text-sm text-muted-foreground">להשלמה: {missing.join(' · ')}</p>}
                {!draft.listingId && <p className="text-xs text-muted-foreground">טיוטה שמורה בדפדפן הזה</p>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setResumeDraft(draft)}>המשך עריכה ופרסום</Button>
                  {selectMode && <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => { setSelected(new Set([key])); setConfirmDelete(true); }}><Trash2 className="h-4 w-4" />מחיקה</Button>}
                </div>
              </article>;
            })}
            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>מחיקת {selected.size} טיוטות</AlertDialogTitle>
                  <AlertDialogDescription>הטיוטות הנבחרות יימחקו לצמיתות ולא ניתן יהיה לשחזר אותן. להמשיך?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
                  <AlertDialogAction disabled={deleting} onClick={e => { e.preventDefault(); void deleteSelected(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{deleting ? 'מוחק…' : 'מחיקה לצמיתות'}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>;
        })()}
      </TabsContent>
      <TabsContent value="ads" className="space-y-6 pt-3">
    <TransparencyWidget filter={tFilter} onFilter={onTFilter} />
    {tFilter && !listingFilter && <TransparencyResults filter={tFilter} />}
    {tFilter?.key === 'disputed' && <LeadDisputesPanel />}
    <div className="flex justify-center py-2"><PublicListingPublisher label="פרסום נכס" triggerClassName="!h-11 !min-w-[180px] !rounded-md !px-8 !text-[17px] !font-semibold" /></div>
    {tFilter && !listingFilter ? null : isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : isError ? <div role="alert">לא ניתן לטעון את המודעות <Button variant="link" onClick={() => void refetch()}>ניסיון נוסף</Button></div> : !data.length ? <div className="flex flex-col items-center gap-3 pt-8 text-center"><ImageIcon className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.25} aria-hidden="true" /><p className="text-[16px] text-muted-foreground">עדיין אין מודעות שפורסמו</p></div> : (['owned', 'promoting'] as const).map(relation => {
      const rows = visible.filter(r => r.relation === relation);
      return rows.length ? <section key={relation} className="space-y-2"><h2 className="font-bold">{relation === 'owned' ? 'המודעות שלי' : 'נכסים שאני מקדם'} ({rows.length})</h2><div className="divide-y divide-border/60">{rows.map(r => <AdCard key={r.listing_id} row={r} owned={relation === 'owned'} />)}</div></section> : null;
    })}
      </TabsContent>
    </Tabs>
    {resumeDraft && <PublicListingPublisher key={`${activeWorkspaceId}:${resumeDraft.listingId || resumeDraft.savedAt}`} resumeDraft={resumeDraft} onRecovered={() => { setResumeDraft(undefined); void recovery.refetch(); void refetch(); }} />}
  </div>;
}
