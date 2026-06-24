import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, User, MapPin, Radio, LayoutDashboard, Building2, MessageSquare } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/formatPhone';

const QUICK_LINKS = [
  { label: 'לוח בקרה', path: '/', icon: LayoutDashboard },
  { label: 'לקוחות', path: '/lead-crm', icon: User },
  { label: 'נכסים', path: '/properties', icon: Building2 },
  { label: 'תיבת הודעות', path: '/inbox', icon: MessageSquare },
  { label: 'שידור לקהילה', path: '/broadcast', icon: Radio },
];

interface SearchResult {
  id: string;
  type: 'lead' | 'listing' | 'message' | 'page';
  title: string;
  subtitle?: string;
  path: string;
}

interface GlobalSearchProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GlobalSearch({ open: openProp, onOpenChange }: GlobalSearchProps = {}) {
  const [openLocal, setOpenLocal] = useState(false);
  const open = openProp ?? openLocal;
  const setOpen = (v: boolean) => {
    setOpenLocal(v);
    onOpenChange?.(v);
  };
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const search = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const like = `%${term}%`;

      const [leadsRes, listingsRes, messagesRes] = await Promise.all([
        supabase
          .from('leads')
          .select('id, full_name, phone_number, city')
          .or(`full_name.ilike.${like},phone_number.ilike.${like},city.ilike.${like},email.ilike.${like}`)
          .limit(8),
        supabase
          .from('listings')
          .select('id, property_title, city, neighborhood, slug')
          .eq('status', 'live')
          .or(`property_title.ilike.${like},city.ilike.${like},neighborhood.ilike.${like},address.ilike.${like}`)
          .limit(6),
        supabase
          .from('messages')
          .select('id, content, lead_id, created_at')
          .ilike('content', like)
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      const leadResults: SearchResult[] = (leadsRes.data ?? []).map((v: any) => ({
        id: `lead-${v.id}`,
        type: 'lead',
        title: v.full_name || 'ללא שם',
        subtitle: `${formatPhoneDisplay(v.phone_number)}${v.city ? ` · ${v.city}` : ''}`,
        path: `/lead-crm?lead=${v.id}`,
      }));

      const listingResults: SearchResult[] = (listingsRes.data ?? []).map((l: any) => ({
        id: `listing-${l.id}`,
        type: 'listing',
        title: l.property_title,
        subtitle: [l.neighborhood, l.city].filter(Boolean).join(' · ') || undefined,
        path: l.slug ? `/p/${l.slug}` : `/properties`,
      }));

      const messageResults: SearchResult[] = (messagesRes.data ?? []).map((m: any) => ({
        id: `msg-${m.id}`,
        type: 'message',
        title: (m.content || '').slice(0, 80),
        subtitle: m.created_at ? new Date(m.created_at).toLocaleString('he-IL') : undefined,
        path: m.lead_id ? `/inbox?lead=${m.lead_id}` : '/inbox',
      }));

      const pageResults: SearchResult[] = QUICK_LINKS
        .filter((l) => l.label.includes(term))
        .map((l) => ({ id: `page-${l.path}`, type: 'page', title: l.label, path: l.path }));

      setResults([...pageResults, ...leadResults, ...listingResults, ...messageResults]);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery('');
    navigate(result.path);
  };

  const iconFor = (t: SearchResult['type']) => {
    switch (t) {
      case 'lead': return User;
      case 'listing': return Building2;
      case 'message': return MessageSquare;
      default: return LayoutDashboard;
    }
  };

  const labelFor = (t: SearchResult['type']) => {
    switch (t) {
      case 'lead': return 'מתעניין';
      case 'listing': return 'נכס';
      case 'message': return 'הודעה';
      default: return 'עמוד';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 glass-card" dir="rtl">
        <div className="flex items-center border-b border-border/50 px-4">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש מתעניינים, נכסים, או הודעות..."
            className="border-0 focus-visible:ring-0 h-12 text-base"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">ESC</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 scrollbar-thin">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="realtyz-loader h-10 w-10" />
            </div>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <div className="empty-state py-8 flex flex-col items-center">
              <Search className="h-10 w-10 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">לא נמצאו תוצאות</p>
            </div>
          )}
          {!loading && !query.trim() && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1">קיצורי דרך</p>
              {QUICK_LINKS.map((link) => (
                <button
                  key={link.path}
                  onClick={() => { setOpen(false); navigate(link.path); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors text-sm text-foreground"
                >
                  <link.icon className="h-4 w-4 text-muted-foreground" />
                  {link.label}
                </button>
              ))}
            </div>
          )}
          {results.map((result) => {
            const Icon = iconFor(result.type);
            return (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors text-right"
              >
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                  {result.subtitle && <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>}
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 shrink-0">
                  {labelFor(result.type)}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface GlobalSearchTriggerProps {
  className?: string;
}

export function GlobalSearchTrigger({ className }: GlobalSearchTriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-background hover:bg-muted/40 transition text-sm text-muted-foreground'
        }
        dir="rtl"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-right">חיפוש גלובלי — מתעניינים, נכסים, שיחות</span>
        <kbd className="hidden sm:inline-flex text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </button>
      <GlobalSearch open={open} onOpenChange={setOpen} />
    </>
  );
}
