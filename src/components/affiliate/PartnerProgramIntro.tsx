import { useState } from 'react';
import { Link, Handshake, Wallet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { usePartnerConsent } from '@/hooks/usePartnerConsent';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { useQueryClient } from '@tanstack/react-query';
import { userRolesQueryKey } from '@/hooks/useUserRole';
import { completePartnerIntro, consumePartnerIntroCompletion, partnerIntroDismissed } from '@/lib/partnerIntroPreference';

export function PartnerProgramIntro({ consentAccepted = false, onComplete, onCancel }: { consentAccepted?: boolean; onComplete: () => void; onCancel?: () => void }) {
  const { user } = useAuth();
  const { acceptTerms, isAcceptingTerms } = useAffiliateLicense();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(consentAccepted);
  const [dontShow, setDontShow] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    if (!agreed || !user || isAcceptingTerms) return;
    setError('');
    try {
      if (!consentAccepted) {
        await acceptTerms();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['partner-consent', user.id] }),
          queryClient.invalidateQueries({ queryKey: userRolesQueryKey(user.id) }),
          queryClient.invalidateQueries({ queryKey: ['affiliate-marketplace'] }),
        ]);
      }
      completePartnerIntro(user.id, dontShow);
      onComplete();
    } catch { setError('לא ניתן לשמור את האישור כרגע. אפשר לנסות שוב.'); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !isAcceptingTerms) onCancel?.(); }}>
    <DialogContent dir="rtl" className="max-w-lg text-right" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (!onCancel || isAcceptingTerms) event.preventDefault(); }}>
      <DialogHeader><DialogTitle className="text-2xl font-bold">שיווק שותפים</DialogTitle><DialogDescription className="text-base">משתפים נכסים, מביאים פניות אמיתיות ומקבלים תגמולים לפי תנאי הנכס.</DialogDescription></DialogHeader>
      <div className="space-y-5 py-2">
        {[{ icon: Link, tone: 'text-primary', title: 'משתפים קישור אישי', body: 'בוחרים נכס ומשתפים את הקישור שלכם.' }, { icon: Handshake, tone: 'text-warning', title: 'מביאים פניות אמיתיות', body: 'הפניות משויכות לשיתוף שלכם ונבדקות לפי תנאי התוכנית.' }, { icon: Wallet, tone: 'text-success', title: 'מקבלים תגמולים', body: 'תגמולים מאושרים מופיעים בארנק. עמלות תיווך זמינות רק למתווכים בעלי רישיון מאומת.' }].map(({ icon: Icon, tone, title, body }) => <div key={title} className="flex items-start gap-4"><Icon aria-hidden className={`h-12 w-12 shrink-0 ${tone}`} /><div><h3 className="text-lg font-bold">{title}</h3><p className="text-sm leading-relaxed text-muted-foreground">{body}</p></div></div>)}
      </div>
      <div className="flex items-start gap-2"><Checkbox id="partner-program-terms" checked={agreed} onCheckedChange={(value) => setAgreed(value === true)} disabled={isAcceptingTerms} /><Label htmlFor="partner-program-terms" className="leading-relaxed">קראתי ואני מסכים/ה ל<a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">תקנון השותפים</a>. אין להגיש פניות פיקטיביות או עצמיות; אין הבטחה להכנסה.</Label></div>
      <div className="flex items-center gap-2"><Checkbox id="partner-program-dismiss" checked={dontShow} onCheckedChange={(value) => setDontShow(value === true)} disabled={isAcceptingTerms} /><Label htmlFor="partner-program-dismiss">אל תציג לי שוב</Label></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><Button disabled={!agreed || isAcceptingTerms} onClick={() => void confirm()}>{isAcceptingTerms && <Loader2 className="h-4 w-4 animate-spin" />}{consentAccepted ? 'המשך' : 'אשר והסכם'}</Button>{onCancel && <Button variant="ghost" disabled={isAcceptingTerms} onClick={onCancel}>ביטול</Button>}</div>
    </DialogContent>
  </Dialog>;
}

export function PartnerPageIntroduction() {
  const { user } = useAuth();
  const consent = usePartnerConsent();
  const [closed, setClosed] = useState(() => !user || partnerIntroDismissed(user.id) || consumePartnerIntroCompletion(user.id));
  if (!user || closed || consent.isLoading || consent.isError) return null;
  return <PartnerProgramIntro consentAccepted={consent.data === true} onComplete={() => { consumePartnerIntroCompletion(user.id); setClosed(true); }} onCancel={() => setClosed(true)} />;
}