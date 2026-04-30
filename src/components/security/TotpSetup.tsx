import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ShieldCheck, QrCode, KeyRound, CheckCircle2 } from 'lucide-react';

export default function TotpSetup() {
  const queryClient = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);

  // Check if user already has MFA enrolled
  const { data: factors, isLoading } = useQuery({
    queryKey: ['mfa-factors'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data;
    },
  });

  const hasVerifiedTotp = factors?.totp?.some(f => f.status === 'verified') ?? false;

  const startEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Kalpiz Authenticator',
      });
      if (error) throw error;
      setQrUri(data.totp.qr_code);
      setFactorId(data.id);

      // Create challenge
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: data.id,
      });
      if (challengeErr) throw challengeErr;
      setChallengeId(challenge.id);
    } catch (err: any) {
      toast.error('שגיאה בהתחלת הרשמת 2FA: ' + (err?.message || ''));
      setEnrolling(false);
    }
  };

  const verifyEnroll = useMutation({
    mutationFn: async () => {
      if (!factorId || !challengeId) throw new Error('Missing factor/challenge');
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: verifyCode,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('2FA הופעל בהצלחה!');
      setEnrolling(false);
      setQrUri(null);
      setFactorId(null);
      setVerifyCode('');
      setChallengeId(null);
      queryClient.invalidateQueries({ queryKey: ['mfa-factors'] });
    },
    onError: (err: any) => toast.error('קוד שגוי: ' + (err?.message || '')),
  });

  const unenroll = useMutation({
    mutationFn: async () => {
      const verified = factors?.totp?.find(f => f.status === 'verified');
      if (!verified) throw new Error('No verified factor');
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('2FA בוטל');
      queryClient.invalidateQueries({ queryKey: ['mfa-factors'] });
    },
    onError: (err: any) => toast.error('שגיאה: ' + (err?.message || '')),
  });

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          אימות דו-שלבי (2FA)
        </CardTitle>
        <CardDescription>הגן על החשבון שלך עם קוד TOTP מאפליקציית אימות</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">טוען...</p>
        ) : hasVerifiedTotp ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">2FA פעיל</p>
                <p className="text-xs text-muted-foreground">החשבון שלך מוגן באימות דו-שלבי</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => unenroll.mutate()}
              disabled={unenroll.isPending}
              className="text-destructive hover:text-destructive"
            >
              בטל 2FA
            </Button>
          </div>
        ) : enrolling && qrUri ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground text-center">
                סרוק את קוד ה-QR באפליקציית האימות שלך (Google Authenticator / Authy)
              </p>
              <div className="rounded-lg border p-2 bg-white">
                <img src={qrUri} alt="QR Code" className="h-48 w-48" />
              </div>
            </div>
            <div className="flex items-center gap-2 max-w-xs mx-auto">
              <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="הזן קוד 6 ספרות"
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                dir="ltr"
                className="text-center font-mono text-lg tracking-widest"
                maxLength={6}
              />
            </div>
            <div className="flex justify-center gap-2">
              <Button
                onClick={() => verifyEnroll.mutate()}
                disabled={verifyCode.length !== 6 || verifyEnroll.isPending}
                size="sm"
              >
                {verifyEnroll.isPending ? 'מאמת...' : 'אמת והפעל'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setEnrolling(false); setQrUri(null); }}
              >
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-amber-600 border-amber-300">לא פעיל</Badge>
              <p className="text-sm text-muted-foreground">מומלץ להפעיל לאבטחה מקסימלית</p>
            </div>
            <Button size="sm" onClick={startEnroll} className="gap-1.5">
              <QrCode className="h-3.5 w-3.5" />
              הפעל 2FA
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
