import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Sparkles, UserCog } from 'lucide-react';
import { toast } from 'sonner';

type Tone = 'professional' | 'friendly' | 'urgent' | 'conservative' | 'custom';

interface PersonaRow {
  id: string;
  user_id: string;
  tone: Tone;
  tone_custom: string | null;
  professional_bio: string | null;
  selling_philosophy: string | null;
  signature: string | null;
  language: string;
}

const TONE_OPTIONS: { value: Tone; label: string; hint: string }[] = [
  { value: 'professional', label: 'Professional · מקצועי', hint: 'ענייני, מדויק, מנוסח בקפדנות' },
  { value: 'friendly',     label: 'Friendly · ידידותי',    hint: 'חמים, אישי, נגיש' },
  { value: 'urgent',       label: 'Urgent · דחוף',         hint: 'ישיר, ממוקד פעולה, קצר' },
  { value: 'conservative', label: 'Conservative · שמרני',  hint: 'מאופק, רשמי, נמנע מהבטחות' },
  { value: 'custom',       label: 'Custom · מותאם אישית',  hint: 'הגדר/י את הטון במילים שלך' },
];

/**
 * Virtual Twin persona builder.
 * Each agent stores tone + bio + selling philosophy. The AI agent reads
 * this row before drafting any message and aligns its voice accordingly.
 */
export function AgentPersonaPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: persona, isLoading } = useQuery({
    queryKey: ['agent-persona', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_personas')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as PersonaRow | null;
    },
  });

  const [tone, setTone] = useState<Tone>('professional');
  const [toneCustom, setToneCustom] = useState('');
  const [bio, setBio] = useState('');
  const [philosophy, setPhilosophy] = useState('');
  const [signature, setSignature] = useState('');

  useEffect(() => {
    if (persona) {
      setTone(persona.tone);
      setToneCustom(persona.tone_custom ?? '');
      setBio(persona.professional_bio ?? '');
      setPhilosophy(persona.selling_philosophy ?? '');
      setSignature(persona.signature ?? '');
    }
  }, [persona]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const payload = {
        user_id: user.id,
        tone,
        tone_custom: tone === 'custom' ? toneCustom.trim() || null : null,
        professional_bio: bio.trim() || null,
        selling_philosophy: philosophy.trim() || null,
        signature: signature.trim() || null,
      };
      const { error } = await supabase
        .from('agent_personas')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('פרופיל ה-Virtual Twin נשמר. ה-AI יישר קו עם הסגנון שלך.');
      qc.invalidateQueries({ queryKey: ['agent-persona', user?.id] });
    },
    onError: (e: any) => toast.error(e?.message || 'שמירה נכשלה'),
  });

  const activeTone = TONE_OPTIONS.find((t) => t.value === tone);

  return (
    <Card dir="rtl" className="border-primary/20">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="h-4 w-4 text-primary" />
          Virtual Twin · התאומה הדיגיטלית שלך
        </CardTitle>
        <CardDescription className="text-xs">
          ה-AI ילמד את הטון, הביוגרפיה והפילוסופיה שלך, וישתמש בהם בכל ניסוח של הודעה ללקוח.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען פרופיל...
          </div>
        ) : (
          <>
            {/* Tone */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">טון תקשורת</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col text-right">
                        <span className="text-sm font-medium">{opt.label}</span>
                        <span className="text-[11px] text-muted-foreground">{opt.hint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeTone && tone !== 'custom' && (
                <p className="text-[11px] text-muted-foreground">{activeTone.hint}</p>
              )}
              {tone === 'custom' && (
                <Input
                  value={toneCustom}
                  onChange={(e) => setToneCustom(e.target.value)}
                  placeholder='לדוגמה: "אנליטי וישיר, עם הומור יבש"'
                  className="h-11"
                />
              )}
            </div>

            {/* Bio */}
            <div className="grid gap-1.5">
              <Label htmlFor="vt-bio" className="text-xs font-semibold">ביו מקצועית</Label>
              <Textarea
                id="vt-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="קצת עליי כסוכן/ת — שנות ניסיון, אזורי התמחות, הסמכות..."
                className="min-h-[100px] text-sm"
                maxLength={1500}
              />
              <p className="text-[10px] text-muted-foreground text-left">{bio.length}/1500</p>
            </div>

            {/* Selling philosophy */}
            <div className="grid gap-1.5">
              <Label htmlFor="vt-philosophy" className="text-xs font-semibold">פילוסופיית מכירה</Label>
              <Textarea
                id="vt-philosophy"
                value={philosophy}
                onChange={(e) => setPhilosophy(e.target.value)}
                placeholder='לדוגמה: "אני מתמחה בנכסי השקעה" או "אני שם משפחות במרכז"'
                className="min-h-[80px] text-sm"
                maxLength={1000}
              />
              <p className="text-[10px] text-muted-foreground text-left">{philosophy.length}/1000</p>
            </div>

            {/* Signature */}
            <div className="grid gap-1.5">
              <Label htmlFor="vt-signature" className="text-xs font-semibold">חתימה (אופציונלי)</Label>
              <Input
                id="vt-signature"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="— דנה כהן, סוכנת נדל&quot;ן Realtyz"
                className="h-11"
                maxLength={200}
              />
            </div>

            {(bio || philosophy) && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-[12px] leading-relaxed">
                <Badge variant="outline" className="gap-1 border-primary/40 text-primary mb-2">
                  <Sparkles className="h-3 w-3" /> תצוגת הזרקה ל-AI
                </Badge>
                <pre className="whitespace-pre-wrap font-sans text-[12px] text-foreground/80">
{`Tone: ${tone === 'custom' ? toneCustom || '—' : activeTone?.label}
Bio: ${bio || '—'}
Philosophy: ${philosophy || '—'}${signature ? `\nSignature: ${signature}` : ''}`}
                </pre>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="h-11 gap-1.5"
              >
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                שמור Virtual Twin
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default AgentPersonaPanel;
