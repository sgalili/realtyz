import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const KEY = (uid: string) => `realtyz-complete-profile-dismissed:${uid}`;
type CompletionProfile = { full_name: string | null; city: string | null; phone: string | null };
export type ProfileSavedDetail = { profileOwnerId: string; profile: CompletionProfile };

function missingFields(profile: CompletionProfile): string[] {
  return (['full_name', 'city', 'phone'] as const)
    .filter(field => !profile[field]?.trim())
    .map(field => ({ full_name: 'שם מלא', city: 'עיר', phone: 'טלפון' })[field]);
}

/** Gentle nudge to finish profile details; hidden once complete or dismissed. */
export function CompleteProfileBanner({ force = false, profileOwnerId }: { force?: boolean; profileOwnerId?: string | null }) {
  const { user } = useAuth();
  const ownerId = profileOwnerId === undefined ? user?.id : profileOwnerId;
  const scope = user && ownerId ? `${user.id}:${ownerId}` : null;
  const [completion, setCompletion] = useState<{ scope: string; missing: string[] } | null>(null);
  const [dismissedScope, setDismissedScope] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !ownerId || !scope) return;
    let alive = true;
    let version = 0;
    setCompletion(null);
    setDismissedScope(null);
    try { if (!force && localStorage.getItem(KEY(scope)) === '1') setDismissedScope(scope); } catch { /* ignore */ }
    const refresh = async () => {
      const request = ++version;
      try {
        const { data, error } = await supabase.from('profiles').select('full_name, city, phone').eq('id', ownerId).maybeSingle();
        if (!alive || request !== version) return;
        // Unavailable records are not evidence that required fields are empty.
        setCompletion(!error && data ? { scope, missing: missingFields(data) } : null);
      } catch {
        if (alive && request === version) setCompletion(null);
      }
    };
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<ProfileSavedDetail>).detail;
      if (detail && detail.profileOwnerId !== ownerId) return;
      if (detail?.profile) {
        ++version;
        setCompletion({ scope, missing: missingFields(detail.profile) });
      }
      void refresh();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    refresh();
    window.addEventListener('realtyz:profile-saved', onSaved);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(onVisible, 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('realtyz:profile-saved', onSaved);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id, ownerId, scope, force]);

  if (!scope || dismissedScope === scope || completion?.scope !== scope || completion.missing.length === 0) return null;
  const missing = completion.missing;
  const dismiss = () => { try { localStorage.setItem(KEY(scope), '1'); } catch { /* ignore */ } setDismissedScope(scope); };

  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 animate-in fade-in slide-in-from-top-2">
      <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">פרופיל מלא בונה אמון אצל קונים ושותפים</p>
        <p className="break-words text-muted-foreground">חסר: {missing.join(', ')}</p>
      </div>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={dismiss} aria-label="סגירה"><X className="h-4 w-4" /></Button>
    </div>
  );
}
