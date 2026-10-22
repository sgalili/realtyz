// Reusable share control for property results — cards, table rows, preview
// dialog and batch selection all mint the same secure landing-page link.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppMode } from '@/hooks/useAppMode';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Share2, MessageCircle, Copy, Loader2, Smartphone, Mail, ExternalLink, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import type { UnifiedResult } from '@/lib/propertySearch';
import { shareProperties, mintShareUrlForResult, prepareCampaignListingIds, type ShareMode } from '@/lib/propertyShare';

export function PropertyShareMenu({
  results,
  iconOnly = false,
  size = 'sm',
  variant = 'outline',
  label = 'שתף',
  className,
  disabled,
  hidePublish = false,
  open,
  onOpenChange,
  hideTrigger = false,
  hideOpenPage = false,
}: {
  results: UnifiedResult[];
  iconOnly?: boolean;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'outline' | 'default' | 'ghost' | 'secondary';
  label?: string;
  className?: string;
  disabled?: boolean;
  /** Hides the "פרסום ברשתות" item (used where a dedicated campaign button already exists). */
  hidePublish?: boolean;
  /** Controlled open state — lets a parent menu item open this menu. */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** Hides the built-in trigger button (use with controlled open). */
  hideTrigger?: boolean;
  /** Hides the "פתח דף" item (used where a standalone open-page button exists). */
  hideOpenPage?: boolean;
}) {
  const navigate = useNavigate();
  const { isPartnerMode } = useAppMode();
  const { isAffiliateOnly } = useUserRole();
  const [busy, setBusy] = useState(false);
  const [recipientMode, setRecipientMode] = useState<Exclude<ShareMode, 'copy'> | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientValue, setRecipientValue] = useState('');
  const count = results.length;

  const run = async (mode: ShareMode) => {
    setBusy(true);
    try {
      await shareProperties(results, mode, recipientMode ? {
        name: recipientName,
        phone: recipientMode === 'email' ? null : recipientValue,
        email: recipientMode === 'email' ? recipientValue : null,
      } : null);
      if (mode === 'copy') toast.success(count > 1 ? 'הפרטים הועתקו' : 'הקישור הועתק');
      else toast.success('השיתוף נשלח ותועד');
      setRecipientMode(null);
      setRecipientName('');
      setRecipientValue('');
    } catch (e: any) {
      toast.error(e?.message ?? 'יצירת קישור השיתוף נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const openPage = async () => {
    if (count !== 1) return;
    setBusy(true);
    try {
      const url = await mintShareUrlForResult(results[0]);
      window.open(url, '_blank', 'width=1200,height=800,noopener,noreferrer');
      toast.success('הדף נפתח בלשונית חדשה');
    } catch (e: any) {
      toast.error(e?.message ?? 'פתיחת דף הנכס נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const publishToSocial = async () => {
    setBusy(true);
    try {
      const ids = await prepareCampaignListingIds(results);
      const params = new URLSearchParams({
        tab: 'create',
        channel: 'facebook',
        properties: ids.join(','),
        listing: ids[0],
        fresh: '1',
      });
      navigate(`${isPartnerMode || isAffiliateOnly ? '/posts' : '/campaigns'}?${params.toString()}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'הכנת הנכס לפרסום ברשתות נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          size={iconOnly ? 'icon' : size}
          variant={variant}
          disabled={disabled || busy || count === 0}
          onClick={(e) => e.stopPropagation()}
          aria-label={iconOnly ? 'שתף נכס' : undefined}
          title="שתף נכס עם מתעניין"
          className={`gap-1.5 ${iconOnly ? 'h-8 w-8' : ''} ${hideTrigger ? 'pointer-events-none absolute inset-0 !h-full !w-full opacity-0' : ''} ${className ?? ''}`}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
          {!iconOnly && <span>{count > 1 ? `${label} (${count})` : label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs">
          {count > 1 ? `שיתוף ${count} נכסים` : 'שיתוף נכס'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!hidePublish && (
          <>
            <DropdownMenuItem onSelect={() => void publishToSocial()} className="gap-2 text-sm">
              <Megaphone className="h-4 w-4" /> פרסום ברשתות
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => setRecipientMode('whatsapp')} className="gap-2 text-sm">
          <MessageCircle className="h-4 w-4" /> וואטסאפ
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setRecipientMode('sms')} className="gap-2 text-sm">
          <Smartphone className="h-4 w-4" /> SMS
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setRecipientMode('email')} className="gap-2 text-sm">
          <Mail className="h-4 w-4" /> אימייל
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('copy')} className="gap-2 text-sm">
          <Copy className="h-4 w-4" /> העתק קישור
        </DropdownMenuItem>
        {count === 1 && !hideOpenPage && (
          <DropdownMenuItem onSelect={() => void openPage()} className="gap-2 text-sm">
            <ExternalLink className="h-4 w-4" /> פתח דף
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={recipientMode !== null} onOpenChange={(open) => { if (!open) setRecipientMode(null); }}>
      <DialogContent dir="rtl" className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="text-right">פרטי מקבל/ת השיתוף</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label htmlFor="share-recipient-name">שם</Label><Input id="share-recipient-name" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="share-recipient-value">{recipientMode === 'email' ? 'אימייל' : 'טלפון'}</Label>
            <Input id="share-recipient-value" type={recipientMode === 'email' ? 'email' : 'tel'} inputMode={recipientMode === 'email' ? 'email' : 'tel'} value={recipientValue} onChange={(event) => setRecipientValue(event.target.value)} />
          </div>
        </div>
        <div className="flex flex-row items-center justify-between gap-2 pt-1">
          <Button variant="outline" onClick={() => setRecipientMode(null)}>ביטול</Button>
          <Button disabled={busy || !recipientValue.trim()} onClick={() => recipientMode && void run(recipientMode)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שליחה'}</Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
