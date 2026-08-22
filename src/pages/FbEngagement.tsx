import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, RefreshCw, ExternalLink, Sparkles, Send, Bot, UserCheck } from 'lucide-react';

type Mode = 'hitl' | 'pilot';

const POST_URL = 'https://www.facebook.com/story.php?story_fbid=122135406987020860&id=61580625810292';

interface CommentRow {
  id: string;
  ayr_comment_id: string;
  author_name: string | null;
  comment_text: string;
  likes_count: number;
  shares_count: number;
  posted_at: string | null;
  status: string;
  is_historical_replied: boolean;
  historical_reply_text: string | null;
}
interface DraftRow {
  id: string;
  comment_id: string;
  draft_index: number;
  draft_text: string;
  is_simulation: boolean;
}

export default function FbEngagement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [injAuthor, setInjAuthor] = useState('');
  const [injText, setInjText] = useState('');
  const [injecting, setInjecting] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'live' | 'fallback' | null>(null);

  // Mode
  const { data: modeRow } = useQuery({
    queryKey: ['fb_eng_mode', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('fb_engagement_settings')
        .select('mode')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
  });
  const mode: Mode = (modeRow?.mode as Mode) || 'hitl';

  const setMode = useMutation({
    mutationFn: async (m: Mode) => {
      await supabase.from('fb_engagement_settings').upsert({
        user_id: user!.id, mode: m, updated_at: new Date().toISOString(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fb_eng_mode'] }),
  });

  // Comments
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['fb_comments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fb_comments')
        .select('*')
        .order('posted_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as CommentRow[];
    },
    refetchInterval: 60_000,
  });

  // Drafts
  const { data: drafts = [] } = useQuery({
    queryKey: ['fb_drafts', comments.map((c) => c.id).join(',')],
    enabled: comments.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('fb_comment_drafts')
        .select('*')
        .in('comment_id', comments.map((c) => c.id));
      return (data || []) as DraftRow[];
    },
  });

  const draftsByComment = useMemo(() => {
    const m: Record<string, DraftRow[]> = {};
    for (const d of drafts) (m[d.comment_id] ||= []).push(d);
    for (const k in m) m[k].sort((a, b) => a.draft_index - b.draft_index);
    return m;
  }, [drafts]);

  const fetchComments = async () => {
    setBusyId('FETCH');
    toast.dismiss();
    try {
      const { data, error } = await supabase.functions.invoke('meta-comments-sync', {
        body: { action: 'sync' },
      });
      if (error) throw error;
      if (data?.success === false) {
        toast.warning(data.message || data.error || 'לא נסרקו תגובות');
        setLiveStatus(null);
      } else {
        toast.success(`נסרקו ${data?.comments ?? 0} תגובות מפייסבוק`);
        setLiveStatus('live');
      }
      await qc.invalidateQueries({ queryKey: ['fb_comments'] });
    } catch (e: any) {
      toast.error(e?.message || 'שגיאה בסריקה');
      setLiveStatus(null);
    } finally { setBusyId(null); }
  };

  const generateDrafts = async (commentId: string, isSim = false) => {
    setBusyId(commentId + (isSim ? ':sim' : ''));
    try {
      const { data, error } = await supabase.functions.invoke('fb-engagement-draft', {
        body: { comment_id: commentId, is_simulation: isSim },
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['fb_drafts'] });
      qc.invalidateQueries({ queryKey: ['fb_comments'] });
    } catch (e: any) {
      toast.error(e?.message || 'שגיאה בהפקת טיוטות');
    } finally { setBusyId(null); }
  };

  const sendReply = async (commentId: string, text: string) => {
    if (!text.trim()) return toast.error('הטיוטה ריקה');
    setBusyId(commentId + ':send');
    try {
      const { data, error } = await supabase.functions.invoke('meta-comments-sync', {
        body: { action: 'reply', comment_id: commentId, text, mode },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || 'פרסום התגובה נכשל');
      toast.success('התשובה נשלחה ל-Facebook ונשמרה לבסיס הידע');
      setEditing((p) => { const n = { ...p }; delete n[commentId]; return n; });
      qc.invalidateQueries({ queryKey: ['fb_comments'] });
    } catch (e: any) {
      toast.error(e?.message || 'שגיאה בשליחה');
    } finally { setBusyId(null); }
  };

  const injectComment = async () => {
    const author = injAuthor.trim();
    const text = injText.trim();
    if (!author || !text) {
      toast.error('יש למלא שם ותגובה');
      return;
    }
    setInjecting(true);
    try {
      const { data: post, error: postErr } = await supabase
        .from('fb_engagement_posts')
        .select('id')
        .eq('fb_post_id', '122135406987020860')
        .maybeSingle();
      if (postErr || !post) throw new Error('הפוסט המנוטר לא נמצא');
      const id = Date.now().toString();
      const { error } = await supabase.from('fb_comments').insert({
        post_id: post.id,
        ayr_comment_id: `injected_${id}`,
        author_name: author,
        comment_text: text,
        likes_count: 0,
        shares_count: 0,
        posted_at: new Date().toISOString(),
        is_historical_replied: false,
        status: 'new',
        raw: { source: 'live_injector', injected_at: new Date().toISOString() },
        fetched_at: new Date().toISOString(),
      });
      if (error) throw error;
      setInjAuthor('');
      setInjText('');
      toast.success('התגובה הוזרקה למערכת');
      qc.invalidateQueries({ queryKey: ['fb_comments'] });
    } catch (e: any) {
      toast.error(e?.message || 'שגיאה בהזרקת תגובה');
    } finally {
      setInjecting(false);
    }
  };

  // Pilot mode: auto-pick draft #1 (warm/personal) when drafts arrive
  useEffect(() => {
    if (mode !== 'pilot') return;
    const targets = comments.filter((c) => c.status === 'drafted');
    for (const c of targets) {
      const ds = draftsByComment[c.id]?.filter((d) => !d.is_simulation);
      if (ds && ds.length > 0) {
        sendReply(c.id, ds[0].draft_text);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, drafts]);

  const liveComments = comments.filter((c) => !c.is_historical_replied && c.status !== 'replied' && c.status !== 'skipped');
  const repliedNow = comments.filter((c) => c.status === 'replied');
  const historical = comments.filter((c) => c.is_historical_replied);

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facebook Engagement Console</h1>
          <a className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline" href={POST_URL} target="_blank" rel="noreferrer">
            הפוסט המנוטר <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-border bg-card p-1 flex">
            <Button
              size="sm"
              variant={mode === 'hitl' ? 'default' : 'ghost'}
              onClick={() => setMode.mutate('hitl')}
              className="gap-1"
            >
              <UserCheck className="h-4 w-4" /> HITL
            </Button>
            <Button
              size="sm"
              variant={mode === 'pilot' ? 'default' : 'ghost'}
              onClick={() => setMode.mutate('pilot')}
              className="gap-1"
            >
              <Bot className="h-4 w-4" /> AI Pilot
            </Button>
          </div>
          <Button onClick={fetchComments} disabled={busyId === 'FETCH'} size="sm" variant="outline" className="gap-1">
            {busyId === 'FETCH' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            רענן
          </Button>
          {liveStatus === 'live' && (
            <Badge className="bg-green-600 text-white hover:bg-green-700 animate-pulse gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-200 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-100"></span>
              </span>
              מחובר ל-פייסבוק לייב
            </Badge>
          )}
          {liveStatus === 'fallback' && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-300 gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500"></span>
              מצב סימולציה מקומי
            </Badge>
          )}
        </div>
      </div>

      {mode === 'pilot' && (
        <div className="rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm">
          מצב <b>AI Pilot</b> פעיל: טיוטות מאושרות ונשלחות אוטומטית. עברו ל-HITL כדי לסנן ידנית.
        </div>
      )}

      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">הזרקת תגובה חיה לבדיקת מוח ה-AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            value={injAuthor}
            onChange={(e) => setInjAuthor(e.target.value)}
            placeholder="שם המגיב (למשל: ישראל ישראלי)"
            dir="rtl"
            maxLength={120}
          />
          <Textarea
            value={injText}
            onChange={(e) => setInjText(e.target.value)}
            placeholder="תוכן התגובה כפי שהיה מופיע בפייסבוק"
            dir="rtl"
            rows={3}
            maxLength={1000}
          />
          <div className="flex justify-end">
            <Button onClick={injectComment} disabled={injecting} size="sm" className="gap-1">
              {injecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              הזרק תגובה למערכת
            </Button>
          </div>
        </CardContent>
      </Card>


      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>
      )}

      {!isLoading && comments.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          אין תגובות עדיין. לחץ "רענן" כדי למשוך מהפייסבוק.
        </CardContent></Card>
      )}

      {/* Live */}
      {liveComments.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">תגובות חיות ({liveComments.length})</h2>
          {liveComments.map((c) => (
            <LiveCommentCard
              key={c.id}
              comment={c}
              drafts={(draftsByComment[c.id] || []).filter((d) => !d.is_simulation)}
              editing={editing[c.id]}
              setEditing={(t) => setEditing((p) => ({ ...p, [c.id]: t }))}
              busyId={busyId}
              onGenerate={() => generateDrafts(c.id, false)}
              onSend={(t) => sendReply(c.id, t)}
              mode={mode}
            />
          ))}
        </section>
      )}

      {/* Replied this session */}
      {repliedNow.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">נענו במהלך הסשן ({repliedNow.length})</h2>
          {repliedNow.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{c.author_name || 'גולש'}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{c.comment_text}</CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* Historical simulation */}
      {historical.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">אימון סימולציה: מה מוח ה-AI היה עונה כשאודי ויטמן מנהל את השיחה</h2>
          <p className="text-sm text-muted-foreground">קלפי אימון בלבד. לא מבוצעת כתיבה חזרה ל-Facebook.</p>
          {historical.map((c) => (
            <HistoricalSimCard
              key={c.id}
              comment={c}
              drafts={(draftsByComment[c.id] || []).filter((d) => d.is_simulation)}
              busy={busyId === c.id + ':sim'}
              onGenerate={() => generateDrafts(c.id, true)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function LiveCommentCard({
  comment, drafts, editing, setEditing, busyId, onGenerate, onSend, mode,
}: {
  comment: CommentRow; drafts: DraftRow[]; editing: string | undefined;
  setEditing: (t: string) => void; busyId: string | null;
  onGenerate: () => void; onSend: (t: string) => void; mode: Mode;
}) {
  const busy = busyId === comment.id;
  const sending = busyId === comment.id + ':send';

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm">{comment.author_name || 'גולש'}</CardTitle>
          <div className="text-xs text-muted-foreground mt-0.5">
            {comment.posted_at && new Date(comment.posted_at).toLocaleString('he-IL')}
            {' · '}לייקים: {comment.likes_count}
            {comment.shares_count ? ` · שיתופים: ${comment.shares_count}` : ''}
          </div>
        </div>
        <Badge variant="outline">{comment.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm bg-muted/50 rounded-md p-3 whitespace-pre-wrap">{comment.comment_text}</p>

        {drafts.length === 0 ? (
          <Button onClick={onGenerate} disabled={busy} size="sm" className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            הפק 3 טיוטות
          </Button>
        ) : (
          <div className="grid gap-2 md:grid-cols-3">
            {drafts.map((d, i) => {
              const label = ['חמה', 'ענייני', 'שנון'][i] || `גרסה ${i + 1}`;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setEditing(d.draft_text)}
                  className="text-right rounded-lg border border-border p-3 hover:border-primary hover:bg-accent/40 transition text-sm"
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
                  <div className="whitespace-pre-wrap">{d.draft_text}</div>
                </button>
              );
            })}
          </div>
        )}

        {editing !== undefined && (
          <div className="space-y-2 border-t border-border pt-3">
            <Textarea
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              rows={3}
              dir="rtl"
              className="text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setEditing('')}>נקה</Button>
              <Button size="sm" onClick={() => onSend(editing)} disabled={sending} className="gap-1">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                שלח ל-Facebook {mode === 'pilot' && '(Pilot)'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistoricalSimCard({
  comment, drafts, busy, onGenerate,
}: { comment: CommentRow; drafts: DraftRow[]; busy: boolean; onGenerate: () => void; }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{comment.author_name || 'גולש'}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground mb-1">התגובה המקורית</div>
          <p className="bg-muted/50 rounded-md p-3 whitespace-pre-wrap">{comment.comment_text}</p>
        </div>
        {comment.historical_reply_text && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px]">מקורי · Facebook</Badge>
              <span className="text-xs text-muted-foreground">התשובה המקורית של אודי בפייסבוק:</span>
            </div>
            <p className="bg-primary/5 rounded-md p-3 whitespace-pre-wrap border border-primary/10">{comment.historical_reply_text}</p>
          </div>
        )}
        {drafts.length > 0 && (
          <div className="text-xs text-muted-foreground -mb-1">חלופת AI לצורך כיול ולמידה (קריאה בלבד · לא נשלח לפייסבוק):</div>
        )}
        {drafts.length === 0 ? (
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={busy} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            הצג סימולציה של AI
          </Button>
        ) : (
          <div className="grid gap-2 md:grid-cols-3">
            {drafts.map((d, i) => (
              <div key={d.id} className="rounded-lg border border-dashed border-border p-3 text-sm">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                  AI · {['חמה', 'ענייני', 'שנון'][i] || `גרסה ${i + 1}`}
                </div>
                <div className="whitespace-pre-wrap">{d.draft_text}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
