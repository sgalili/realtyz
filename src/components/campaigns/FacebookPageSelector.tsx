import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronDown, Facebook, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useMetaPageBinding, useRefreshMetaPageBinding } from '@/hooks/useMetaPageBinding';
import { useRefreshFacebookHealth } from '@/hooks/useFacebookHealth';
import { openFacebookConnection } from '@/lib/facebookConnectionFlow';
import { purgeCachedPostsForPage } from '@/lib/campaignFeedCache';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Page = { id: string; name: string | null; picture: string | null };

function Avatar({ page, size = 'h-6 w-6' }: { page: Page; size?: string }) {
  return page.picture ? (
    <img src={page.picture} alt="" className={`${size} shrink-0 rounded-full object-cover`} referrerPolicy="no-referrer" />
  ) : (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-primary/10`}>
      <Facebook className="h-3.5 w-3.5 text-primary" />
    </span>
  );
}

export function FacebookPageSelector() {
  const owner = useActiveWorkspaceOwnerId();
  const navigate = useNavigate();
  const { data: selected } = useMetaPageBinding();
  const refresh = useRefreshMetaPageBinding();
  const refreshHealth = useRefreshFacebookHealth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Page | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const { data: pages = [], refetch, isFetching, error: pagesError } = useQuery<Page[]>({
    queryKey: ['managed-facebook-pages', owner], enabled: !!owner, retry: false, staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('meta-page-connect', { body: { action: 'list_pages', owner_id: owner } });
      if (error || data?.error || data?.ok === false) throw new Error(data?.error || 'לא ניתן לטעון את עמודי הפייסבוק. יש לחדש את החיבור.');
      return Array.isArray(data?.pages) ? data.pages : [];
    },
  });
  useEffect(() => {
    const reload = () => { void refetch(); refresh(); };
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [refetch, refresh]);

  const current = pages.find((p) => p.id === selected?.pageId) ?? null;

  const choose = async (pageId: string) => {
    if (!owner || saving || pageId === selected?.pageId) { setOpen(false); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-page-connect', { body: { action: 'select_page', page_id: pageId, owner_id: owner } });
      if (error || data?.error || data?.ok === false) throw new Error(data?.error || error?.message || 'בחירת העמוד נכשלה');
      refresh();
      setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'בחירת העמוד נכשלה'); }
    finally { setSaving(false); }
  };

  const confirmRemove = async () => {
    if (!removing || removingBusy) return;
    setRemovingBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-page-connect', { body: { action: 'disconnect_page', page_id: removing.id } });
      if (error || data?.error || data?.ok === false) throw new Error(data?.error || error?.message || 'ניתוק העמוד נכשל');
      purgeCachedPostsForPage(removing.id);
      refresh(); refreshHealth(); void refetch();
      toast.success('העמוד נותק');
      setRemoving(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'ניתוק העמוד נכשל'); }
    finally { setRemovingBusy(false); }
  };

  const addPage = () => { setOpen(false); openFacebookConnection(); };
  const manageGroups = () => { setOpen(false); navigate('/profile?tab=connections&connect=facebook-groups'); };

  return (
    <div dir="rtl" className="mt-2 flex min-w-0 flex-col gap-1 text-sm" aria-label="עמוד הפייסבוק לפרסום">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-10 w-full justify-between gap-2 px-3 sm:w-72" aria-label="בחירת עמוד פייסבוק" disabled={saving}>
            <span className="flex min-w-0 items-center gap-2">
              {current ? <Avatar page={current} /> : <Facebook className="h-4 w-4 text-primary" />}
              <span className="truncate">{current?.name || selected?.pageName || 'בחירת עמוד פייסבוק'}</span>
            </span>
            {saving || isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent dir="rtl" align="start" className="w-[min(20rem,calc(100vw-2rem))] p-1">
          <div className="max-h-72 overflow-y-auto">
            {pages.map((page) => {
              const isSelected = page.id === selected?.pageId;
              return (
                <div key={page.id} className={`flex items-center gap-1 rounded-md px-1 ${isSelected ? 'bg-muted' : 'hover:bg-muted/60'}`}>
                  <button type="button" onClick={() => void choose(page.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-right">
                    <Avatar page={page} />
                    <span className="min-w-0 flex-1 truncate">{page.name || page.id}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                  <button type="button" onClick={manageGroups} aria-label={`ניהול קבוצות עבור ${page.name || page.id}`} title="ניהול קבוצות"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
                    <Users className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => { setOpen(false); setRemoving(page); }} aria-label={`נתק את העמוד ${page.name || page.id}`} title="נתק עמוד"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            {pages.length === 0 && !isFetching && <p className="px-2 py-2 text-muted-foreground">אין עמודים מחוברים</p>}
          </div>
          <div className="mt-1 border-t pt-1">
            <button type="button" onClick={addPage} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-right text-primary hover:bg-muted/60">
              <Plus className="h-4 w-4" />הוספת עמוד נוסף
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {pagesError && <span role="alert" className="text-xs text-destructive">{pagesError.message}</span>}

      <AlertDialog open={!!removing} onOpenChange={(v) => !v && !removingBusy && setRemoving(null)}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>לנתק את העמוד "{removing?.name || removing?.id}"?</AlertDialogTitle>
            <AlertDialogDescription>העמוד והקמפיינים שלו יוסרו מסביבת העבודה. אפשר לחבר אותו שוב בכל עת.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-between gap-2 sm:justify-between">
            <AlertDialogCancel disabled={removingBusy} className="mt-0">ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmRemove(); }} disabled={removingBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removingBusy && <Loader2 className="h-4 w-4 animate-spin" />}נתק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
