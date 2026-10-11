// Tokenizes a card with Z-Credit. Card number / CVV are forwarded once and NEVER stored or logged;
// only the provider token, brand, last4 and expiry are persisted.
import { corsHeaders } from "../_shared/cors.ts";
import { admin, getCaller, loadZCredit, zcreditBase } from "../_shared/zcredit.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const luhn = (n: string) => {
  let s = 0, alt = false;
  for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; }
  return s % 10 === 0;
};
const validIsraeliId = (id: string) => {
  const v = id.padStart(9, "0");
  if (!/^\d{9}$/.test(v)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) { let d = +v[i] * ((i % 2) + 1); if (d > 9) d -= 9; s += d; }
  return s % 10 === 0;
};
const brandOf = (n: string) => /^4/.test(n) ? "Visa" : /^(5[1-5]|2[2-7])/.test(n) ? "Mastercard" : /^3[47]/.test(n) ? "Amex" : /^36|^30|^38/.test(n) ? "Diners" : "כרטיס";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { user, userClient } = await getCaller(req);
  if (!user) return json({ error: "יש להתחבר מחדש" }, 401);

  const b = await req.json().catch(() => ({}));
  const number = String(b.card_number ?? "").replace(/\D/g, "");
  const mm = parseInt(b.exp_month, 10), yy = parseInt(b.exp_year, 10);
  const cvv = String(b.cvv ?? "").replace(/\D/g, "");
  const holderId = String(b.holder_id ?? "").replace(/\D/g, "");
  const autoRecharge = b.auto_recharge !== false;
  const rechargeAmount = [200, 500, 1000].includes(Number(b.recharge_amount)) ? Number(b.recharge_amount) : 200;

  if (number.length < 8 || number.length > 19 || !luhn(number)) return json({ error: "מספר הכרטיס אינו תקין" }, 400);
  const year = yy < 100 ? 2000 + yy : yy;
  const now = new Date();
  if (!(mm >= 1 && mm <= 12) || year < now.getFullYear() || (year === now.getFullYear() && mm < now.getMonth() + 1)) return json({ error: "תוקף הכרטיס אינו תקין" }, 400);
  if (!/^\d{3,4}$/.test(cvv)) return json({ error: "קוד CVV אינו תקין" }, 400);
  if (!validIsraeliId(holderId)) return json({ error: "מספר תעודת הזהות אינו תקין" }, 400);

  const { data: ws } = await userClient.rpc("current_workspace_owner");
  const workspaceOwnerId = (ws as string) ?? user.id;

  const cfg = await loadZCredit();
  if (!cfg) return json({ error: "שמירת כרטיסים עדיין לא הופעלה. ספק הסליקה בהגדרה." , code: "not_configured" }, 503);

  let token: string | null = null;
  try {
    const r = await fetch(`${zcreditBase(cfg.environment)}/ZCreditWS/api/Transaction/CommitFullTransaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        TerminalNumber: cfg.terminal_id, Password: cfg.api_key,
        CardNumber: number, ExpDate_MMYY: `${String(mm).padStart(2, "0")}${String(year % 100).padStart(2, "0")}`,
        CVV: cvv, HolderID: holderId, TransactionSum: "1", J: "5", // J5 = card verification only, no charge
        CreditType: "1", NumberOfPayments: "1", CustomerName: "", ObeligoAction: "0",
      }),
    });
    const res = await r.json().catch(() => ({}));
    if (res?.HasError || !res?.Token) {
      console.warn("zcredit tokenize rejected", { code: res?.ReturnCode, msg: res?.ReturnMessage });
      return json({ error: res?.ReturnMessage ? `הכרטיס נדחה: ${res.ReturnMessage}` : "הכרטיס נדחה על ידי חברת האשראי" }, 402);
    }
    token = String(res.Token);
  } catch (e) {
    console.error("zcredit tokenize failed", (e as Error).message);
    return json({ error: "לא ניתן היה להתחבר לחברת האשראי. נסו שוב." }, 502);
  }

  const db = admin();
  await db.from("payment_methods").update({ is_default: false }).eq("workspace_owner_id", workspaceOwnerId);
  const { error } = await db.from("payment_methods").insert({
    workspace_owner_id: workspaceOwnerId, added_by: user.id, provider: "zcredit", provider_token: token,
    brand: brandOf(number), last4: number.slice(-4), exp_month: mm, exp_year: year,
    is_default: true, auto_recharge_enabled: autoRecharge, recharge_amount: rechargeAmount, status: "active",
  });
  if (error) return json({ error: "שמירת הכרטיס נכשלה" }, 500);
  return json({ ok: true, last4: number.slice(-4) });
});
