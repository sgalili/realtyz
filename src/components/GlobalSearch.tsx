import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, User, MapPin, Radio, LayoutDashboard } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/formatPhone';

const QUICK_LINKS = [
  { label: 'לוח בקרה', path: '/', icon: LayoutDashboard },
  { label: 'ניהול מתעניינים', path: '/lead-crm', icon: User },
  { label: 'הפצת SMS', path: '/sms-blast', icon: Radio },
];

interface SearchResult {
  id: string;
  type: 'lead' | 'city' | 'page';
  title: string;
  subtitle?: string;
  path: string;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      // Search leads by name or phone
      const terms = q.trim().split(/\s+/).map(t => `'${t}'`).join(' & ');
      const { data: voters } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, city')
        .textSearch('fts', terms, { type: 'plain', config: 'simple' })
        .limit(8);

      const voterResults: SearchResult[] = (voters ?? []).map(v => ({
        id: v.id,
        type: 'lead',
        title: v.full_name || 'ללא שם',
        subtitle: `${formatPhoneDisplay(v.phone_number)}${v.city ? ` · ${v.city}` : ''}`,
        path: `/lead-crm`,
      }));

      // Quick link matches
      const pageResults: SearchResult[] = QUICK_LINKS
        .filter(l => l.label.includes(q))
        .map(l => ({
          id: l.path,
          type: 'page',
          title: l.label,
          path: l.path,
        }));

      setResults([...pageResults, ...voterResults]);
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 glass-card" dir="rtl">
        <div className="flex items-center border-b border-border/50 px-4">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="חפש מתעניין, עיר, או עמוד..."
            className="border-0 focus-visible:ring-0 h-12 text-base"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="realtyz-loader h-10 w-10" />
            </div>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <div className="empty-state py-8">
              <Search className="h-10 w-10 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">לא נמצאו תוצאות</p>
            </div>
          )}
          {!loading && !query.trim() && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1">קיצורי דרך</p>
              {QUICK_LINKS.map(link => (
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
          {results.map(result => (
            <button
              key={result.id}
              onClick={() => handleSelect(result)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors text-right"
            >
              {result.type === 'lead' ? (
                <User className="h-4 w-4 text-primary shrink-0" />
              ) : result.type === 'city' ? (
                <MapPin className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                {result.subtitle && <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
