// yad2-ad-status
// Liveness probe for Yad2 ad URLs. The UI calls it before showing the official
// Yad2 button so a dead/removed ad never links to a missing page.
//
// POST { urls: string[] }  ->  { statuses: { [url]: 'live' | 'gone' | 'unknown' } }
//
// Yad2 sits behind a Radware bot wall, so a direct fetch always returns a
// challenge shell (identical bytes for real and fake ads). The Bright Data
// REST Web Unlocker is unusable here too — the configured zone is a Scraping
// Browser zone (x-brd-err-code=client_10090). We therefore drive the same
// Bright Data Chromium that yad2-unlocker uses, load the ad page and read the
// real HTTP status + page content.
//
// 'unknown' means we could not verify; the UI keeps the button hidden unless
// the ad is verified 'live'.

// puppeteer-core is loaded lazily inside the handler: its Node http transport
// probes ClientRequest.options.createConnection at module-evaluation time,
// which Deno does not implement — a top-level import intermittently kills the
// boot with a 503 BOOT_ERROR before the handler ever runs.
type PuppeteerModule = typeof import('npm:puppeteer-core@22.15.0');
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { cachedScrapingText, trackScraping } from '../_shared/scrapingAudit.ts';
import { requireCaller } from '../_shared/authz.ts';
import { classifyYad2Status } from '../_shared/yad2Status.ts';
import { BRIGHT_DATA_TIMEOUT_MS, BRIGHT_DATA_WORKER_BUDGET_MS, logProviderFailure } from '../_shared/brightDataDiagnostics.ts';
import { createProviderPacer, ProviderRateLimitError, retryAfterMs } from '../_shared/brightDataThrottle.ts';
const paceProvider = createProviderPacer();

const BD_WS = Deno.env.get('BRIGHTDATA_WS_ENDPOINT') ?? '';

const GONE_MARKERS = [
  'המודעה שחיפשת אינה קיימת',
  'המודעה אינה קיימת',
  'המודעה הוסרה',
  'המודעה שחיפשת הוסרה',
  'הדף שחיפשת לא נמצא',
  'העמוד לא נמצא',
  '"notfound":true',
  'page not found',
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function itemToken(u: string): string | null {
  try {
    const m = new URL(u).pathname.match(/\/item\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

type Status = 'live' | 'gone' | 'unknown';

type AdDates = { published_at: string | null; updated_at: string | null };

function toIso(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Hebrew dd/mm/yy(yy)
  const dm = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dm) {
    const y = Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]);
    const d = new Date(Date.UTC(y, Number(dm[2]) - 1, Number(dm[1])));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return null;
  // Ignore absurd values
  if (t < Date.UTC(2000, 0, 1)) return null;
  return new Date(t).toISOString();
}

/** Pulls the ad's real createdAt/updatedAt out of the rendered page HTML. */
function extractDates(html: string): AdDates {
  const grab = (keys: string[]): string | null => {
    for (const k of keys) {
      const m = html.match(new RegExp(`"${k}"\\s*:\\s*"([^"]{6,40})"`));
      const iso = m ? toIso(m[1]) : null;
      if (iso) return iso;
    }
    return null;
  };
  let published = grab(['createdAt', 'created_at', 'publishedAt', 'published_at', 'uploadDate']);
  const updated = grab(['updatedAt', 'updated_at', 'modifiedAt', 'lastUpdated']);
  if (!published) {
    // Visible fallback: "תאריך עדכון 12/07/2026" / "פורסם ב 12/07/26"
    const m = html.match(/(?:פורסם(?:\s+ב-?)?|תאריך\s+עדכון)[^\d]{0,12}(\d{1,2}[./]\d{1,2}[./]\d{2,4})/);
    published = m ? toIso(m[1]) : null;
  }
  return { published_at: published, updated_at: updated };
}

function classify(finalUrl: string, httpStatus: number, title: string, html: string): Status {
  return classifyYad2Status(finalUrl, httpStatus, title, html);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const caller = await requireCaller(req, ['user', 'service']);
    if (caller instanceof Response) return caller;
    const scoped = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const body = await req.json().catch(() => ({} as any));
    const urls: string[] = Array.from(
      new Set(
        (Array.isArray(body?.urls) ? body.urls : [])
          .map((u: unknown) => String(u ?? '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 12);

    const statuses: Record<string, Status> = {};
    const dates: Record<string, AdDates> = {};
    const probeList: string[] = [];

    for (const u of urls) {
      let valid = false;
      try { const parsed = new URL(u); valid = parsed.protocol === 'https:' && /(^|\.)yad2\.co\.il$/i.test(parsed.hostname) && !parsed.username && !parsed.password && !!itemToken(u); } catch { /* invalid */ }
      if (!valid) {
        statuses[u] = 'gone';
      } else {
        statuses[u] = 'unknown';
        probeList.push(u);
      }
    }

    if (probeList.length && BD_WS) {
      let browser: any = null;
      const started = Date.now();
      // Hard wall-clock budget: the platform kills idle requests at 150s, so
      // always answer (with partial 'unknown' results) well before that.
      const HARD_DEADLINE_MS = BRIGHT_DATA_WORKER_BUDGET_MS;
      let rateLimit: ProviderRateLimitError | null = null;
      const remaining = () => HARD_DEADLINE_MS - (Date.now() - started);
      const withDeadline = <T,>(p: Promise<T>, ms: number): Promise<T | undefined> =>
        Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), Math.max(0, ms)))]);

      const work = (async () => {
        const puppeteer: PuppeteerModule['default'] | null = await import('npm:puppeteer-core@22.15.0')
          .then((m) => m.default)
          .catch((e) => { console.warn(`[yad2-ad-status] puppeteer load failed: ${(e as Error).message}`); return null; });
        if (!puppeteer) return;
        const probeOne = async (u: string) => {
          if (remaining() < 15_000) return;
          try {
          const fetchStatus = async () => {
          if (!browser) {
            browser = await trackScraping('yad2_status', 'browser_session', u, () => puppeteer.connect({ browserWSEndpoint: BD_WS, protocolTimeout: Math.min(BRIGHT_DATA_TIMEOUT_MS, remaining()) }));
          }
          const page = await browser.newPage();
          try {
            const resp = await trackScraping('yad2_status', 'browser_navigation', u, () => paceProvider(() => page.goto(u, { waitUntil: 'domcontentloaded', timeout: Math.max(1000, Math.min(BRIGHT_DATA_TIMEOUT_MS, remaining() - 5000)) })), (r: any) => ({ status: r?.status?.() }));
            const httpStatus = resp?.status?.() ?? 0;
            if (httpStatus === 429) {
              rateLimit = new ProviderRateLimitError(retryAfterMs(resp.headers()['retry-after'] ?? null));
              throw rateLimit;
            }
            // Radware serves a JS loader shell first; wait until the real ad
            // document replaces it, otherwise every URL looks identical.
            await page
              .waitForFunction(
                () =>
                  !/radware/i.test(document.title) &&
                  (document.querySelector('h1') !== null ||
                    document.body.innerText.trim().length > 400),
                { timeout: Math.max(1_000, Math.min(20_000, remaining() - 8_000)), polling: 750 },
              )
              .catch(() => {});
            const finalUrl = page.url();
            const html = await page.content().catch(() => '');
            const pageTitle = await page.title().catch(() => '');
            if (/radware/i.test(pageTitle)) {
              statuses[u] = 'unknown';
              console.log('[yad2-ad-status] source blocked');
              throw new Error('source_blocked');
            }
            statuses[u] = classify(finalUrl, httpStatus, pageTitle, html);
            if (statuses[u] === 'unknown') {
              logProviderFailure({ operation: 'status_browser', url: u, status: httpStatus, payload: html, error: 'Listing status could not be verified', elapsedMs: Date.now() - started });
              throw new Error('source_unverified');
            }
            const d = extractDates(html);
            if (d.published_at || d.updated_at) dates[u] = d;
            return JSON.stringify({ status: statuses[u], dates: d });
          } catch (e) {
            console.warn('[yad2-ad-status] probe failed');
            statuses[u] = 'unknown';
            throw e;
          } finally {
            await page.close().catch(() => {});
            await browser?.disconnect?.().catch(() => {});
            browser = null;
          }
          };
          // Imports must verify live, never reuse the public one-day status cache.
          const serialized = caller.kind === 'service' ? await fetchStatus() : await cachedScrapingText('yad2_status', u, 86400, fetchStatus);
          const cached = JSON.parse(serialized);
          statuses[u] = cached.status; dates[u] = cached.dates;
          } catch { statuses[u] = 'unknown'; }
        };

        const CONCURRENCY = 1;
        for (let i = 0; i < probeList.length; i += CONCURRENCY) {
          if (remaining() < 15_000 || rateLimit) break;
          await Promise.all(probeList.slice(i, i + CONCURRENCY).map(probeOne));
        }
        // One retry for anything the bot wall swallowed, while budget allows.
        for (const u of probeList) {
          if (statuses[u] !== 'unknown') continue;
          if (remaining() < 30_000 || rateLimit || caller.kind === 'service') break;
          await probeOne(u);
        }
      })().catch((e) => {
        console.warn(`[yad2-ad-status] browser connect failed: ${(e as Error).message}`);
      });

      await withDeadline(work, HARD_DEADLINE_MS);
      const limited = rateLimit as ProviderRateLimitError | null;
      if (limited) {
        await browser?.disconnect?.().catch(() => {});
        return json({ error: 'brightdata_rate_limited', retry_after_ms: limited.retryAfterMs, statuses, dates }, 429);
      }
      if (remaining() <= 0) console.warn('[yad2-ad-status] hard deadline reached, returning partial results');
      withDeadline(browser?.close?.() ?? Promise.resolve(), 3_000).catch(() => {});
    }

    // Persist the real source dates so the table stops falling back to
    // our own import timestamp on the next render.
    const dateUrls = Object.keys(dates);
    if (dateUrls.length && caller.kind === 'user') {
      try {
        const admin = scoped;
        for (const u of dateUrls) {
          const token = itemToken(u);
          const { data: rows } = await admin
            .from('listings')
            .select('id, source_metadata')
            .or(`source_url.eq.${u}${token ? `,external_id.eq.${token}` : ''}`)
            .limit(5);
          for (const row of rows ?? []) {
            const meta = (row.source_metadata ?? {}) as Record<string, unknown>;
            await admin.from('listings').update({
              source_metadata: {
                ...meta,
                published_at: dates[u].published_at ?? (meta as any).published_at ?? null,
                updated_at_source: dates[u].updated_at ?? (meta as any).updated_at_source ?? null,
                published_at_source: 'yad2_item_page',
              },
            }).eq('id', row.id);
          }
        }
      } catch (e) {
        console.warn('[yad2-ad-status] date persist failed', (e as Error).message);
      }
    }

    return json({ ok: true, statuses, dates });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
