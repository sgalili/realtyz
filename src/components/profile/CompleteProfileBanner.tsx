import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const KEY = (uid: string) => `realtyz-complete-profile-dismissed:${uid}`;

/** Gentle nudge to finish profile details; hidden once complete or dismissed. */
export function CompleteProfileBanner({ force = false }: { force?: boolean }) {
  const { user } = useAuth();
  const [missing, setMissing] = useState<string[] | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!user) return;
    try { if (!force && localStorage.getItem(KEY(user.id)) === '1') { setHidden(true); return; } } catch { /* ignore */ }
    void supabase.from('profiles').select('full_name, city, phone').eq('id', user.id).maybeSingle().then(({ data }) => {
      const m: string[] = [];
      if (!data?.full_name?.trim()) m.push('שם מלא');
      if (!data?.city?.trim()) m.push('עיר');
      if (!data?.phone?.trim()) m.push('טלפון');
      setMissing(m);
    });
  }, [user, force]);

  if (!user || hidden || !missing || (missing.length === 0 && !force)) return null;
  const dismiss = () => { try { localStorage.setItem(KEY(user.id), '1'); } catch { /* ignore */ } setHidden(true); };

  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 animate-in fade-in slide-in-from-top-2">
      <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">פרופיל מלא בונה אמון אצל קונים ושותפים</p>
        {missing.length > 0 && <p className="truncate text-muted-foreground">חסר: {missing.join(', ')}</p>}
      </div>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={dismiss} aria-label="סגירה"><X className="h-4 w-4" /></Button>
    </div>
  );
}
