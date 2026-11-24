import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { AppShell } from "@/app/AppShell";
import { runClientBoot } from "@/app/clientBoot";
import { NotFound, PageLoader } from "@/app/AppRoutes";
import { Suspense } from "react";

// ported from main.tsx
if (typeof window !== "undefined") runClientBoot();

const TITLE = "TORAFF | מערכת ההפעלה למתווכי נדל״ן";
const DESCRIPTION = "TORAFF וריטה, סוכנת ה-AI שלך: ניהול נכסים ולידים, קמפיינים, מטלות, חתימות דיגיטליות וכלים למתווכי נדל״ן במקום אחד.";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { name: "google-site-verification", content: "O9IbprDP_sPTFkmNENxsJum4nCkhVbD_Tp8IrhSU6kc" },
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=yes" },
      { title: TITLE },
      { "data-rh": "true", name: "description", content: DESCRIPTION },
      { name: "author", content: "TORAFF" },
      { name: "theme-color", content: "#1e3a8a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "TORAFF" },
      { "data-rh": "true", property: "og:type", content: "website" },
      { "data-rh": "true", property: "og:url", content: "https://toraff.co.il/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "facebook-domain-verification", content: "v2pglxhlebfl8mrca15zok3v3rrf4n" },
      { "data-rh": "true", property: "og:title", content: TITLE },
      { "data-rh": "true", name: "twitter:title", content: TITLE },
      { "data-rh": "true", property: "og:description", content: DESCRIPTION },
      { "data-rh": "true", name: "twitter:description", content: DESCRIPTION },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "shortcut icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700;800&family=Heebo:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Playfair+Display:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  pendingComponent: RootPending,
  notFoundComponent: () => (
    <Suspense fallback={<PageLoader />}>
      <NotFound />
    </Suspense>
  ),
  errorComponent: RootError,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="root">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}

function RootPending() {
  return <div className="min-h-screen" aria-busy="true" />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return <AppShell queryClient={queryClient} />;
}

function RootError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">משהו השתבש בטעינת העמוד. אפשר לנסות שוב.</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
          >
            Try again
          </button>
          <Link to="/" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
