import { useEffect, useState } from 'react';
import { Handshake } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSetAffiliateReward, type RewardType } from '@/hooks/useAffiliate';

export function AffiliateCommissionButton({ listingId, shared }: { listingId: string; shared?: boolean }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [amount, setAmount] = useState('0');
  const save = useSetAffiliateReward();
  const { data } = useQuery({
    queryKey: ['affiliate-listing-config', listingId],
    enabled: open,
    queryFn: async () => {
      const { data: row, error } = await supabase.from('listings')
        .select('affiliate_enabled, affiliate_reward_type, affiliate_reward_amount, affiliate_tier1_amount, affiliate_tier2_amount, affiliate_tier3_type, affiliate_tier3_amount')
        .eq('id', listingId).single();
      if (error) throw error;
      return row;
    },
  });

  useEffect(() => {
    if (!data) return;
    setEnabled(Boolean(data.affiliate_enabled));
    setAmount(String(data.affiliate_reward_amount ?? 0));
  }, [data]);

  return (
    <>
      <Button
        size="icon"
        variant={shared ? 'default' : 'ghost'}
        className={`h-8 w-8 ${shared ? 'bg-success text-success-foreground hover:bg-success/90' : ''}`}
        title={shared ? 'עריכת עמלות שיווק שותפים' : 'הגדר שיווק שותפים'}
        aria-label={shared ? 'עריכת עמלות שיווק שותפים' : 'הגדר שיווק שותפים'}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <Handshake className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>שיווק שותפים ועמלה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor={`affiliate-config-${listingId}`}>פתוח לשיווק שותפים</Label>
              <Switch id={`affiliate-config-${listingId}`} checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`affiliate-amount-${listingId}`}>תגמול קבוע (₪)</Label>
              <Input id={`affiliate-amount-${listingId}`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            <Button disabled={save.isPending || !data} onClick={() => save.mutate({
              listingId,
              enabled,
              rewardType: 'fixed' as RewardType,
              rewardAmount: Number(amount) || 0,
              tier1Amount: Number(data?.affiliate_tier1_amount ?? 0),
              tier2Amount: Number(data?.affiliate_tier2_amount ?? 0),
              tier3Type: (data?.affiliate_tier3_type ?? 'fixed') as RewardType,
              tier3Amount: Number(data?.affiliate_tier3_amount ?? 0),
            }, {
              onSuccess: () => { toast.success('הגדרות השותפים נשמרו'); setOpen(false); },
              onError: () => toast.error('השמירה נכשלה'),
            })}>{save.isPending ? 'שומר...' : 'שמירה'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}