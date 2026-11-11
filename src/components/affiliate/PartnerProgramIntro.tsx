import { useState } from 'react';
import { Link as LinkIcon, Handshake, Wallet, Loader2, Building2, Home, BadgeCheck, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { usePartnerConsent } from '@/hooks/usePartnerConsent';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { useAccountIdentity } from '@/hooks/useAccountIdentity';
import { usePersonalLanguage } from '@/i18n/personalLanguage';
import { useQueryClient } from '@tanstack/react-query';
import { userRolesQueryKey } from '@/hooks/useUserRole';
import { readPostSignupWelcome } from '@/lib/signupRole';
import { completePartnerIntro, consumePartnerIntroCompletion } from '@/lib/partnerIntroPreference';

export type PartnerAudience = 'broker' | 'developer' | 'owner';
export const partnerAudience = (label?: string | null): PartnerAudience =>
  label?.includes('מתווך') ? 'broker' : label && /יזם|קבלן/.test(label) ? 'developer' : 'owner';

const INTRO: Record<PartnerAudience, { icon: typeof Home; title: string; body: string }> = {
  broker: { icon: BadgeCheck, title: 'כמתווך, אתה מרוויח פעמיים', body: 'משווקים גם נכסים של מתווכים אחרים, מקבלים תגמול על כל פנייה מאושרת וזכאים לעמלת סגירה בעסקאות.' },
  developer: { icon: Building2, title: 'שווקו גם פרויקטים של אחרים', body: 'כשותפים תוכלו לשתף נכסים ופרויקטים מהלוח ולקבל תגמול על כל פנייה מאושרת שהבאתם.' },
  owner: { icon: Home, title: 'הופכים קישור לתגמול', body: 'משתפים נכסים מהלוח עם חברים ובקבוצות, ומקבלים תגמול על כל פנייה אמיתית שמאושרת.' },
};

const STEPS = [
  { icon: LinkIcon, bg: 'bg-primary/15', tone: 'text-primary', title: 'משתפים קישור אישי', body: 'בוחרים נכס ומשתפים את הקישור שלכם.' },
  { icon: Megaphone, bg: 'bg-warning/15', tone: 'text-warning', title: 'מביאים פניות אמיתיות', body: 'כל פנייה משויכת לשיתוף שלכם ונבדקת.' },
  { icon: Wallet, bg: 'bg-success/15', tone: 'text-success', title: 'מקבלים תגמולים', body: 'תגמולים מאושרים נכנסים לארנק.' },
];

export function PartnerProgramIntro({ consentAccepted = false, onComplete, onCancel }: { consentAccepted?: boolean; onComplete: () => void; onCancel?: () => void }) {
  const { user } = useAuth();
  const identity = useAccountIdentity();
  const { gender } = usePersonalLanguage();
  const audience = partnerAudience(identity?.label);
  const { acceptTerms, isAcceptingTerms } = useAffiliateLicense();
  const queryClient = useQueryClient();
  const consents = [
    { id: 'terms', label: <>קראתי ואני {gender === 'female' ? 'מסכימה' : 'מסכים'} ל<a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">תקנון האתר</a></> },
    { id: 'privacy', label: <>ל<a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">מדיניות הפרטיות</a></> },
    { id: 'commission', label: <>למנגנון העמלות: תגמול נקבע לפי תנאי הנכס ברגע הבחירה בו ומשולם רק לאחר אישור הפנייה</> },
    ...(audience === 'broker' ? [{ id: 'brokerage', label: <>לתנאי התיווך: בעסקה שנסגרה 80% מהעמלה למתווך ו־20% ל־TORAFF</> }] : []),
  ];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const agreed = consentAccepted || consents.every(c => checked[c.id]);
  const [error, setError] = useState('');
  const intro = INTRO[audience];
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
      completePartnerIntro(user.id, true);
      onComplete();
    } catch { setError('לא ניתן לשמור את האישור כרגע. אפשר לנסות שוב.'); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !isAcceptingTerms) onCancel?.(); }}>
    <DialogContent dir="rtl" className="max-h-[90dvh] max-w-lg overflow-y-auto text-right" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (!onCancel || isAcceptingTerms) event.preventDefault(); }}>
      <DialogHeader className="items-center text-center">
        <span className="mb-1 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-success text-primary-foreground shadow-lg"><Handshake aria-hidden className="h-9 w-9" /></span>
        <DialogTitle className="text-2xl font-bold">הצטרפות לרשת השותפים</DialogTitle>
        <DialogDescription className="text-base">{intro.title}</DialogDescription>
      </DialogHeader>
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3"><intro.icon aria-hidden className="h-8 w-8 shrink-0 text-primary" /><p className="text-sm leading-relaxed">{intro.body}</p></div>
      <div className="grid grid-cols-3 gap-2">
        {STEPS.map(({ icon: Icon, bg, tone, title, body }) => <div key={title} className="flex flex-col items-center gap-1.5 text-center"><span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${bg}`}><Icon aria-hidden className={`h-8 w-8 ${tone}`} /></span><h3 className="text-sm font-bold leading-tight">{title}</h3><p className="text-xs leading-snug text-muted-foreground">{body}</p></div>)}
      </div>
      {!consentAccepted && <div className="space-y-2.5 rounded-xl border bg-muted/40 p-3">
        {consents.map(c => <div key={c.id} className="flex items-start gap-2"><Checkbox id={`partner-consent-${c.id}`} checked={!!checked[c.id]} onCheckedChange={(v) => setChecked(s => ({ ...s, [c.id]: v === true }))} disabled={isAcceptingTerms} /><Label htmlFor={`partner-consent-${c.id}`} className="text-sm font-normal leading-relaxed">{c.label}</Label></div>)}
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-between gap-2"><Button disabled={!agreed || isAcceptingTerms} onClick={() => void confirm()}>{isAcceptingTerms && <Loader2 className="h-4 w-4 animate-spin" />}{consentAccepted ? 'המשך' : 'הצטרפות לרשת השותפים'}</Button>{onCancel && <Button variant="outline" disabled={isAcceptingTerms} onClick={onCancel}>ביטול</Button>}</div>
    </DialogContent>
  </Dialog>;
}

/** Partner-page entry: shown only until the account has accepted the current partner terms. */
export function PartnerPageIntroduction() {
  const { user } = useAuth();
  const consent = usePartnerConsent();
  const [closed, setClosed] = useState(() => !user || consumePartnerIntroCompletion(user.id));
  if (!user || closed || readPostSignupWelcome() || consent.isLoading || consent.isError || consent.data === true) return null;
  return <PartnerProgramIntro onComplete={() => { consumePartnerIntroCompletion(user.id); setClosed(true); }} onCancel={() => setClosed(true)} />;
}
