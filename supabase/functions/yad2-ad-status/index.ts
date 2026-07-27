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

    return json({ ok: true, statuses });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
