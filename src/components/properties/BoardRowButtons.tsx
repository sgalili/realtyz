// Standalone board-row actions extracted from the share menu.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAppMode } from '@/hooks/useAppMode';
import { useUserRole } from '@/hooks/useUserRole';
import { mintShareUrlForResult, prepareCampaignListingIds } from '@/lib/propertyShare';
import type { UnifiedResult } from '@/lib/propertySearch';
import { useAuth } from '@/hooks/useAuth';
import { JoinPartnerDialog } from '@/components/affiliate/JoinPartnerDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { publicUrl } from '@/lib/publicUrl';

export function BoardPublishButton({ result }: { result: UnifiedResult }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { isPartnerMode } = useAppMode();
  const { isAffiliateOnly } = useUserRole();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const ids = await prepareCampaignListingIds([result]);
      const params = new URLSearchParams({ tab: 'create', channel: 'facebook', properties: ids.join(','), listing: ids[0], fresh: '1' });
      navigate(`${isPartnerMode || isAffiliateOnly ? '/posts' : '/campaigns'}?${params.toString()}`);
    } catch (e: any) { toast.error(e?.message ?? 'הכנת הנכס לפרסום ברשתות נכשלה'); }
    finally { setBusy(false); }
  };
  return (
    <><Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={busy} title="פרסם נכס" aria-label="פרסם נכס" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
    </Button>
    {!user ? <JoinPartnerDialog open={open} onOpenChange={setOpen} publishing /> : <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="sm:max-w-md" onClick={event => event.stopPropagation()}><DialogHeader><DialogTitle className="text-right text-2xl font-extrabold">פרסום נכס ברשתות החברתיות</DialogTitle><DialogDescription className="text-right text-base">{result.title}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button><Button disabled={busy} onClick={() => void run()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}יצירת פוסט לנכס</Button></DialogFooter></DialogContent></Dialog>}
    </>
  );
}

export function BoardOpenPageButton({ result, publicPath }: { result: UnifiedResult; publicPath?: string }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (publicPath || result.localId) {
      window.open(publicUrl(publicPath ?? `/p/${encodeURIComponent(result.localId ?? '')}`), '_blank', 'noopener,noreferrer');
      return;
    }
    setBusy(true);
    try { window.open(await mintShareUrlForResult(result), '_blank', 'noopener,noreferrer'); }
    catch (e: any) { toast.error(e?.message ?? 'פתיחת דף הנכס נכשלה'); }
    finally { setBusy(false); }
  };
  return (
    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={busy} title="פתח בחלון חדש" aria-label="פתח בחלון חדש" onClick={(e) => { e.stopPropagation(); void run(); }}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
    </Button>
  );
}
