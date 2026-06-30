import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink, Facebook } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

type FbPost = {
  id: string | null;
  fb_post_id: string | null;
  text: string;
  created_at: string | null;
  status: string | null;
  url: string | null;
  media: string[];
};

const formatDate = (iso: string | null) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
};

export const FacebookRecentPostsPanel = () => {
  const [posts, setPosts] = useState<FbPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('fb-recent-posts', {
        body: { lastRecords: 20 },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error || 'fetch failed');
      setPosts(((data as any).posts ?? []) as FbPost[]);
    } catch (e: any) {
      setError(e?.message ?? 'שגיאה בטעינת פוסטים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Card dir="rtl" className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Facebook className="h-4 w-4 text-blue-600" />
          פוסטים אחרונים מעמוד הפייסבוק
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && posts.length === 0 && (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && posts.length === 0 && (
          <p className="text-sm text-muted-foreground">לא נמצאו פוסטים אחרונים.</p>
        )}
        {posts.map((p) => (
          <div key={p.id ?? p.fb_post_id ?? Math.random()}
               className="flex gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent/40 transition-colors">
            {p.media?.[0] ? (
              <img src={p.media[0]} alt=""
                   className="h-20 w-20 shrink-0 rounded object-cover" loading="lazy" />
            ) : (
              <div className="h-20 w-20 shrink-0 rounded bg-muted flex items-center justify-center">
                <Facebook className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs text-muted-foreground">{formatDate(p.created_at)}</span>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer"
                     className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    פתח <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap line-clamp-4">{p.text}</p>
              {p.media && p.media.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1">+{p.media.length - 1} תמונות נוספות</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default FacebookRecentPostsPanel;
