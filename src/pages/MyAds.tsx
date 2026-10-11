import { Table } from '@/components/ui/table';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PublicListingPublisher } from '@/components/public/PublicListingPublisher';
import MyFavoriteAds from '@/components/public/MyFavoriteAds';
import PropertyReferralButton from '@/components/public/PropertyReferralButton';
import { readPublicListingDraft, clearPublicListingDraft, type PublicListingDraft } from '@/lib/publicListingDraft';
import { SelectModeToggle, SelectBox, SelectAllRow } from '@/components/ui/multi-select-controls';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
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
    refetchInterval: 30_000, refetchOnWindowFocus: true,
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
function AdCard({ row: r, owned = false }: { row: Row; owned?: boolean }) {
  const { activeWorkspaceId } = useWorkspace();
  const [open, setOpen] = useExclusiveExpansion(`my-ads:${activeWorkspaceId}`, `${r.relation}:${r.listing_id}`);
  const title = [r.address, r.city].filter(Boolean).join(', ') || r.title || 'נכס';
  return <article className="min-w-0 overflow-hidden rounded-lg border bg-card" data-my-ad={r.listing_id}>
    <div data-property-image-toolbar className="flex min-h-10 items-center justify-end gap-1 px-3">{owned && <span title="המודעה שלי" className="inline-flex text-primary"><BadgeCheck className="h-3.5 w-3.5" /></span>}<PropertyReferralButton listingId={r.listing_id} /></div>
    <div className="flex min-w-0 gap-3 p-3">
      <Link to={`/p/${r.slug || r.listing_id}`} state={{ returnTo: '/my-ads' }} className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted" aria-label={title}>
        {r.image_url ? <img src={r.image_url} alt={title} loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-7 w-7 text-muted-foreground" />}

      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <Link to={`/p/${r.slug || r.listing_id}`} state={{ returnTo: '/my-ads' }} className="block truncate font-semibold text-foreground" title={title}>{title}</Link>
        <p className="font-bold text-primary">{formatPrice(Number(r.asking_price) || 0, r.deal_type === 'rent' ? 'rent' : r.deal_type === 'sale' ? 'sale' : null)}</p>
        {owned && <ListingLifecycleStatus listingId={r.listing_id} />}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {([{ icon: Eye, value: r.views, label: 'צפיות' }, { icon: MousePointerClick, value: r.clicks, label: 'קליקים' }, { icon: Users, value: r.affiliates, label: 'שותפים מקדמים' }]).map(({ icon: Icon, value, label }) => <Button key={label} variant="ghost" size="sm" className="h-auto gap-1.5 px-0 py-1 text-muted-foreground" aria-expanded={open} aria-controls={`stats-${r.relation}-${r.listing_id}`} onClick={() => setOpen(v => !v)}><Icon className="h-4 w-4" /><b className="text-foreground">{number(value)}</b>{label}</Button>)}
          <Button variant="ghost" size="sm" className="h-auto gap-1 px-0 py-1" onClick={() => setOpen(v => !v)} aria-expanded={open}><Banknote className="h-4 w-4" />פירוט<ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /></Button>
        </div>
      </div>
    </div>
    <AnimatedExpansion open={open} id={`stats-${r.relation}-${r.listing_id}`}><AdDetails listingId={r.listing_id} /></AnimatedExpansion>
  </article>;
}
export default function MyAds() {
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
      const [local, result] = await Promise.all([readPublicListingDraft(`${user.id}:${activeWorkspaceId}`), supabase.from('listings').select('id, property_title, address, city, house_number, neighborhood, asking_price, deal_type, rooms, sqm, floor, description, long_description, features, attributes, elevator, parking, media_photos, image_url, status, is_published, source_metadata, extraction_metadata, updated_at').eq('workspace_owner_id', activeWorkspaceId).eq('is_published', false).neq('status', 'discarded').order('updated_at', { ascending: false })]);
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
    refetchInterval: 30_000, refetchOnWindowFocus: true,
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
  const visible = !listingFilter ? data : tFilter!.key === 'promoted_listings' ? data.filter(r => r.relation === 'promoting') : data.filter(r => r.relation === 'owned' && sharedIds?.has(r.listing_id));
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
    {tFilter && !listingFilter ? null : isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : isError ? <div role="alert">לא ניתן לטעון את המודעות <Button variant="link" onClick={() => void refetch()}>ניסיון נוסף</Button></div> : !data.length ? <p className="py-10 text-center text-muted-foreground">עדיין אין מודעות שפרסמת או נכסים שאתה מקדם.</p> : (['owned', 'promoting'] as const).map(relation => {
      const rows = visible.filter(r => r.relation === relation);
      return rows.length ? <section key={relation} className="space-y-2"><h2 className="font-bold">{relation === 'owned' ? 'המודעות שלי' : 'נכסים שאני מקדם'} ({rows.length})</h2><div className="space-y-3">{rows.map(r => <AdCard key={r.listing_id} row={r} owned={relation === 'owned'} />)}</div></section> : null;
    })}
      </TabsContent>
    </Tabs>
    {resumeDraft && <PublicListingPublisher key={`${activeWorkspaceId}:${resumeDraft.listingId || resumeDraft.savedAt}`} resumeDraft={resumeDraft} onRecovered={() => { setResumeDraft(undefined); void recovery.refetch(); void refetch(); }} />}
  </div>;
}
