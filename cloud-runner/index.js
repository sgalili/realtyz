// Realtyz cloud runner — headless Facebook group publisher.
//
// Run this anywhere Node 20+ works (Render, Railway, a VPS, an old laptop).
// It exposes a single HTTP endpoint that the Realtyz cloud dispatcher calls
// (CLOUD_BROWSER_WORKER_URL). Each request carries one group post job plus the
// decrypted Facebook session cookies. The runner posts it with Puppeteer and
// reports the outcome back to the dispatcher.
//
// Env:
//   PORT                        default 8787
//   CLOUD_WORKER_SHARED_SECRET  must match the Realtyz secret
//
// Start:  npm install && npm start

import http from "node:http";
import puppeteer from "puppeteer";

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.CLOUD_WORKER_SHARED_SECRET || "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseCookies(raw, userAgent) {
  // Accepts either a JSON cookie array (Chrome export) or "a=b; c=d".
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || ".facebook.com",
        path: c.path || "/",
        httpOnly: !!c.httpOnly,
        secure: c.secure !== false,
      }));
    }
  } catch {
    /* not JSON – fall through */
  }
  return String(raw)
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      return {
        name: p.slice(0, i).trim(),
        value: p.slice(i + 1).trim(),
        domain: ".facebook.com",
        path: "/",
        secure: true,
      };
    })
    .filter((c) => c.name && c.value);
}

async function publish(job) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=he-IL"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1000 });
    if (job.user_agent) await page.setUserAgent(job.user_agent);
    await page.setCookie(...parseCookies(job.session_cookies, job.user_agent));

    const url = job.group_url;
    if (!url) throw new Error("חסר קישור לקבוצה");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await sleep(4000);

    if (page.url().includes("/login")) throw new Error("החיבור לפייסבוק פג – יש לשמור חיבור חדש בהגדרות");

    // Open the composer.
    const openers = [
      'div[role="button"][aria-label*="כתוב"]',
      'div[role="button"][aria-label*="Write"]',
      'div[role="button"][aria-label*="Create"]',
      'span:has-text("כתוב משהו")',
    ];
    let opened = false;
    for (const sel of openers) {
      const el = await page.$(sel).catch(() => null);
      if (el) {
        await el.click();
        opened = true;
        break;
      }
    }
    if (!opened) throw new Error("לא נמצא תיבת כתיבת פוסט בקבוצה");
    await sleep(3000);

    const box = await page.waitForSelector('div[role="dialog"] div[contenteditable="true"]', { timeout: 25_000 });
    await box.click();
    for (const line of String(job.text || "").split("\n")) {
      await page.keyboard.type(line, { delay: 8 });
      await page.keyboard.down("Shift");
      await page.keyboard.press("Enter");
      await page.keyboard.up("Shift");
    }
    await sleep(1500);

    const postBtn =
      (await page.$('div[role="dialog"] div[aria-label="פרסם"][role="button"]')) ||
      (await page.$('div[role="dialog"] div[aria-label="Post"][role="button"]'));
    if (!postBtn) throw new Error("לא נמצא כפתור פרסום");
    await postBtn.click();
    await sleep(8000);

    // Optional first comment on the fresh post.
    if (job.first_comment) {
      const commentBox = await page
        .waitForSelector('div[aria-label*="תגובה"][contenteditable="true"], div[aria-label*="comment"][contenteditable="true"]', {
          timeout: 15_000,
        })
        .catch(() => null);
      if (commentBox) {
        await commentBox.click();
        await page.keyboard.type(String(job.first_comment), { delay: 8 });
        await page.keyboard.press("Enter");
        await sleep(4000);
      }
    }

    return { status: "completed", post_url: page.url() };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function report(job, result) {
  if (!job.report_url) return;
  await fetch(job.report_url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-worker-secret": SECRET },
    body: JSON.stringify({ action: "report", job_id: job.job_id, ...result }),
  }).catch((e) => console.error("report failed", e));
}

http
  .createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(200).end("realtyz cloud runner ok");
      return;
    }
    if (SECRET && req.headers["x-worker-secret"] !== SECRET) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let job;
      try {
        job = JSON.parse(raw);
      } catch {
        res.writeHead(400).end("bad json");
        return;
      }
      // Ack immediately, publish in the background, then report.
      res.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify({ accepted: true }));
      publish(job)
        .then((r) => {
          console.log("published", job.job_id, r.post_url);
          return report(job, r);
        })
        .catch((e) => {
          console.error("failed", job.job_id, e.message);
          return report(job, { status: "failed", error: e.message });
        });
    });
  })
  .listen(PORT, () => console.log(`Realtyz cloud runner listening on :${PORT}`));
