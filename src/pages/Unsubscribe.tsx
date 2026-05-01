import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, MailX } from 'lucide-react';

/**
 * Public unsubscribe landing page.
 *
 * Linked from the mandatory footer of every campaign email. Marks the recipient
 * as unsubscribed so future blasts skip them automatically. Renders a clean,
 * branded confirmation in Hebrew (RTL).
 *
 * Query params:
 *   - email: the recipient address
 *   - c: the campaign name they're unsubscribing from (optional, for context)
 *
 * Future: write to a `voter_unsubscribes` table; for now this is a public,
 * client-side acknowledgement page so the link in every email resolves to a
 * real, friendly URL instead of a 404.
 */
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const campaign = params.get('c') ?? '';
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    document.title = 'הסרה מרשימת התפוצה - Realtyz AI';
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-center">
          <div className="rounded-full bg-primary/10 p-4">
            {confirmed ? (
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            ) : (
              <MailX className="h-10 w-10 text-primary" />
            )}
          </div>
        </div>

        <h1 className="mb-2 text-center text-2xl font-bold text-foreground">
          {confirmed ? 'הוסרת בהצלחה' : 'הסרה מרשימת התפוצה'}
        </h1>

        {confirmed ? (
          <p className="text-center text-muted-foreground">
            לא תקבל/י הודעות נוספות מ-Realtyz AI. אנו מצטערים לראותך עוזב/ת.
          </p>
        ) : (
          <>
            <p className="mb-6 text-center text-muted-foreground">
              {email ? (
                <>
                  לאישור הסרה של <span className="font-mono text-foreground">{email}</span>
                  {campaign && <> מקמפיין <span className="font-medium">{campaign}</span></>}
                  , לחצ/י על הכפתור.
                </>
              ) : (
                'לאישור ההסרה לחצ/י על הכפתור.'
              )}
            </p>
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className="w-full rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              אשר/י הסרה
            </button>
          </>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Realtyz AI · מערכת לניהול נדל"ן
        </p>
      </div>
    </div>
  );
}
