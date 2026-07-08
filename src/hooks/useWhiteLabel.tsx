import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';

export interface WhiteLabelSettings {
  id?: string;
  user_id?: string;
  agency_name: string | null;
  logo_url: string | null;
  primary_color: string | null; // HSL triplet "H S% L%"
  primary_foreground_color: string | null;
  hide_kalpiz_branding: boolean;
}

interface WhiteLabelContextValue {
  settings: WhiteLabelSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const WhiteLabelContext = createContext<WhiteLabelContextValue>({
  settings: null,
  loading: true,
  refresh: async () => {},
});

/** Convert "#RRGGBB" → "H S% L%" tailwind-token form */
export function hexToHslTriplet(hex: string): string | null {
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let H = 0, S = 0;
  const L = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    S = L > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: H = (g - b) / d + (g < b ? 6 : 0); break;
      case g: H = (b - r) / d + 2; break;
      case b: H = (r - g) / d + 4; break;
    }
    H *= 60;
  }
  return `${Math.round(H)} ${Math.round(S * 100)}% ${Math.round(L * 100)}%`;
}

/** Pick black or white foreground based on luminance of an HSL triplet "H S% L%" */
export function pickForegroundForHsl(hsl: string): string {
  const m = hsl.match(/(\d+)\s+\d+%\s+(\d+)%/);
  if (!m) return '0 0% 100%';
  const L = Number(m[2]);
  return L > 55 ? '222 39% 14%' : '0 0% 100%';
}

function applyTheme(s: WhiteLabelSettings | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (s?.primary_color) {
    root.style.setProperty('--primary', s.primary_color);
    root.style.setProperty(
      '--primary-foreground',
      s.primary_foreground_color || pickForegroundForHsl(s.primary_color),
    );
    // Glow ≈ slightly lighter version
    const m = s.primary_color.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
    if (m) {
      const H = m[1], S = m[2], L = Math.min(100, Number(m[3]) + 10);
      root.style.setProperty('--primary-glow', `${H} ${S}% ${L}%`);
    }
  } else {
    root.style.removeProperty('--primary');
    root.style.removeProperty('--primary-foreground');
    root.style.removeProperty('--primary-glow');
  }
}

export const WhiteLabelProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<WhiteLabelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Workspace-first branding: tenants/managers should see the owner's
      // shared office details, not their personal empty branding row.
      const { data: { user } } = await supabase.auth.getUser();
      let row: any = null;
      const ownerId = activeWorkspaceId ?? user?.id ?? null;
      if (ownerId) {
        const { data: workspaceBrand } = await supabase
          .from('white_label_settings')
          .select('*')
          .eq('user_id', ownerId)
          .maybeSingle();
        row = workspaceBrand;
      }
      if (!row && activeWorkspace) {
        row = {
          user_id: activeWorkspace.workspace_owner_id,
          agency_name: activeWorkspace.workspace_name,
          logo_url: activeWorkspace.workspace_logo_url,
          primary_color: null,
          primary_foreground_color: null,
          hide_kalpiz_branding: false,
        };
      }
      if (!row) {
        const { data: any } = await supabase
          .from('white_label_settings')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1);
        row = any?.[0] ?? null;
      }
      setSettings(row);
      applyTheme(row);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[white-label] load failed', e);
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, activeWorkspace]);

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { load(); });
    return () => { sub.subscription.unsubscribe(); };
  }, [load]);

  const value = useMemo(() => ({ settings, loading, refresh: load }), [settings, loading, load]);
  return <WhiteLabelContext.Provider value={value}>{children}</WhiteLabelContext.Provider>;
};

export const useWhiteLabel = () => useContext(WhiteLabelContext);
