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
import { requestExtensionPostComments } from '@/lib/extensionPostBridge';
import { syncWorkspacePagePosts } from '@/lib/extensionPageSync';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

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
  const ownerId = useActiveWorkspaceOwnerId();
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
      setStep('מסנכרן פוסטים ומדדים מעמוד הפייסבוק…');
      const sync = await syncWorkspacePagePosts({ ownerId, since, max: 10 });
      posts = sync.upserted;
      counters = sync.scraped;
      if (sync.status === 'no_extension') {
        problems.push('תוסף TORAFF לא זוהה בדפדפן.');
        fixes.push('התקן את תוסף TORAFF (גרסה 1.7.0 ומעלה), הישאר מחובר לפייסבוק, ואז הרץ ייבוא שוב.');
      } else if (sync.status === 'empty') {
        problems.push('התוסף לא מצא פוסטים בעמוד.');
        fixes.push('ודא שאתה מחובר לפייסבוק בדפדפן הזה ושיש לך גישה לעמוד, ואז נסה שוב.');
      } else if (sync.status === 'timeout') {
        problems.push('הסנכרון לא הושלם בזמן. נסה שוב.');
      } else if (sync.status === 'error') {
        problems.push(`שמירת הפוסטים נכשלה: ${sync.error}`);
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
            fixes.push('התקן את תוסף TORAFF לדפדפן והישאר מחובר לפייסבוק כדי לייבא תגובות מפוסטים חסומים.');
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
