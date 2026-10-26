import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useMetaPageBinding, useRefreshMetaPageBinding } from '@/hooks/useMetaPageBinding';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageAvatarIcon } from './PageAvatarIcon';

type Page = { id: string; name: string | null; picture: string | null };
export function FacebookPageSelector() {
  const owner = useActiveWorkspaceOwnerId();
  const { data: selected } = useMetaPageBinding();
  const refresh = useRefreshMetaPageBinding();
  const [saving, setSaving] = useState(false);
  const { data: pages = [], refetch, isFetching, error: pagesError } = useQuery<Page[]>({
    queryKey: ['managed-facebook-pages', owner], enabled: !!owner, retry: false, staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('meta-page-connect', { body: { action: 'list_pages', workspace_owner_id: owner } });
      if (error || data?.error || data?.ok === false) throw new Error(data?.error || 'לא ניתן לטעון את עמודי הפייסבוק. יש לחדש את החיבור.');
      return Array.isArray(data?.pages) ? data.pages : [];
    },
  });
  useEffect(() => {
    const reload = () => { void refetch(); refresh(); };
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [refetch, refresh]);
  const choose = async (pageId: string) => {
    if (!owner || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-page-connect', { body: { action: 'select_page', page_id: pageId, workspace_owner_id: owner } });
      if (error || data?.error || data?.ok === false) throw new Error(data?.error || error?.message || 'בחירת העמוד נכשלה');
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'בחירת העמוד נכשלה'); }
    finally { setSaving(false); }
  };
  return <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-label="עמוד הפייסבוק לפרסום">
    {selected?.pageId && <><PageAvatarIcon className="h-8 w-8" /><span className="min-w-0 break-words">{selected.pageName || 'עמוד פייסבוק'}</span></>}
    {pages.length > 0 ? <Select value={pages.some(p => p.id === selected?.pageId) ? selected?.pageId : undefined} onValueChange={id => void choose(id)} disabled={saving || isFetching}>
      <SelectTrigger className="w-full sm:w-64" aria-label="בחירת עמוד פייסבוק"><SelectValue placeholder="בחירת עמוד פייסבוק" /></SelectTrigger>
      <SelectContent>{pages.map(page => <SelectItem key={page.id} value={page.id}><span className="flex items-center gap-2">{page.picture && <img src={page.picture} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />}{page.name || page.id}</span></SelectItem>)}</SelectContent>
    </Select> : <Button variant="link" asChild><a href="/profile?tab=connections&fb=choose">חיבור עמוד עסקי</a></Button>}
    {pagesError && <span role="alert" className="w-full text-xs text-destructive">{pagesError.message}</span>}
  </div>;
}