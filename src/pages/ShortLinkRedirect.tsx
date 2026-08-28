import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Extracts { phone, text } from any WhatsApp URL flavour
 * (wa.me, api.whatsapp.com/send, web.whatsapp.com/send, whatsapp://send).
 */
function parseWhatsApp(longUrl: string): { phone: string; text: string } | null {
  try {
    const u = new URL(longUrl.replace(/^whatsapp:\/\//i, "https://whatsapp.local/"));
    const host = u.hostname.toLowerCase();
    const isWa =
      host === "wa.me" ||
      host.endsWith("whatsapp.com") ||
      host === "whatsapp.local" ||
      host === "api.whatsapp.com";
    if (!isWa) return null;
    const fromPath = u.pathname.replace(/[^\d]/g, "");
    const phone = (u.searchParams.get("phone") || fromPath || "").replace(/\D/g, "");
    const text = u.searchParams.get("text") || "";
    if (!phone) return null;
    return { phone, text };
  } catch {
    return null;
  }
}

/**
 * Public short-link handler.
 *
 * WhatsApp links open the NATIVE app instantly through the `whatsapp://send`
 * scheme (works inside the Facebook / Instagram in-app browsers, where
 * api.whatsapp.com triggers an App Store download screen). If the scheme does
 * not take over within a short grace period we fall back to the wa.me
 * universal link, and we always render a manual button as a last resort.
 */
export default function ShortLinkRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  const [target, setTarget] = useState<string | null>(null);

  const wa = useMemo(() => (target ? parseWhatsApp(target) : null), [target]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) {
        setError("קישור לא תקין");
        return;
      }
      try {
        const { data, error: fnError } = await supabase.functions.invoke("shortlink-resolve", {
          body: { slug },
        });
        if (cancelled) return;
        const longUrl = (data as any)?.long_url as string | undefined;
        if (fnError || !longUrl) {
          setError("הקישור לא נמצא או פג תוקף.");
          return;
        }
        setTarget(longUrl);
      } catch {
        if (!cancelled) setError("שגיאה בפתיחת השיחה. נסו שוב.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!target) return;
    const parsed = parseWhatsApp(target);
    if (!parsed) {
      window.location.replace(target);
      return;
    }
    const query = `phone=${parsed.phone}${parsed.text ? `&text=${encodeURIComponent(parsed.text)}` : ""}`;
    const nativeUrl = `whatsapp://send?${query}`;
    const universalUrl = `https://wa.me/${parsed.phone}${
      parsed.text ? `?text=${encodeURIComponent(parsed.text)}` : ""
    }`;
    setManualUrl(universalUrl);

    // 1. Native scheme first — no landing page, no store prompt.
    window.location.href = nativeUrl;

    // 2. If the app did not take over (page still visible), use the universal link.
    const fallback = window.setTimeout(() => {
      if (document.visibilityState === "visible") window.location.replace(universalUrl);
    }, 1200);
    return () => window.clearTimeout(fallback);
  }, [target]);

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
            <p className="text-slate-600 mt-2">השיחה תיפתח כעת באפליקציה.</p>
            {(manualUrl || wa) && (
              <a
                href={manualUrl ?? "#"}
                className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white"
              >
                פתיחת וואטסאפ עכשיו
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
