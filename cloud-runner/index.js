// TORAFF cloud runner — headless Facebook group publisher.
//
// Run this anywhere Node 20+ works (Render, Railway, a VPS, an old laptop).
// It exposes a single HTTP endpoint that the TORAFF cloud dispatcher calls
// (CLOUD_BROWSER_WORKER_URL). Each request carries one group post job plus the
// decrypted Facebook session cookies. The runner posts it with Puppeteer and
// reports the outcome back to the dispatcher.
//
// Env:
//   PORT                        default 8787
//   CLOUD_WORKER_SHARED_SECRET  must match the TORAFF secret
//
// Start:  npm install && npm start

import http from "node:http";
import puppeteer from "puppeteer";
import { membershipOutcome, approvedAnswers } from './groupPolicy.js';

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
  const callback = new URL(job.report_url);
  const expected = process.env.CLOUD_CALLBACK_ORIGIN;
  if (!expected || callback.origin !== new URL(expected).origin || !['/functions/v1/fb-session-vault','/functions/v1/fb-group-manager','/functions/v1/cloud-group-poster'].includes(callback.pathname)) throw new Error('invalid_callback');
  await fetch(job.report_url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-worker-secret": SECRET },
    body: JSON.stringify({
      action: job.job_type === 'group_join' ? 'join_result' : job.job_type === "group_fetch" ? "fetch_result" : "report",
      job_id: job.job_id,
      ...(job.dispatch_token ? { dispatch_token: job.dispatch_token } : {}),
      ...result,
    }),
  }).catch((e) => console.error("report failed", e));
}

async function joinGroup(job) {
  const target = new URL(job.group_url);
  if (target.protocol !== 'https:' || !['facebook.com','www.facebook.com','m.facebook.com'].includes(target.hostname) || !/^\/groups\/[A-Za-z0-9._-]+/.test(target.pathname)) throw new Error('invalid_group_url');
  const browser = await puppeteer.launch({ headless:true, args:['--no-sandbox','--disable-setuid-sandbox','--lang=he-IL'] });
  try {
    const page = await browser.newPage();
    if(job.user_agent) await page.setUserAgent(job.user_agent);
    await page.setCookie(...parseCookies(job.session_cookies));
    await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:60000});
    await sleep(3000);
    if(/\/login|\/checkpoint/.test(page.url())) return {outcome:'session_expired',error:'נדרש חידוש התחברות לפייסבוק'};
    const readOutcome = async () => membershipOutcome(await page.evaluate(() => Array.from(document.querySelectorAll('[role="button"],button')).map(e => e.getAttribute('aria-label') || e.textContent || '').join('\n')));
    let outcome = await readOutcome();
    if(outcome) return {outcome};
    const clickNamed = async (names, root='') => {
      const elements = await page.$$(`${root} [role="button"],${root} button`);
      for(const el of elements) {
        const text = await el.evaluate(e => (e.getAttribute('aria-label') || e.textContent || '').trim());
        if(names.includes(text)) { await el.click(); return true; }
      }
      return false;
    };
    if(!await clickNamed(['Join group','הצטרף לקבוצה','הצטרפות לקבוצה'])) return {outcome:'failed',error:'לא נמצא כפתור הצטרפות'};
    await sleep(3000);
    const fields = await page.$$('[role="dialog"] textarea, [role="dialog"] input[type="text"]');
    const requirements = [];
    for(const field of fields) {
      const label = await field.evaluate(e => e.getAttribute('aria-label') || e.closest('label')?.textContent || e.parentElement?.textContent || '');
      requirements.push(label.trim().slice(0,2000));
    }
    const rules = await page.$$('[role="dialog"] [role="checkbox"], [role="dialog"] input[type="checkbox"]');
    const unsupported = await page.$('[role="dialog"] [role="radio"], [role="dialog"] select');
    if(unsupported) return {outcome:'needs_answers',requirements,error:'הקבוצה דורשת בחירה אישית; יש להשלים בחיבור הענן'};
    if(fields.length || rules.length) {
      const answers = approvedAnswers(requirements,job.membership_answers,job.rules_accepted);
      if(!answers) return {outcome:'needs_answers',requirements,error:'נדרשות תשובות מאושרות והסכמה לכללי הקבוצה'};
      for(let i=0;i<fields.length;i++) { await fields[i].click(); await fields[i].type(answers[requirements[i]]); }
      for(const box of rules) {
        const checked = await box.evaluate(e => e.getAttribute('aria-checked') === 'true' || e.checked === true);
        if(!checked) await box.click();
      }
      if(!await clickNamed(['Submit','שליחה','שלח'],'[role="dialog"]')) return {outcome:'needs_answers',requirements,error:'נדרשת השלמה בחיבור הענן'};
      await sleep(3000);
    }
    outcome = await readOutcome();
    return outcome ? {outcome} : {outcome:'failed',error:'פייסבוק לא אישר שהבקשה נקלטה'};
  } finally { await browser.close().catch(() => {}); }
}

// One serialized lane per Facebook account/workspace, no concurrent joins.
const lanes = new Map();
function schedule(job) {
  const key = job.workspace_owner_id || 'discovery';
  const previous = lanes.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const run = job.job_type === 'group_join' ? joinGroup : job.job_type === 'group_fetch' ? fetchGroups : publish;
    try { await report(job, await run(job)); }
    catch { await report(job, job.job_type === 'group_join' ? {outcome:'failed',error:'cloud_join_failed'} : {status:'failed',error:'cloud_task_failed'}); }
    if(job.job_type === 'group_join') await sleep(120000);
  });
  lanes.set(key,next);
  void next.finally(() => { if(lanes.get(key)===next) lanes.delete(key); }).catch(() => {});
}

// Cloud-first group discovery: scrape candidate groups for a keyword with the
// saved session, so users never need a local browser extension.
async function fetchGroups(job) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=he-IL"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1000 });
    if (job.user_agent) await page.setUserAgent(job.user_agent);
    await page.setCookie(...parseCookies(job.session_cookies, job.user_agent));

    const url = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(String(job.query || ""))}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await sleep(4000);
    if (page.url().includes("/login")) throw new Error("החיבור לפייסבוק פג – יש לשמור חיבור חדש בהגדרות");

    // Scroll to load more result cards.
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 1800));
      await sleep(1200);
    }

    const groups = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      const reserved = ["joins", "feed", "discover", "create", "search"];
      for (const a of document.querySelectorAll('a[href*="/groups/"]')) {
        const m = String(a.href).match(/facebook\.com\/groups\/([A-Za-z0-9._-]+)/);
        if (!m) continue;
        const id = m[1];
        if (reserved.includes(id) || seen.has(id)) continue;
        const name = String(a.getAttribute("aria-label") || a.textContent || "").trim().split("\n")[0].slice(0, 200);
        if (name.length < 2) continue;
        seen.add(id);
        const card = a.closest('div[role="article"]') || a.parentElement;
        const text = card ? String(card.textContent || "") : "";
        const mem = text.match(/([\d.,]+)\s*(K|אלף)?\s*(חברים|members)/i);
        let member_count = null;
        if (mem) {
          const base = parseFloat(mem[1].replace(/,/g, ""));
          member_count = Number.isFinite(base) ? Math.round(base * (mem[2] ? 1000 : 1)) : null;
        }
        out.push({
          group_id: id,
          group_name: name,
          group_url: `https://www.facebook.com/groups/${id}`,
          group_icon: null,
          member_count,
          posts_per_day: null,
          privacy: null,
          is_member: false,
          activity_text: null,
        });
        if (out.length >= 60) break;
      }
      return out;
    });

    if (!groups.length) throw new Error("לא נמצאו קבוצות מתאימות – נסו מילת חיפוש אחרת");
    return { status: "completed", groups };
  } finally {
    await browser.close().catch(() => {});
  }
}

http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/capabilities') {
      res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({group_fetch:true,group_join:true,cloud_posts:true}));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(200).end("realtyz cloud runner ok");
      return;
    }
    if (!SECRET || req.headers["x-worker-secret"] !== SECRET) {
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
      // Ack immediately, run in the background, then report.
      res.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify({ accepted: true }));
      schedule(job);
    });
  })
  .listen(PORT, () => console.log(`TORAFF cloud runner listening on :${PORT}`));
