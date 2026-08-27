import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { requestExtensionPagePosts, requestExtensionPostComments } from '@/lib/extensionPostBridge';

type Report = {
  ok: boolean;
  posts: number;
  images: number;
  counters: number;
  comments: number;
  since: string;
  problems: string[];
  fixes: string[];
};

const DEFAULT_SINCE = '2026-07-27';

/**
 * Manual, full Facebook history import (posts + images + counters + comment
 * trees) with an explicit in-dialog report. Every failure is explained in
 * Hebrew with exact steps to solve it — never a silent toast.
 */
export function FacebookImportDialog({ since = DEFAULT_SINCE }: { since?: string }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<string>('');
  const [report, setReport] = useState<Report | null>(null);

  const run = async () => {
    setRunning(true);
    setReport(null);
    const problems: string[] = [];
    const fixes: string[] = [];
    let posts = 0;
    let images = 0;
    let counters = 0;
    let comments = 0;

    try {
      setStep('מייבא פוסטים, תמונות ומדדים מפייסבוק…');
      const { data, error } = await supabase.functions.invoke('fb-recent-posts', {
        body: {
          since,
          lastRecords: 500,
          pageSize: 50,
          persist: true,
          sync_comments: false,
        },
      });
      if (error) {
        problems.push(`ייבוא הפוסטים נכשל: ${error.message}`);
        fixes.push('רענן את הדף ונסה שוב. אם זה חוזר, התחבר מחדש לאפליקציה.');
      } else {
        let res: any = data ?? {};
        posts = Number(res.upserted ?? res.count ?? 0) || 0;
        images = Number(res.enriched_media ?? 0) || 0;
        counters = Number(res.enriched_counters ?? 0) || 0;

        // Graph blocked us on permissions (e.g. #10 pages_read_engagement):
        // fall back silently to the browser extension's DOM scraper instead of
        // alerting the user.
        if (res.needs_extension || (res.permission_blocked && posts === 0)) {
          setStep('פייסבוק חסמה את הקריאה ישירות — מייבא דרך התוסף…');
          const scraped = await requestExtensionPagePosts({ since });
          if (scraped.length > 0) {
            const { data: extData } = await supabase.functions.invoke('fb-recent-posts', {
              body: { since, persist: true, sync_comments: false, posts: scraped },
            });
            const extRes: any = extData ?? {};
            if (Number(extRes.upserted ?? extRes.count ?? 0) > 0) {
              res = { ...extRes, permission_blocked: false, needs_extension: false, raw_error: null };
              posts = Number(extRes.upserted ?? extRes.count ?? 0) || 0;
              images = Number(extRes.enriched_media ?? 0) || 0;
              counters = Number(extRes.enriched_counters ?? 0) || 0;
            }
          }
          if (res.needs_extension || res.permission_blocked) {
            // No extension available — explain the one-time install, quietly.
            fixes.push('התקן את תוסף Realtyz לדפדפן והישאר מחובר לפייסבוק, ואז הרץ ייבוא שוב.');
            res = { ...res, raw_error: null, ok: true, permission_blocked: false, needs_extension: false };
          }
        }

        if (res.ok === false || res.raw_error) {
          const raw = res.raw_error;
          const rawText = typeof raw === 'string' ? raw : (raw?.message ?? JSON.stringify(raw ?? {}));
          if (String(rawText).includes('facebook_page_access_token_missing')) {
            problems.push('לחשבון הזה אין עמוד פייסבוק מחובר, לכן לא ניתן לייבא פוסטים.');
            fixes.push('פרופיל → חיבורים → פייסבוק ואינסטגרם → חיבור פייסבוק, ואשר את כל ההרשאות.');
          } else {
            problems.push(`פייסבוק החזירה שגיאה: ${rawText}`);
            fixes.push('ודא שאתה Admin של העמוד ושההרשאות pages_show_list ו-pages_read_engagement אושרו.');
          }
        }
        if (res.persist_error) {
          problems.push(`שמירת הפוסטים במסד נכשלה: ${res.persist_error}`);
        }
      }

      setStep('מייבא עצי תגובות ותשובות…');
      const { data: cData, error: cErr } = await supabase.functions.invoke('fb-comments-backfill', {
        body: { since, max_posts: 200 },
      });
      if (cErr) {
        problems.push(`ייבוא התגובות נכשל: ${cErr.message}`);
      } else {
        let res: any = cData ?? {};
        comments = Number(res.comments ?? 0) || 0;

        // Graph refused specific post IDs ("Unsupported get request" /
        // permission). Scrape those posts' comments via the extension and
        // re-ingest them, so the import completes instead of failing.
        const blockedIds: string[] = Array.isArray(res.extension_post_ids) ? res.extension_post_ids : [];
        if (blockedIds.length > 0) {
          setStep('פייסבוק חסמה חלק מהפוסטים — מייבא תגובות דרך התוסף…');
          const bundles = await requestExtensionPostComments(blockedIds);
          if (bundles.length > 0) {
            const { data: extData } = await supabase.functions.invoke('fb-comments-backfill', {
              body: { since, max_posts: 200, scraped_comments: bundles },
            });
            const extRes: any = extData ?? {};
            if (Number(extRes.comments ?? 0) > 0) {
              comments = Number(extRes.comments ?? 0) || comments;
              res = { ...extRes, message: null, failures: [], failed_posts: 0 };
            }
          } else {
            fixes.push('התקן את תוסף Realtyz לדפדפן והישאר מחובר לפייסבוק כדי לייבא תגובות מפוסטים חסומים.');
          }
        }

        if (res.message) problems.push(String(res.message));
        (Array.isArray(res.how_to_fix) ? res.how_to_fix : []).forEach((f: string) => fixes.push(f));
        if (Array.isArray(res.failures) && res.failures.length > 0) {
          problems.push(
            `פוסטים שנכשלו (${res.failed_posts}): ${res.failures
              .slice(0, 3)
              .map((f: any) => `${f.post_id} — ${f.error}`)
              .join(' | ')}`,
          );
        }
      }

    } catch (err: any) {
      problems.push(`הייבוא נעצר: ${err?.message ?? 'שגיאה לא ידועה'}`);
    }

    setStep('');
    setRunning(false);
    // A failed import must never be silent: force the report window open.
    if (problems.length > 0) setOpen(true);
    setReport({
      ok: problems.length === 0,
      posts,
      images,
      counters,
      comments,
      since,
      problems,
      fixes: Array.from(new Set(fixes)),
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-[12px]"
        disabled={running}
        onClick={() => {
          setOpen(true);
          void run();
        }}
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {running ? 'מייבא מפייסבוק…' : 'ייבוא מלא מפייסבוק'}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!running) setOpen(v); }}>
        <DialogContent dir="rtl" className="max-w-lg text-right">
          <DialogHeader>
            <DialogTitle className="text-right text-base">
              ייבוא היסטוריית פייסבוק מ-{new Date(since).toLocaleDateString('he-IL')}
            </DialogTitle>
            <DialogDescription className="text-right text-[13px]">
              פוסטים, תמונות, מדדי לייקים/שיתופים/צפיות ועצי תגובות כולל תשובות.
            </DialogDescription>
          </DialogHeader>

          {running ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {step || 'מייבא…'}
            </div>
          ) : report ? (
            <div className="space-y-3 text-[13px]">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['פוסטים', report.posts],
                  ['תמונות', report.images],
                  ['מדדים', report.counters],
                  ['תגובות', report.comments],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold text-foreground">{Number(value)}</p>
                  </div>
                ))}
              </div>

              <div
                className={cn(
                  'flex items-start gap-2 rounded-xl border p-3',
                  report.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                {report.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="space-y-1">
                  <p className="font-semibold">
                    {report.ok ? 'הייבוא הושלם בהצלחה' : 'הייבוא הושלם חלקית — נמצאו בעיות'}
                  </p>
                  {report.problems.map((p, i) => (
                    <p key={i} className="leading-relaxed">{p}</p>
                  ))}
                </div>
              </div>

              {report.fixes.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-card p-3">
                  <p className="mb-1 font-semibold text-foreground">איך לפתור</p>
                  <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                    {report.fixes.map((f, i) => <li key={i}>{f}</li>)}
                  </ol>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-start">
            <Button size="sm" variant="outline" disabled={running} onClick={() => void run()}>
              הרץ ייבוא שוב
            </Button>
            <Button size="sm" disabled={running} onClick={() => setOpen(false)}>
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default FacebookImportDialog;
