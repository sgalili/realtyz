import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function ShortLinkRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) {
        setError("קישור לא תקין");
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("shortlink-resolve", {
          body: { slug },
        });
        if (cancelled) return;
        if (error || !data?.long_url) {
          setError("הקישור לא נמצא או פג תוקף.");
          return;
        }
        window.location.replace(data.long_url as string);
      } catch (e) {
        if (!cancelled) setError("שגיאה בפתיחת השיחה. נסו שוב.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="text-center max-w-md">
        {error ? (
          <>
            <h1 className="text-2xl font-semibold text-slate-900 mb-2">לא הצלחנו לפתוח את השיחה</h1>
            <p className="text-slate-600">{error}</p>
            <a href="https://realtyz.co.il" className="inline-block mt-6 text-blue-600 underline">
              חזרה לאתר
            </a>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600 mb-4" />
            <h1 className="text-xl font-semibold text-slate-900">פותחים עבורכם וואטסאפ…</h1>
            <p className="text-slate-600 mt-2">השיחה תיפתח כעת עם הסוכן.</p>
          </>
        )}
      </div>
    </div>
  );
}
