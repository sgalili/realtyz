import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronDown, Facebook, Loader2, Plus, Trash2, LogOut } from 'lucide-react';
import { useCloudSessionConnected, CLOUD_SESSION_KEY } from '@/hooks/useCloudSession';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useMetaPageBinding, useRefreshMetaPageBinding } from '@/hooks/useMetaPageBinding';
import { useRefreshFacebookHealth } from '@/hooks/useFacebookHealth';
import { openFacebookConnection } from '@/lib/facebookConnectionFlow';
import { callMetaPageConnect } from '@/lib/facebookPageConnect';
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
  const qc = useQueryClient();
  const cloudConnected = useCloudSessionConnected();
  const { data: selected } = useMetaPageBinding();
  const refresh = useRefreshMetaPageBinding();
  const refreshHealth = useRefreshFacebookHealth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Page | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const [disconnectProfile, setDisconnectProfile] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const { data: pages = [], refetch, isFetching, error: pagesError } = useQuery<Page[]>({
    queryKey: ['managed-facebook-pages', owner], enabled: !!owner, retry: false, staleTime: 60_000,
    queryFn: async () => {
      const data = await callMetaPageConnect({ action: 'bindings', owner_id: owner });
      return Array.isArray(data?.bindings) ? data.bindings : [];
    },
  });
  useEffect(() => {
    const reload = () => { void refetch(); refresh(); };
    window.addEventListener('focus', reload);
    window.addEventListener('realtyz:facebook-connection-changed', reload);
    return () => { window.removeEventListener('focus', reload); window.removeEventListener('realtyz:facebook-connection-changed', reload); };
  }, [refetch, refresh]);

  useEffect(() => { setOpen(false); setRemoving(null); setDisconnectProfile(false); }, [owner]);

  const current = pages.find((p) => p.id === selected?.pageId) ?? null;

  const choose = async (pageId: string) => {
    setOpen(false);
    if (!owner || saving || pageId === selected?.pageId) { setOpen(false); return; }
    setSaving(true);
    try {
      await callMetaPageConnect({ action: 'set_default', page_id: pageId, owner_id: owner });
      refresh();
      setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'בחירת העמוד נכשלה'); }
    finally { setSaving(false); }
  };

  const confirmRemove = async () => {
    if (!removing || removingBusy || !owner) return;
    setRemovingBusy(true);
    try {
      await callMetaPageConnect({ action: 'disconnect_page', page_id: removing.id, owner_id: owner });
      purgeCachedPostsForPage(removing.id);
      refresh(); refreshHealth(); void refetch();
      toast.success('העמוד נותק');
      setRemoving(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'ניתוק העמוד נכשל'); }
    finally { setRemovingBusy(false); }
  };

  const addPage = () => { setOpen(false); openFacebookConnection(); };
  const confirmProfileDisconnect = async () => {
    if (!owner || profileBusy) return;
    setProfileBusy(true);
    try {
      // Existing server-authorized actions remove old Page grants and the cloud
      // browser reference, so the next connection cannot reuse the old account.
      const { data, error } = await supabase.functions.invoke('fb-session-vault', { body: { action: 'clear' } });
      if (error || data?.error || data?.success !== true) throw new Error(data?.message || 'ניתוק הפרופיל נכשל');
      await callMetaPageConnect({ action: 'disconnect', owner_id: owner });
      refresh(); refreshHealth();
      await Promise.all([CLOUD_SESSION_KEY, 'managed-facebook-pages', 'fb-posting-capacity', 'social-connections'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      window.dispatchEvent(new Event('realtyz:facebook-connection-changed'));
      window.dispatchEvent(new Event('realtyz:facebook-disconnected'));
      setDisconnectProfile(false);
      toast.success('פרופיל הפייסבוק נותק. אפשר לחבר חשבון אחר.');
    } catch (e) {
      void qc.invalidateQueries({ queryKey: [CLOUD_SESSION_KEY] });
      toast.error(e instanceof Error ? e.message : 'ניתוק הפרופיל נכשל');
    } finally { setProfileBusy(false); }
  };

  return (
    <div dir="rtl" className="mt-2 flex min-w-0 flex-col gap-1 text-sm" aria-label="עמוד הפייסבוק לפרסום">
      {!cloudConnected && <Button type="button" onClick={addPage} className="h-12 w-full gap-2 bg-social-facebook text-base font-semibold text-social-foreground hover:bg-social-facebook/90 sm:w-72"><Facebook className="!h-[30px] !w-[30px]" />התחברות לפייסבוק</Button>}
      {(cloudConnected || pages.length > 0) && <Popover open={open} onOpenChange={setOpen}>
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
                  <Button variant="ghost" type="button" onClick={() => void choose(page.id)} className="h-auto min-w-0 flex-1 justify-start gap-2 px-1 py-2 text-right">
                    <Avatar page={page} />
                    <span className="min-w-0 flex-1 truncate">{page.name || page.id}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </Button>
                  <Button variant="ghost" size="icon" type="button" onClick={() => { setOpen(false); setRemoving(page); }} aria-label={`נתק את העמוד ${page.name || page.id}`} title="נתק עמוד"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            {pages.length === 0 && !isFetching && <p className="px-2 py-2 text-muted-foreground">אין עמודים מחוברים</p>}
          </div>
          <div className="mt-1 border-t pt-1">
            {cloudConnected && <Button variant="ghost" type="button" onClick={addPage} className="h-auto w-full justify-start gap-2 rounded-md px-2 py-2 text-right text-primary hover:bg-muted/60">
              <Plus className="h-4 w-4" />הוספת עמוד נוסף
            </Button>}
            {cloudConnected && <Button variant="ghost" type="button" onClick={() => { setOpen(false); setDisconnectProfile(true); }} className="h-auto w-full justify-start gap-2 px-2 py-2 text-destructive" disabled={profileBusy}><LogOut className="h-4 w-4" />ניתוק פרופיל פייסבוק</Button>}
          </div>
        </PopoverContent>
      </Popover>}
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
      <AlertDialog open={disconnectProfile} onOpenChange={(value) => !value && !profileBusy && setDisconnectProfile(false)}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>לנתק את פרופיל הפייסבוק?</AlertDialogTitle>
            <AlertDialogDescription>חיבור הפייסבוק, העמודים, הרשאות הקבוצות וחיבור אינסטגרם המקושר יוסרו מסביבת העבודה. פרסום דרכם ידרוש חיבור מחדש. לאחר הניתוק אפשר להתחבר לחשבון פייסבוק אחר.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-between gap-2 sm:justify-between">
            <AlertDialogCancel disabled={profileBusy} className="mt-0">ביטול</AlertDialogCancel>
            <AlertDialogAction disabled={profileBusy} onClick={(event) => { event.preventDefault(); void confirmProfileDisconnect(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{profileBusy && <Loader2 className="h-4 w-4 animate-spin" />}נתק פרופיל</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
