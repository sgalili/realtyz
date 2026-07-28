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

import puppeteer from 'npm:puppeteer-core@22.15.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

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
  if (httpStatus === 404 || httpStatus === 410) return 'gone';
  if (finalUrl && !/\/item\//i.test(finalUrl)) return 'gone';
  const low = html.toLowerCase();
  if (GONE_MARKERS.some((m) => low.includes(m.toLowerCase()))) return 'gone';
  // A live Yad2 ad always renders a document title ("דירה, רחוב, עיר | ...")
  // and gets rewritten to /item/<region>/<token>. Removed ads keep the bare
  // /item/<token> path and render an empty title.
  const t = (title ?? '').trim();
  if (!t) return 'gone';
  return 'live';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
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
      if (!/^https?:\/\//i.test(u) || !/yad2\.co\.il/i.test(u) || !itemToken(u)) {
        statuses[u] = 'gone';
      } else {
        statuses[u] = 'unknown';
        probeList.push(u);
      }
    }

    if (probeList.length && BD_WS) {
      let browser: any = null;
      try {
        browser = await puppeteer.connect({ browserWSEndpoint: BD_WS });

        const probeOne = async (u: string) => {
          const page = await browser.newPage();
          try {
            const resp = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            const httpStatus = resp?.status?.() ?? 0;
            // Radware serves a JS loader shell first; wait until the real ad
            // document replaces it, otherwise every URL looks identical.
            await page
              .waitForFunction(
                () =>
                  !/radware/i.test(document.title) &&
                  (document.querySelector('h1') !== null ||
                    document.body.innerText.trim().length > 400),
                { timeout: 30_000, polling: 750 },
              )
              .catch(() => {});
            const finalUrl = page.url();
            const html = await page.content().catch(() => '');
            const pageTitle = await page.title().catch(() => '');
            if (/radware/i.test(pageTitle)) {
              statuses[u] = 'unknown';
              console.log(`[yad2-ad-status] ${u} blocked by bot wall -> unknown`);
              return;
            }
            statuses[u] = classify(finalUrl, httpStatus, pageTitle, html);
            const d = extractDates(html);
            if (d.published_at || d.updated_at) dates[u] = d;
            console.log(
              `[yad2-ad-status] ${u} http=${httpStatus} final=${finalUrl} title=${JSON.stringify(pageTitle)} bytes=${html.length} -> ${statuses[u]}`,
            );
          } catch (e) {
            console.warn(`[yad2-ad-status] probe failed ${u}: ${(e as Error).message}`);
            statuses[u] = 'unknown';
          } finally {
            await page.close().catch(() => {});
          }
        };

        const started = Date.now();
        const BUDGET_MS = 120_000;
        const CONCURRENCY = 2;
        for (let i = 0; i < probeList.length; i += CONCURRENCY) {
          if (Date.now() - started > BUDGET_MS) break;
          await Promise.all(probeList.slice(i, i + CONCURRENCY).map(probeOne));
        }
        // One retry for anything the bot wall swallowed, while budget allows.
        for (const u of probeList) {
          if (statuses[u] !== 'unknown') continue;
          if (Date.now() - started > BUDGET_MS) break;
          await probeOne(u);
        }
      } catch (e) {
        console.warn(`[yad2-ad-status] browser connect failed: ${(e as Error).message}`);
      } finally {
        await browser?.close?.().catch(() => {});
      }
    }

    // Persist the real source dates so the table stops falling back to
    // our own import timestamp on the next render.
    const dateUrls = Object.keys(dates);
    if (dateUrls.length) {
      try {
        const admin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { persistSession: false } },
        );
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
