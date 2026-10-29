import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Facebook, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { FACEBOOK_CONNECTION_OPEN } from '@/lib/facebookConnectionFlow';
import { callMetaPageConnect } from '@/lib/facebookPageConnect';
import { FacebookCloudConnectGate } from './FacebookCloudConnectGate';

type Page = { id: string; name: string | null; picture: string | null };
export function FacebookConnectionDialog() {
  const owner = useActiveWorkspaceOwnerId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [linked, setLinked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const load = async () => {
    const run = ++generation.current;
    setLoading(true); setNotice('');
    try {
      const [list, bindings] = await Promise.all([
        callMetaPageConnect<{ pages?: Page[] }>({ action: 'list_pages', owner_id: owner }),
        callMetaPageConnect<{ bindings?: Array<{ id: string }> }>({ action: 'bindings', owner_id: owner }),
      ]);
      if (run !== generation.current) return;
      setPages(list.pages ?? []); setLinked((bindings.bindings ?? []).map(page => page.id));
      if (!list.pages?.length) setNotice('אין דפים נוספים זמינים בחיבור הנוכחי.');
    } catch {
      if (run === generation.current) { setPages([]); setNotice('אין כרגע הרשאה זמינה לחיבור דפים נוספים.'); }
    } finally { if (run === generation.current) setLoading(false); }
  };
  useEffect(() => {
    const show = () => { if (owner) setOpen(true); };
    window.addEventListener(FACEBOOK_CONNECTION_OPEN, show);
    return () => window.removeEventListener(FACEBOOK_CONNECTION_OPEN, show);
  }, [owner]);
  useEffect(() => {
    generation.current++; setPages([]); setLinked([]); setSaving(null); setNotice('');
    if (open && owner) void load();
    return () => { generation.current++; };
  }, [open, owner]);
  const choose = async (page: Page) => {
    if (saving || !owner) return;
    const run = generation.current;
    setSaving(page.id); setNotice('');
    try {
      const result = await callMetaPageConnect<{ ok?: boolean }>({ action: 'select_page', page_id: page.id, owner_id: owner });
      if (run !== generation.current) return;
      if (result.ok !== true) throw new Error('not_saved');
      setLinked(previous => [...new Set([...previous, page.id])]);
      await Promise.all(['meta-page-binding', 'facebook-health', 'managed-facebook-pages', 'fb-posting-capacity', 'social-connections'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      window.dispatchEvent(new Event('realtyz:facebook-connection-changed'));
    } catch { if (run === generation.current) setNotice('הדף לא חובר. אפשר לנסות שוב.'); }
    finally { if (run === generation.current) setSaving(null); }
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent dir="rtl" className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg">
      <Facebook className="mx-auto h-8 w-8 text-social-facebook" />
      <DialogTitle className="text-center">חיבור מהיר לפייסבוק</DialogTitle>
      <DialogDescription className="sr-only">בחירת דף עסקי וחיבור פייסבוק בענן</DialogDescription>
      {loading ? <div role="status" className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div> : <div className="space-y-2">
        {pages.map(page => <Button key={page.id} variant="outline" className="h-auto min-h-12 w-full justify-between gap-3 whitespace-normal" disabled={!!saving || linked.includes(page.id)} onClick={() => void choose(page)}>
          <span className="flex min-w-0 items-center gap-2">{page.picture && <img src={page.picture} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />}<span className="break-words">{page.name || page.id}</span></span>
          {saving === page.id ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : linked.includes(page.id) ? <CheckCircle2 aria-label="מחובר" className="h-5 w-5 shrink-0 text-success" /> : <Facebook className="h-5 w-5 shrink-0 text-social-facebook" />}
        </Button>)}
      </div>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {!loading && pages.length === 0 && <FacebookCloudConnectGate alwaysVisible connectionOnly onSynced={() => void load()} />}
      <Button variant="ghost" disabled={loading || !!saving} onClick={() => void load()} className="gap-2"><RefreshCw className="h-4 w-4" />רענון דפים</Button>
    </DialogContent>
  </Dialog>;
}