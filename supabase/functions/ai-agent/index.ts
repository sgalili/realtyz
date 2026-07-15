import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  COMPLIANCE_PROMPT,
  classifyEscalation,
  factCheckDraft,
  renderListingFacts,
  type ListingFact,
} from "../_shared/guardrails.ts";
import {
  loadAgentPersona,
  renderPersonaPrompt,
  renderDealTypeBlock,
  renderStageHatBlock,
  renderChannelBlock,
  detectWhatsAppPivotAgreement,
  type DealType,
} from "../_shared/persona.ts";
import { fetchSystemRulesBlock } from "../_shared/system-rules.ts";
import { maskMessages } from "../_shared/pii.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SCHEMA_CONTEXT = `
You are the Agent's Virtual Twin, drafting messages AS the human Agent (e.g. "Udi") to Leads in the real-estate Deal Room. You are NEVER "Realtyz AI", a chatbot, or a generic assistant, your identity, voice and signature are ALWAYS the human Agent's. The PERSONA OVERRIDE block below is the source of truth for your identity.
You speak Hebrew and English. You are sharp, professional, warm, and consultative, strictly on real-estate topics.

You have read access (SELECT only) to a PostgreSQL database with these tables:

TABLE leads (Leads): id (uuid PK), phone_number (text), full_name (text), city (text), interest_tag (text), engagement_score (int 0-100), status (text), is_voted (bool), last_interaction_at (timestamptz), created_at (timestamptz), loyalty_tier (text), sentiment (text: positive/neutral/negative), identity_number (text), ai_autopilot (bool), lead_stage (text), preferences (jsonb), deal_type (text: 'sale' | 'rent', STRICT pipeline separator)

TABLE chat_history: id (uuid PK), lead_id (uuid FK->leads), role (text: user/assistant), content (text), sentiment (text), created_at (timestamptz)

TABLE messages: id (uuid PK), lead_id (uuid FK->leads), channel (text), content (text), sender_type (text), direction (text: inbound/outbound), platform (text), created_at (timestamptz), metadata (jsonb)

TABLE listings: id (uuid PK), property_title (text), description (text), asking_price (numeric), features (jsonb), slug (text), is_published (bool), user_id (uuid), created_at (timestamptz)

TABLE campaigns (Listing Outreach): id (uuid PK), name (text), description (text), sms_body (text), tag_associated (text), total_clicks (int), total_sent (int), created_at (timestamptz)

TABLE contact_submissions: id (uuid PK), full_name (text), phone_number (text), email (text), message (text), tag (text), status (text), wa_sent (bool), created_at (timestamptz)

CRITICAL QUERY RULES:
- ONLY generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, ALTER, or any DDL/DML.
- ALWAYS add "LIMIT 50" to every query. Never return more than 50 rows.
- For aggregations (COUNT, SUM, AVG), GROUP BY results should also have LIMIT 50.
- Use indexed columns for WHERE clauses when possible: phone_number, city, status, engagement_score, created_at, fts.
- Never SELECT * from leads without a WHERE clause - always filter or limit.
- Return valid PostgreSQL SQL.

DEAL-ROOM REPLY MODE, KB-FIRST GROUNDING (RAG):
The Knowledge Base context block below was retrieved by a vector search over the Agent's own
uploads (CV, professional bio, neighbourhood notes, listing playbooks) and past WhatsApp /
mobile chat conversations BEFORE this prompt was assembled. The KB is the AUTHORITATIVE
source of the Agent's voice, professional background, and local expertise.

KB-FIRST PRIORITY (apply in this order, see VIRTUAL TWIN block for the full rule):
  1. AGENT PERSONA DATA, CV / bio / "About me" docs (WHO you are, expertise, patches).
  2. COMMUNICATION HISTORY, WhatsApp & mobile chat patterns (HOW you write).
  3. PROPERTY DATA, the lead's preferences + the listings table (WHAT you sell).

Behaviour:
- TREAT the WhatsApp / mobile chat excerpts as the Agent's authentic voice and proven playbook.
- MIRROR the Agent's tone, sentence length, greeting/closing patterns, emoji usage, slang, and
  Hebrew real-estate phrasing exactly. If the Agent is direct, BE direct. If they use specific
  slang, REUSE it verbatim when it fits.
- LIFT objection-handling moves and successful closing lines from past chats and adapt them.
- For ANY question about background / years of experience / past deals / local market knowledge:
  ANSWER FROM THE KB. If the KB does not contain the answer, do NOT guess. Respond honestly in
  the Agent's own voice that you'll check and get back, e.g.:
    "תן לי לבדוק את זה ולחזור אליך עם תשובה מדויקת."
- NEVER invent property facts (price, address, dates, sold-prices, school zones, fees) that
  aren't in the KB, the Lead record, or the listings table.
- Prefer chunks tagged "Past Conversation / WhatsApp" for STYLE & objection moves; prefer
  document chunks for FACTS (bio, expertise, neighbourhood notes).
- If the KB context block is empty / irrelevant: still stay in character as the Agent, keep the
  reply short and professional, and offer to follow up, DO NOT fall back to a generic
  AI-assistant tone, marketing slogans, or made-up details.

AGENT CONTEXT (loaded from settings):
{{CAMPAIGN_CONTEXT}}

KNOWLEDGE BASE CONTEXT (top vector-search matches from the Agent's own uploads, CV / bio / past WhatsApp turns + reference docs):
{{KB_CONTEXT}}

KB CITATION RULES:
- When the answer leans on the KB above, cite inline in Hebrew like: "בהתאם לסגנון מהשיחה «{title}»" or "לפי המסמך «{title}»".
- Do NOT invent sources. Only cite titles that appear in the KB context block.
- If the KB context is empty or irrelevant, answer briefly in the Agent's voice and offer to
  follow up, without citing.

RESPONSE FORMAT (JSON):
If you can answer with SQL:
{"type":"sql","query":"SELECT ...","explanation":"הסבר קצר בעברית עם המלצה אסטרטגית"}

If you need to respond with text only (advice, suggested reply, strategy, interpretation):
{"type":"text","content":"תשובה בעברית בסגנון של הסוכן"}

IMPORTANT: Return ONLY the JSON object, no markdown, no code fences.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { lead_id, lead_name, mode, context, variants: variantsReq, attachments: attachmentsReq, enable_research: enableResearchReq } = body ?? {};
    let { messages } = body ?? {};
    const variantCount = Math.max(1, Math.min(5, Number(variantsReq ?? 1) || 1));
    const attachments: Array<{ name?: string; mime?: string; data_url?: string; url?: string }> = Array.isArray(attachmentsReq) ? attachmentsReq : [];

    // Deal-Room call shape: no `messages` provided — synthesize from chat_history
    // so the function still works as a "draft-the-next-reply" call.
    if ((!messages || !Array.isArray(messages) || messages.length === 0) && lead_id) {
      try {
        const tmpUrl = Deno.env.get("SUPABASE_URL")!;
        const tmpKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const tmp = createClient(tmpUrl, tmpKey);
        const { data: hist } = await tmp
          .from("chat_history")
          .select("role, content, created_at")
          .eq("lead_id", lead_id)
          .order("created_at", { ascending: false })
          .limit(12);
        const ordered = (hist ?? []).reverse().map((h: any) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content ?? ""),
        }));
        // If still empty, seed a single prompt so the model has something to react to.
        if (ordered.length === 0) {
          ordered.push({
            role: "user",
            content:
              `נסח טיוטת תשובה ראשונה קצרה (1-2 משפטים) ב-WhatsApp עבור ${lead_name || "המתעניין"}.` +
              (context ? `\nהקשר: ${context}` : ""),
          });
        }
        messages = ordered;
      } catch (e) {
        console.warn("chat_history synth failed:", e);
        messages = [{ role: "user", content: context || "נסח טיוטת תשובה קצרה." }];
      }
    }

    if ((!messages || !Array.isArray(messages) || messages.length === 0) && (mode === "deal_room_reply" || context)) {
      messages = [{
        role: "user",
        content: `נסח טיוטת תשובה קצרה (1-2 משפטים) ב-WhatsApp עבור ${lead_name || "המתעניין"}.` +
          (context ? `\nהקשר: ${context}` : ""),
      }];
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    void mode;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load Agent settings (real-estate). The legacy `campaign_settings` table is
    // kept for backward compat but only the AI tone is used; political fields
    // (mandate_target, current_focus) are intentionally ignored.
    const { data: settingsRows } = await supabase
      .from("campaign_settings")
      .select("key, value");
    const settings = Object.fromEntries(
      (settingsRows ?? []).map((r: any) => [r.key, r.value])
    );

    const campaignContext = settings.ai_tone
      ? `AI Tone: ${settings.ai_tone}`
      : "Default tone: warm, professional Israeli real-estate Agent.";

    // RAG: pull KB chunks for the *requesting* user (auth header forwarded).
    // We fetch a wider window then split into "Past Conversation (WhatsApp)" vs "Reference Documents",
    // so the model can mirror the Agent's voice from past WhatsApp turns while citing factual docs.
    let kbContext = "(no Knowledge Base entries matched, answer briefly in the Agent's voice and offer to follow up; do NOT invent facts)";
    let kbSources: Array<{ id: string; title: string; similarity: number; source?: string }> = [];
    try {
      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content;
      const authHeader = req.headers.get("Authorization") ?? "";
      if (lastUserMsg && authHeader.startsWith("Bearer ")) {
        const kbRes = await fetch(`${supabaseUrl}/functions/v1/kb-query`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({ query: lastUserMsg, match_count: 10 }),
        });
        if (kbRes.ok) {
          const kbJson = await kbRes.json();
          const matches: any[] = kbJson?.matches ?? [];
          if (matches.length > 0) {
            // Hydrate source metadata so we can label WhatsApp chunks distinctly.
            const docIds = Array.from(new Set(matches.map((m) => m.document_id).filter(Boolean)));
            const { data: docs } = await supabase
              .from("knowledge_documents")
              .select("id, source_type, source_metadata")
              .in("id", docIds.length ? docIds : ["00000000-0000-0000-0000-000000000000"]);
            const docMap = new Map<string, { source_type?: string; source_metadata?: any }>();
            (docs ?? []).forEach((d: any) => docMap.set(d.id, d));

            const enriched = matches.map((m) => {
              const d = docMap.get(m.document_id) ?? {};
              const isWhatsApp =
                d.source_type === "whatsapp" ||
                d.source_metadata?.source === "WhatsApp" ||
                d.source_metadata?.category === "Past Conversation";
              return { ...m, isWhatsApp, sourceLabel: isWhatsApp ? "Past Conversation / WhatsApp" : "Reference Document" };
            });

            // Prefer up to 4 WhatsApp chunks for STYLE, then up to 4 doc chunks for FACTS.
            const wa = enriched.filter((m) => m.isWhatsApp).slice(0, 4);
            const docsChunks = enriched.filter((m) => !m.isWhatsApp).slice(0, 4);
            const ordered = [...wa, ...docsChunks];

            const fmt = (m: any, i: number) =>
              `[${i + 1}] (${m.sourceLabel}) title: "${m.document_title}" (similarity ${(m.similarity ?? 0).toFixed(2)})\n${m.content}`;
            const waBlock = wa.length
              ? `  PAST WHATSAPP CONVERSATIONS (use for STYLE / VOICE)  \n${wa.map((m, i) => fmt(m, i)).join("\n\n---\n\n")}`
              : "";
            const docsBlock = docsChunks.length
              ? `  REFERENCE DOCUMENTS (use for FACTS)  \n${docsChunks.map((m, i) => fmt(m, i + wa.length)).join("\n\n---\n\n")}`
              : "";
            kbContext = [waBlock, docsBlock].filter(Boolean).join("\n\n");

            const seen = new Map<string, { id: string; title: string; similarity: number; source?: string }>();
            ordered.forEach((m) => {
              const id = m.document_id ?? m.id;
              const sim = m.similarity ?? 0;
              if (!seen.has(id) || (seen.get(id)!.similarity < sim)) {
                seen.set(id, { id, title: m.document_title, similarity: sim, source: m.sourceLabel });
              }
            });
            kbSources = Array.from(seen.values()).slice(0, 6);
          }
        }
      }
    } catch (e) {
      console.warn("kb-query failed, continuing without KB:", e);
    }

    // Compliance Guardrails: load the user's verified listings (Homely-synced via the
    // `listings` table) and inject them into the system prompt so the AI can only
    // reference real prices/titles. We forward the auth header so RLS scopes results.
    let listingFacts: ListingFact[] = [];
    try {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (authHeader.startsWith("Bearer ")) {
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: lst } = await userClient
          .from("listings")
          .select("id, property_title, asking_price, slug, city, neighborhood, address, rooms, sqm, floor, parking, elevator, features")
          .eq("is_published", true)
          .limit(50);
        listingFacts = (lst || []) as ListingFact[];
      }
    } catch (e) {
      console.warn("listing fact-load failed:", e);
    }

    const compliance = COMPLIANCE_PROMPT.replace(
      "{{LISTING_FACTS}}",
      renderListingFacts(listingFacts),
    );

    // Virtual Twin persona, every drafted reply must sound like THIS Agent.
    const persona = await loadAgentPersona(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      req.headers.get("Authorization") ?? "",
    );
    const personaBlock = renderPersonaPrompt(persona);

    // Workspace-scoped owner-authored behavior rules (continuous learning layer).
    let systemRulesBlock = "";
    try {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (authHeader.startsWith("Bearer ")) {
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: uRes } = await userClient.auth.getUser();
        const uid = uRes?.user?.id;
        if (uid) {
          const lastUserText =
            [...(messages as Array<{ role: string; content: string }>)].reverse().find((m) => m.role === "user")?.content ?? "";
          systemRulesBlock = await fetchSystemRulesBlock(uid, String(lastUserText));
        }
      }
    } catch (e) {
      console.warn("fetchSystemRulesBlock failed:", e instanceof Error ? e.message : e);
    }

    // Hard pipeline separation, fetch the Lead's deal_type and inject a
    // forbid-list so the AI cannot offer mortgages to renters or rentals to buyers.
    let dealType: DealType | null = null;
    let resolvedLeadName: string | null = lead_name ?? null;
    let leadStage: string | null = null;
    let leadPreferences: any = {};
    if (lead_id) {
      try {
        const { data: leadRow } = await supabase
          .from("leads")
          .select("deal_type, full_name, preferences, lead_stage, status")
          .eq("id", lead_id)
          .maybeSingle();
        const dt =
          (leadRow?.deal_type as string | undefined) ||
          (leadRow?.preferences as any)?.listing_type;
        if (dt === "sale" || dt === "rent") dealType = dt;
        // Price-based fallback — the DB mixes buyers and renters. If the
        // lead has no explicit deal_type, infer it from their budget:
        // budget in the thousands → rent; budget ≥ ~100k (typically 1M+) → sale.
        if (!dealType) {
          const prefs = (leadRow?.preferences as any) ?? {};
          const budget = Number(
            prefs.budget_max ?? prefs.price_max ?? prefs.max_price ??
            prefs.budget_min ?? prefs.price_min ?? 0,
          );
          if (Number.isFinite(budget) && budget > 0) {
            if (budget < 50_000) dealType = "rent";
            else if (budget >= 100_000) dealType = "sale";
          }
        }
        if (!resolvedLeadName) resolvedLeadName = (leadRow?.full_name as string | undefined) ?? null;
        leadStage =
          (leadRow?.lead_stage as string | undefined) ??
          (leadRow?.status as string | undefined) ??
          null;
        leadPreferences = (leadRow?.preferences as any) ?? {};
      } catch (e) {
        console.warn("deal_type lookup failed:", e);
      }
    }
    const dealTypeBlock = renderDealTypeBlock(dealType, resolvedLeadName);
    const stageHatBlock = renderStageHatBlock(leadStage, resolvedLeadName);

    // === CHANNEL INTEGRITY: detect inbound channel + persisted pivot state ===
    // Read the latest inbound message from `messages` to learn which channel
    // the Lead actually wrote on this turn. Fall back to whatsapp.
    let inboundChannel: string | null = "whatsapp";
    let pivotAttempts = 0;
    if (lead_id) {
      try {
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("channel, platform, direction, sender_type, content, created_at")
          .eq("lead_id", lead_id)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        inboundChannel =
          (lastMsg?.channel as string | undefined) ||
          (lastMsg?.platform as string | undefined) ||
          "whatsapp";

        // Count pivot CTAs already sent on the current social thread.
        const channelLower = inboundChannel.toLowerCase();
        if (channelLower !== "whatsapp") {
          const { data: outBound } = await supabase
            .from("messages")
            .select("content, created_at")
            .eq("lead_id", lead_id)
            .eq("direction", "outbound")
            .eq("channel", channelLower)
            .order("created_at", { ascending: false })
            .limit(5);
          pivotAttempts = (outBound ?? []).filter((m: any) =>
            /WhatsApp/i.test(String(m?.content ?? ""))
          ).length;
        }
      } catch (e) {
        console.warn("channel lookup failed:", e);
      }
    }

    const channelState = (leadPreferences?.channel_state as any) ?? {};
    const channelBlock = renderChannelBlock({
      inboundChannel,
      leadName: resolvedLeadName,
      whatsappLink: (leadPreferences?.whatsapp_link as string | undefined) ?? null,
      primaryChannel: (channelState?.primary_channel as string | undefined) ?? null,
      inactiveChannels: Array.isArray(channelState?.inactive_channels)
        ? (channelState.inactive_channels as string[])
        : [],
      pivotAttempts,
    });

    const isInternalDashboard = !lead_id;

    // === MASTER AGENT MODE (internal dashboard chief-of-staff) ===
    // When the workspace owner/manager chats from the dashboard sidebar (no lead_id),
    // we DO NOT impersonate the human Agent. We act as their Master AI Agent /
    // chief of staff, and pre-fetch a live workspace snapshot scoped strictly by
    // user_id so the model answers with real data instead of asking generic questions.
    let liveDataBlock = "";
    if (isInternalDashboard) {
      try {
        const authHeader = req.headers.get("Authorization") ?? "";
        if (authHeader.startsWith("Bearer ")) {
          const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: uRes } = await userClient.auth.getUser();
          const uid = uRes?.user?.id;
          if (uid) {
            const [listingsRes, leadsRes, leadsCount, listingsCount] = await Promise.all([
              userClient.from("listings")
                .select("id, property_title, asking_price, features, description, office_notes, is_published, created_at")

                .eq("user_id", uid)
                .order("created_at", { ascending: false })
                .limit(25),
              userClient.from("leads")
                .select("id, full_name, city, interest_tag, engagement_score, status, lead_stage, deal_type, sentiment, preferences, last_interaction_at")
                .eq("assigned_to", uid)
                .order("last_interaction_at", { ascending: false, nullsFirst: false })
                .limit(25),
              userClient.from("leads").select("id", { count: "exact", head: true }).eq("assigned_to", uid),
              userClient.from("listings").select("id", { count: "exact", head: true }).eq("user_id", uid),
            ]);
            const listingsArr = (listingsRes.data ?? []) as any[];
            const leadsArr = (leadsRes.data ?? []) as any[];
            const fmtListing = (l: any) => {
              const f = l.features ?? {};
              const city = f.city ?? f.neighborhood ?? "";
              const rooms = f.rooms ?? f.room_count ?? "";
              const size = f.size_sqm ?? f.size ?? "";
              const price = l.asking_price ? `₪${Number(l.asking_price).toLocaleString()}` : "—";
              const officeNotes = l.office_notes ? ` | הערות משרד: ${String(l.office_notes).replace(/\s+/g, " ").slice(0, 200)}` : "";
              return `• [${String(l.id).slice(0,8)}] ${l.property_title ?? "(ללא כותרת)"} | ${city} | ${rooms} חד׳ | ${size} מ"ר | ${price}${l.is_published ? "" : " (טיוטה)"}${officeNotes}`;

            };
            const fmtLead = (v: any) => {
              const prefs = v.preferences ?? {};
              const want = prefs.desired_city ?? prefs.city ?? v.city ?? "";
              return `• [${String(v.id).slice(0,8)}] ${v.full_name ?? "—"} | אזור: ${want || "—"} | סוג: ${v.deal_type ?? "—"} | שלב: ${v.lead_stage ?? v.status ?? "—"} | סקור: ${v.engagement_score ?? 0} | סנט׳: ${v.sentiment ?? "—"}`;
            };
            liveDataBlock = [
              `LIVE WORKSPACE SNAPSHOT (scoped to current owner, user_id=${uid.slice(0,8)}…):`,
              `Totals: leads=${leadsCount.count ?? leadsArr.length}, listings=${listingsCount.count ?? listingsArr.length}`,
              "",
              `LISTINGS (${listingsArr.length} most recent):`,
              listingsArr.length ? listingsArr.map(fmtListing).join("\n") : "(אין נכסים פעילים)",
              "",
              `LEADS (${leadsArr.length} most recent):`,
              leadsArr.length ? leadsArr.map(fmtLead).join("\n") : "(אין לידים פעילים)",
            ].join("\n");
          }
        }
      } catch (e) {
        console.warn("master-agent live snapshot failed:", e);
      }
    }

    // === LIVE WEB RESEARCH (Master Intelligence Officer) ===
    // Auto-trigger Firecrawl-backed research when the owner asks about an
    // area, neighborhood, market comp, or explicitly requests a "תחקיר/מחקר".
    // The synthesized Hebrew brief is injected into the prompt AND persisted
    // into system_intelligence_kb so all downstream generators inherit it.
    let researchBlock = "";
    let researchSources: Array<{ url: string; title?: string }> = [];
    if (isInternalDashboard) {
      try {
        const lastUserText = String(
          [...(messages as Array<{ role: string; content: any }>)].reverse().find((m) => m.role === "user")?.content ?? "",
        );
        const RESEARCH_TRIGGER = /(תחקיר|מחקר|חקור|חקרי|בדוק לי|בדקי לי|שכונה|אזור|נייבורהוד|תכנון|תב"?ע|פרויקט חדש|נכס חדש|השווא|השוואה|בתי ספר|תחבורה|מחירים ב|neighborhood|research|comparative|zoning|market study)/i;
        const shouldResearch = enableResearchReq === true || (enableResearchReq !== false && RESEARCH_TRIGGER.test(lastUserText));
        if (shouldResearch && lastUserText.trim().length > 3) {
          const authHeader = req.headers.get("Authorization") ?? "";
          const r = await fetch(`${supabaseUrl}/functions/v1/master-research`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({ query: lastUserText.slice(0, 400), mode: "neighborhood" }),
          });
          if (r.ok) {
            const rj = await r.json();
            if (rj?.brief) {
              researchBlock = `LIVE WEB RESEARCH BRIEF (Firecrawl + Gemini synthesis, persisted to workspace KB):\n${String(rj.brief).slice(0, 6000)}`;
              researchSources = Array.isArray(rj?.sources) ? rj.sources : [];
            }
          } else {
            console.warn("master-research failed", r.status);
          }
        }
      } catch (e) {
        console.warn("master-research dispatch failed:", e);
      }
    }
    if (researchBlock) {
      liveDataBlock = (liveDataBlock ? liveDataBlock + "\n\n" : "") + researchBlock;
    }

    const MASTER_AGENT_PROMPT = `אתה ה-Master AI Agent — הרמטכ"ל הדיגיטלי (chief of staff) של בעל סביבת העבודה ב-Realtyz AI.
אתה מדבר עם המנהל/בעלים עצמו (לא עם לקוח קצה). פנה אליו בכבוד בגוף שני, כאל המפקד שלך.
אסור לך בשום אופן להציג את עצמך בשמו של בעל סביבת העבודה (למשל "היי, אני אודי ויטמן"). אינך מתחזה אליו — אתה הנכס התפעולי שלו.

עקרונות ביצוע:
1. עיגון בנתונים חיים: לפני שאתה עונה על שאלות על נכסים, לידים, מצב או מטריקות — קרא קודם את ה-LIVE WORKSPACE SNAPSHOT שמצורף למטה. אם חסר עומק, החזר שאילתת SELECT (LIMIT 50) על הטבלאות leads / listings / messages / chat_history / campaigns, ותמיד הוסף WHERE user_id = (המנהל הנוכחי) כשהעמודה קיימת.
2. גישת פתרון: אל תשאל את המנהל שאלות פתיחה גנריות ("איזה אזור?", "מה התקציב?"). הוא המנהל. במקום זה, שלוף התאמות מהנתונים, סנתז אותן, והצג 1-3 פעולות הבאות מומלצות.
3. סגנון: תכליתי, ישיר, עברית עסקית. ללא פתיחות AI גנריות, ללא התנצלויות, ללא בולטים מיותרים, ללא מקפים ארוכים.
4. אם הנתונים החיים אכן ריקים — אמור זאת במשפט אחד והצע צעד תפעולי קונקרטי (ייבוא, חיבור מקור, יצירת ליד/נכס).
5. אסור להמציא נכסים, לידים, מחירים או עסקאות שלא מופיעים ב-snapshot או בתוצאות ה-SQL.

RESPONSE FORMAT (JSON בלבד, ללא markdown):
- אם נדרשת שאילתה: {"type":"sql","query":"SELECT ... LIMIT 50","explanation":"הסבר קצר למנהל"}
- אם יש תשובה מוכנה מה-snapshot: {"type":"text","content":"תשובה תכליתית + הצעת פעולה"}

${liveDataBlock || "(snapshot לא נטען — ענה בקצרה והצע למנהל לחבר מקור נתונים)"}\n`;

    // === PROACTIVE CROSS-PROPERTY MATCHING ===
    // For lead-facing chats, surface 3-5 alternative listings from THIS owner's
    // workspace that match the lead's known preferences (deal_type, budget,
    // rooms, city/neighborhood). RLS via the user's auth header guarantees we
    // never leak listings from another workspace.
    let matchingBlock = "";
    if (!isInternalDashboard && lead_id) {
      try {
        const authHeader = req.headers.get("Authorization") ?? "";
        if (authHeader.startsWith("Bearer ")) {
          const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: authHeader } },
          });
          const prefs = (leadPreferences ?? {}) as any;
          const budgetMax = Number(prefs.budget_max ?? prefs.price_max ?? prefs.max_price ?? 0) || null;
          const budgetMin = Number(prefs.budget_min ?? prefs.price_min ?? 0) || null;
          const desiredCity = (prefs.desired_city ?? prefs.city ?? null) as string | null;
          const desiredRooms = Number(prefs.rooms ?? prefs.room_count ?? 0) || null;

          let q = userClient
            .from("listings")
            .select("id, property_title, asking_price, features, description, office_notes")
            .eq("is_published", true)
            .order("created_at", { ascending: false })
            .limit(30);
          if (budgetMax) q = q.lte("asking_price", Math.round(budgetMax * 1.15));
          if (budgetMin) q = q.gte("asking_price", Math.round(budgetMin * 0.85));

          const { data: candRows } = await q;
          let candidates = (candRows ?? []) as any[];

          // STRICT pipeline separation: extract listing_type from features and
          // drop anything that doesn't match the lead's deal_type. A rental
          // lead must NEVER see sale alternatives, and vice-versa. When the
          // listing has no explicit listing_type, fall back to a price-based
          // heuristic (price < 50k → rent, price ≥ 100k → sale) so the mixed
          // buyer/renter DB still routes cleanly.
          const extractType = (features: any, price?: any): "sale" | "rent" | null => {
            const fromFeatures = (f: any): "sale" | "rent" | null => {
              if (f && typeof f === "object" && "listing_type" in f) {
                const v = String((f as any).listing_type ?? "").toLowerCase();
                if (v === "rent" || v === "sale") return v;
              }
              return null;
            };
            if (Array.isArray(features)) {
              for (const f of features) {
                const v = fromFeatures(f);
                if (v) return v;
              }
            } else {
              const v = fromFeatures(features);
              if (v) return v;
            }
            const n = Number(price ?? 0);
            if (Number.isFinite(n) && n > 0) {
              if (n < 50_000) return "rent";
              if (n >= 100_000) return "sale";
            }
            return null;
          };
          if (dealType === "rent" || dealType === "sale") {
            candidates = candidates.filter((l) => {
              const t = extractType(l.features, l.asking_price);
              // If we cannot classify at all, drop it from the strict pipeline
              // rather than risk leaking the wrong side.
              return t === dealType;
            });
          }

          // Soft-score by rooms/city overlap; keep top 5.
          const scored = candidates.map((l) => {
            const f = l.features ?? {};
            let score = 0;
            if (desiredRooms && Number(f.rooms ?? f.room_count) === desiredRooms) score += 3;
            if (desiredCity) {
              const lc = String(f.city ?? f.neighborhood ?? "").toLowerCase();
              if (lc && lc.includes(String(desiredCity).toLowerCase())) score += 2;
            }
            if (budgetMax && Number(l.asking_price) <= budgetMax) score += 1;
            return { l, score };
          }).sort((a, b) => b.score - a.score).slice(0, 5);

          if (scored.length > 0) {
            const isRent = dealType === "rent";
            const priceLabel = isRent ? "שכ\"ד" : "מחיר";
            const fmt = (l: any) => {
              const f = l.features ?? {};
              const city = f.city ?? f.neighborhood ?? "—";
              const rooms = f.rooms ?? f.room_count ?? "—";
              const sqm = f.size_sqm ?? f.size ?? "—";
              const price = l.asking_price ? `₪${Number(l.asking_price).toLocaleString()}${isRent ? "/חודש" : ""}` : "—";
              const notes = l.office_notes ? `\n   הערות משרד: ${String(l.office_notes).replace(/\s+/g, " ").slice(0, 240)}` : "";
              return `• ${l.property_title ?? "(ללא כותרת)"} | ${city} | ${rooms} חד׳ | ${sqm} מ"ר | ${priceLabel}: ${price}${notes}`;
            };

            const directiveLines: string[] = [];
            if (isRent) {
              directiveLines.push(
                "- Weave 1-2 of these RENTAL alternatives naturally, e.g. \"חוץ מהנכס הזה יש לי גם דירה להשכרה ב-X בתקציב דומה, פנויה לכניסה בקרוב\". NEVER offer a property למכירה — זה ליד שכירות.",
                "- Use rental terminology only: שכ\"ד חודשי / דמי שכירות / שכר דירה / פנויה לכניסה / חוזה. Forbidden: מחיר מבוקש, רכישה, משכנתא, mortgage, purchase.",
              );
            } else if (dealType === "sale") {
              directiveLines.push(
                "- Weave 1-2 of these SALE alternatives naturally; NEVER offer a rental to a sale lead.",
                "- Use sale terminology only: מחיר מבוקש / רכישה / משכנתא / mortgage / purchase. Forbidden: שכ\"ד / דמי שכירות / lease.",
              );
            } else {
              directiveLines.push("- Weave 1-2 alternatives naturally; keep it conversational.");
            }
            directiveLines.push(
              "- Match the ±15% budget margin strictly around the primary property's price.",
              "- Never list more than 2 alternatives in a single message — keep it conversational, not a catalog.",
              "- Only reference listings from the block above. Do NOT invent prices, addresses, or features.",
            );
            const qualBlock = isRent
              ? "HIGH-YIELD QUALIFICATION QUESTIONS (rental persona — ask ONE per turn, only if missing from preferences):\n- \"לכמה זמן אתם מחפשים לשכור?\"\n- \"מה מועד הכניסה המועדף עליכם?\"\n- \"צריכים חניה או מעלית?\"\n- \"כמה דיירים יגורו בנכס?\"\n- תקציב שכ\"ד חודשי מקסימלי."
              : "HIGH-YIELD QUALIFICATION QUESTIONS (sale persona — ask ONE per turn, only if missing from preferences):\n- Exact budget ceiling and floor (₪).\n- Preferred move-in date / urgency window.\n- Parking requirement (none / 1 / 2+).\n- Floor preference (low / mid / high / no preference) and elevator need.\n- Number of rooms and minimum size in מ\"ר.\n- Must-have neighborhoods or streets to exclude.";
            matchingBlock = [
              `MATCHING LISTINGS (scoped strictly to this owner's workspace via RLS, ${
                isRent ? "RENTAL ONLY" : dealType === "sale" ? "SALE ONLY" : "type-mixed"
              } — never invent or pull from other workspaces):`,
              scored.map((s) => fmt(s.l)).join("\n"),
              "",
              "PROACTIVE MATCHING DIRECTIVE:",
              directiveLines.join("\n"),
              "",
              qualBlock,
              "The more property details we unlock from the lead, the cleaner our database mapping becomes — but never interrogate; weave one question per reply.",
            ].join("\n");
          }
        }
      } catch (e) {
        console.warn("proactive matching lookup failed:", e);
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // WEBTIV LIVE SEARCH TOOL (homely/webtiv2 external agent search)
    // Fires when either:
    //   a) the local `matchingBlock` came back empty (no in-workspace hits
    //      for the lead's preferences), or
    //   b) the user explicitly asks for a wider search — "בכל השוק",
    //      "מחוץ למערכת", "עוד אפשרויות", "homely", "webtiv", "external",
    //      "broader" etc.
    // The tool hits `homely-fetch-property` with action=`searchProperties`,
    // which proxies the office's public Webtiv AutomaionJson stream and
    // returns properties in the SAME shape as internal listings (title,
    // price, city, rooms, photo). Results are:
    //   1. injected as a text block into the system prompt so the model
    //      can weave them into its reply, and
    //   2. returned to the client as `webtiv_results` so the drawer can
    //      render property cards with the correct thumbnail image.
    // ───────────────────────────────────────────────────────────────────────
    let webtivBlock = "";
    let webtivResults: Array<{
      id: string; title: string; price: number; city: string; rooms: number;
      sqm: number; floor: number; photo: string | null; agent: string | null;
      transaction_type: "sale" | "rent"; source_url: string | null;
    }> = [];
    try {
      const lastUserTextForWebtiv = String(
        [...(messages as Array<{ role: string; content: any }>)]
          .reverse().find((m) => m.role === "user")?.content ?? "",
      );
      const EXTERNAL_TRIGGER = /(webtiv|homely|בכל השוק|כל השוק|מחוץ למערכת|שוק חיצוני|external|broader|עוד אפשרויות|לחפש עוד|תראה לי עוד|יש לך עוד|חיפוש חיצוני|חיפוש בכל|כל המשרד)/i;
      const NEIGHBORHOOD_HINT = /(שכונ|נייבורהוד|רובע|neighborhood|אזור\s+\S+)/i;
      const userWantsExternal = EXTERNAL_TRIGGER.test(lastUserTextForWebtiv);
      const localWasEmpty = !matchingBlock;
      const hasSearchableIntent = userWantsExternal
        || (localWasEmpty && (NEIGHBORHOOD_HINT.test(lastUserTextForWebtiv) || /נכס|דירה|בית|פנטהאוז/i.test(lastUserTextForWebtiv)));

      if (hasSearchableIntent) {
        // Extract filters from the parsed anchor + lead preferences.
        const prefs = ((typeof leadPreferences === "object" && leadPreferences) || {}) as any;
        const cityGuess = (prefs.desired_city ?? prefs.city ?? "") as string;
        const cities: string[] = [];
        // Anchor is populated a few lines below, but we haven't reached
        // that block yet — re-parse the city from the user text so this
        // step stays self-contained.
        const cityList = ["הרצליה","תל אביב","תל-אביב","רמת גן","רמת-גן","רעננה","כפר סבא","נתניה","חיפה","ירושלים","ראשון לציון","חולון","בת ים","פתח תקווה","גבעתיים","אשדוד","אשקלון","באר שבע","מודיעין","רחובות","הוד השרון","רמת השרון"];
        for (const c of cityList) if (lastUserTextForWebtiv.includes(c)) { cities.push(c); break; }
        if (!cities.length && cityGuess) cities.push(cityGuess);

        const roomsMatch = lastUserTextForWebtiv.match(/(\d+(?:\.\d+)?)\s*חדרים/);
        const rooms = roomsMatch ? roomsMatch[1] : (prefs.rooms ? String(prefs.rooms) : "");
        const deal = /להשכרה|שכירות|לשכר/i.test(lastUserTextForWebtiv)
          ? "rent"
          : /למכירה|רכישה|לקנות/i.test(lastUserTextForWebtiv)
            ? "sale"
            : (dealType === "rent" || dealType === "sale") ? dealType : "";
        const searchText = (lastUserTextForWebtiv.match(NEIGHBORHOOD_HINT)?.[0] ?? "").replace(/(שכונת|באזור|באזור\s+)/g, "").trim();

        const authHeader = req.headers.get("Authorization") ?? "";
        if (authHeader.startsWith("Bearer ")) {
          try {
            const searchRes = await fetch(`${supabaseUrl}/functions/v1/homely-fetch-property`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: authHeader },
              body: JSON.stringify({
                action: "searchProperties",
                filters: {
                  cities,
                  rooms,
                  deal,
                  search: searchText,
                },
              }),
            });
            if (searchRes.ok) {
              const sj = await searchRes.json();
              const props = Array.isArray(sj?.properties) ? sj.properties : [];
              webtivResults = props.slice(0, 8).map((p: any) => ({
                id: String(p.homely_id ?? p.serial ?? ""),
                title: String(p.title ?? p.property_title ?? "נכס"),
                price: Number(p.price ?? 0) || 0,
                city: String(p.city ?? ""),
                rooms: Number(p.rooms ?? 0) || 0,
                sqm: Number(p.sqm ?? 0) || 0,
                floor: Number(p.floor ?? 0) || 0,
                photo: p.photo ?? (Array.isArray(p.photos) ? p.photos[0] : null) ?? null,
                agent: p.agent ?? null,
                transaction_type: p.transaction_type === "rent" ? "rent" : "sale",
                source_url: p.source_url ?? null,
              }));
              if (webtivResults.length) {
                const priceLabel = (t: string) => (t === "rent" ? "שכ\"ד" : "מחיר");
                webtivBlock = [
                  `WEBTIV LIVE SEARCH RESULTS (${webtivResults.length} נכסים חיים מ-Homely/Webtiv2, סינון: cities=${cities.join(",") || "—"} rooms=${rooms || "—"} deal=${deal || "—"} q=${searchText || "—"}):`,
                  ...webtivResults.map((r) => (
                    `• [${r.id}] ${r.title} | ${r.city || "—"} | ${r.rooms || "—"} חד׳ | ${r.sqm || "—"} מ"ר | ${priceLabel(r.transaction_type)}: ${r.price ? `₪${r.price.toLocaleString("he-IL")}${r.transaction_type === "rent" ? "/חודש" : ""}` : "—"}${r.agent ? ` | סוכן: ${r.agent}` : ""}${r.photo ? ` | image: ${r.photo}` : ""}`
                  )),
                  "",
                  "WEBTIV DIRECTIVE:",
                  "- Treat these as LIVE external results from the office's Webtiv/Homely feed — same reliability tier as the internal listings block.",
                  "- Surface at most 3 in your reply, in the SAME format as internal listings (title, city, rooms, price).",
                  "- Never invent a photo URL — the client renders the actual thumbnails from the structured `webtiv_results` payload alongside your text.",
                  "- If the lead had zero internal matches, explicitly say something like: \"מצאתי מספר אופציות חיצוניות רלוונטיות במשרד\" ולאחר מכן פרט 2-3 מהתוצאות.",
                ].join("\n");
              }
            } else {
              console.warn("[webtiv_search] non-ok", searchRes.status);
            }
          } catch (e) {
            console.warn("[webtiv_search] fetch failed", (e as Error).message);
          }
        }
      }
    } catch (e) {
      console.warn("[webtiv_search] outer failure", (e as Error).message);
    }


    // ───────────────────────────────────────────────────────────────────────
    // MARKET INTEL TOOL (live web research — Firecrawl search)
    // Triggered when the user asks for sold prices, comparables, area
    // evaluation, or pricing trends for a specific address / neighborhood.
    // Results feed both:
    //   1. a MARKET_INTEL block injected into the system prompt so the model
    //      grounds its summary in real sources, and
    //   2. `market_intel` in the response payload so the client can render
    //      the sources under the assistant bubble.
    // ───────────────────────────────────────────────────────────────────────
    let marketIntelBlock = "";
    let marketIntelResults: {
      address: string;
      query: string;
      sources: Array<{ title: string; url: string; snippet: string }>;
    } = { address: "", query: "", sources: [] };

    try {
      const lastUserTextForIntel = String(
        [...(messages as Array<{ role: string; content: string }>)]
          .reverse().find((m) => m.role === "user")?.content ?? "",
      );
      const MARKET_INTEL_TRIGGER = /(מחיר[יו]?\s+עסקאות|היסטורי[יה]?\s+עסקאות|עסקאות\s+אחרונות|נמכר[הו]?\s+לאחרונה|מגמת\s+מחיר|הערכת\s+שווי|כמה\s+שווה|כמה\s+נמכר|comparable|comps?\b|sold\s+price|price\s+history|market\s+intel|area\s+evaluation|market\s+trend)/i;
      const wantsIntel = MARKET_INTEL_TRIGGER.test(lastUserTextForIntel);
      const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
      if (wantsIntel && FIRECRAWL_API_KEY) {
        // Build a targeted query from any address/city hints in the text.
        const cityListMi = ["הרצליה","תל אביב","תל-אביב","רמת גן","רמת-גן","רעננה","כפר סבא","נתניה","חיפה","ירושלים","ראשון לציון","חולון","בת ים","פתח תקווה","גבעתיים","אשדוד","אשקלון","באר שבע","מודיעין","רחובות","הוד השרון","רמת השרון"];
        let cityHit = "";
        for (const c of cityListMi) { if (lastUserTextForIntel.includes(c)) { cityHit = c; break; } }
        const streetHit = lastUserTextForIntel.match(/(?:רחוב|רח'|ברחוב)\s+([\u0590-\u05FFA-Za-z'״"\-]+(?:\s+[\u0590-\u05FFA-Za-z'״"\-]+){0,2})/)?.[1]?.trim() ?? "";
        const anchorText = [streetHit, cityHit].filter(Boolean).join(" ") || lastUserTextForIntel.slice(0, 120);
        marketIntelResults.address = anchorText;
        const q = `עסקאות נדל"ן אחרונות מחירים ${anchorText} site:nadlan.gov.il OR site:madlan.co.il OR site:yad2.co.il`;
        marketIntelResults.query = q;

        try {
          const fcRes = await fetch("https://api.firecrawl.dev/v1/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
            body: JSON.stringify({ query: q, limit: 6 }),
          });
          if (fcRes.ok) {
            const fj = await fcRes.json();
            const items = Array.isArray(fj?.data) ? fj.data : Array.isArray(fj?.results) ? fj.results : [];
            marketIntelResults.sources = items.slice(0, 6).map((it: any) => ({
              title: String(it.title ?? it.url ?? "").slice(0, 200),
              url: String(it.url ?? ""),
              snippet: String(it.description ?? it.snippet ?? it.markdown ?? "").replace(/\s+/g, " ").slice(0, 400),
            })).filter((s: any) => s.url);
          } else {
            console.warn("[market_intel] firecrawl non-ok", fcRes.status);
          }
        } catch (e) {
          console.warn("[market_intel] firecrawl failed", (e as Error).message);
        }
        if (marketIntelResults.sources.length) {
          marketIntelBlock = [
            `MARKET INTEL — LIVE WEB RESEARCH (${marketIntelResults.sources.length} מקורות עבור "${anchorText}"):`,
            ...marketIntelResults.sources.map((s, i) => `[${i + 1}] ${s.title}\n    ${s.url}\n    ${s.snippet}`),
            "",
            "MARKET INTEL DIRECTIVE:",
            "- סכם בקצרה (3-5 שורות) עסקאות סגורות אחרונות, טווח מחירים, ומגמת מחירים לאזור/כתובת המבוקשים.",
            "- ציין מספרים ספציפיים כשהם מופיעים במקורות (₪/מ\"ר, שינוי YoY, מספר עסקאות).",
            "- אם המידע חלקי — אמור זאת בכנות, לא להמציא.",
            "- סמן מקורות בסוגריים מרובעים [1], [2]... שיתאימו לרשימה למעלה; ה-UI מרנדר את הקישורים.",
          ].join("\n");
        }
      }
    } catch (e) {
      console.warn("[market_intel] outer failure", (e as Error).message);
    }



    // ───────────────────────────────────────────────────────────────────────
    // PROPERTY ANCHOR EXTRACTION (HARD GROUNDING)
    // Parse street / city / rooms / price / deal-type directly from the
    // latest inbound text. Even if the DB lookup returns null, the AI MUST
    // treat these regex hits as ground truth and lead the response with them.
    // No "I'll check the system" fallbacks allowed.
    // ───────────────────────────────────────────────────────────────────────
    const lastUserTextForAnchor = String(
      [...(messages as Array<{ role: string; content: string }>)]
        .reverse().find((m) => m.role === "user")?.content ?? "",
    );
    const anchor: Record<string, string> = {};
    {
      const txt = lastUserTextForAnchor;
      const street = txt.match(/(?:רחוב|רח'|ברחוב)\s+([\u0590-\u05FFA-Za-z'״"\-]+(?:\s+[\u0590-\u05FFA-Za-z'״"\-]+){0,2})/);
      if (street) anchor.street = street[1].trim();
      const cityList = ["הרצליה","תל אביב","תל-אביב","רמת גן","רמת-גן","רעננה","כפר סבא","נתניה","חיפה","ירושלים","ראשון לציון","חולון","בת ים","פתח תקווה","גבעתיים","אשדוד","אשקלון","באר שבע","מודיעין","רחובות","הוד השרון","רמת השרון"];
      for (const c of cityList) { if (txt.includes(c)) { anchor.city = c; break; } }
      const rooms = txt.match(/(\d+(?:\.\d+)?)\s*חדרים/);
      if (rooms) anchor.rooms = rooms[1];
      const price = txt.match(/([\d][\d,\.]{2,})\s*(?:₪|ש"ח|ש״ח|שח|שקל)/);
      if (price) anchor.price = price[1].replace(/\./g, "").replace(/,/g, ",");
      if (/למכירה/.test(txt)) anchor.deal = "למכירה";
      else if (/להשכרה|לשכירות/.test(txt)) anchor.deal = "להשכרה";
    }
    const hasAnchor = Object.keys(anchor).length > 0;
    const propertyAnchorBlock = hasAnchor
      ? [
          "[PROPERTY ANCHOR — GROUND TRUTH PARSED FROM THE LEAD'S MESSAGE]",
          "These facts came directly from the lead. Treat them as 100% verified.",
          anchor.deal   ? `- סטטוס עסקה: ${anchor.deal}` : "",
          anchor.rooms  ? `- חדרים: ${anchor.rooms}` : "",
          anchor.street ? `- רחוב: ${anchor.street}` : "",
          anchor.city   ? `- עיר: ${anchor.city}` : "",
          anchor.price  ? `- מחיר: ${anchor.price} ₪` : "",
          "MANDATE: פתח את התשובה באישור הפרטים האלה במשפט אחד טבעי, בגוף ראשון, כסוכן המכיר את הנכס מצוין.",
        ].filter(Boolean).join("\n")
      : "";

    const noFallbackBlock = [
      "[ABSOLUTE BAN ON 'I DON'T KNOW' FALLBACKS — HIGHEST PRIORITY]",
      "אסור בתכלית האיסור להשתמש בביטויים הבאים או בכל וריאציה שלהם:",
      "- \"אין לי פרטים\" / \"אין לי מידע ספציפי\" / \"אין לי את הפרטים\"",
      "- \"אני צריך לבדוק במערכת\" / \"אבדוק במערכת\" / \"תן לי לבדוק\"",
      "- \"אחזור אליך עם פרטים\" / \"אחזור אליך אחר כך\"",
      "- \"לא מוצא את הדירה\" / \"הנכס לא מופיע אצלי\" / \"לא מצאתי את הנכס\"",
      "אתה הסוכן שמכיר את הנכס הזה הכי טוב בעולם. גם אם חיפוש ה-DB לא החזיר רשומה,",
      "השתמש בנתונים מ-PROPERTY ANCHOR (נחשבים אמת מוחלטת) כדי לעגן את התשובה בביטחון.",
      "",
      "מבנה חובה לתשובה הראשונה לפנייה על נכס (קצר, אנושי, אנטי-ספאם):",
      "1) פתיחה קלילה וקצרה (משפט אחד בלבד) שמאשרת את הנכס. הימנע מצמדים של נתונים טכניים באותו משפט (חדרים+רחוב+עיר+מחיר ביחד = דפוס ספאם). העבר נתון או שניים בלבד בפתיחה, את היתר השאר לשיחת המשך.",
      "   דוגמה טובה: \"היי! כן, הדירה ברחוב צמרות עדיין רלוונטית 🙂\"",
      "   דוגמה רעה (אסור): \"מדובר בדירת 3.5 חדרים מצוינת ברחוב צמרות שבהרצליה במחיר 3,590,000 ₪.\"",
      "2) שאלה אחת ממוקדת ופשוטה (כיווני אוויר / פינוי / מימון / מטרת הרכישה).",
      "3) הצעה קצרה לתאם סיור.",
      "",
      "כללי אנטי-ספאם נוקשים:",
      "- אורך כולל של ההודעה הראשונה: עד 280 תווים. אל תחרוג.",
      "- אל תדחוס יותר משני נתונים מספריים (חדרים, מחיר, ת.ר.) באותה פסקה.",
      "- פצל לשורות קצרות (שורת ריווח בין רעיונות) במקום פסקה דחוסה אחת.",
      "- כתוב עברית טבעית בלבד, בלי כוכביות/מרקדאון, בלי מילים באנגלית, בלי קווים מפרידים (— -- ---).",
      "- מותר אימוג'י אחד עדין לכל היותר (🙂/👍/✨) — לא חובה.",
    ].join("\n");


    const systemPrompt = (systemRulesBlock ? systemRulesBlock + "\n\n" : "") + (isInternalDashboard
      ? MASTER_AGENT_PROMPT + (webtivBlock ? "\n\n" + webtivBlock : "") + (marketIntelBlock ? "\n\n" + marketIntelBlock : "")
      : SCHEMA_CONTEXT
          .replace("{{CAMPAIGN_CONTEXT}}", campaignContext)
          .replace("{{KB_CONTEXT}}", kbContext)
          + (personaBlock ? "\n\n" + personaBlock : "")
          + "\n\n" + dealTypeBlock
          + "\n\n" + stageHatBlock
          + "\n\n" + channelBlock
          + "\n\n" + compliance
          + (matchingBlock ? "\n\n" + matchingBlock : "")
          + (webtivBlock ? "\n\n" + webtivBlock : "")
          + (marketIntelBlock ? "\n\n" + marketIntelBlock : "")
          + (propertyAnchorBlock ? "\n\n" + propertyAnchorBlock : "")

          + "\n\n" + noFallbackBlock
          + "\n\n[GROUNDING + ADAPTIVE CROSS-SELL DIRECTIVE]\n"
          + "1. BASELINE GROUNDING: Anchor the conversation on the specific property the lead asked about. Use the PROPERTY ANCHOR block as ground truth — never say you need to 'check the system'. Answer their direct questions about THIS property first, using the workspace KB and the listings block above. Never invent attributes that aren't in the anchor, KB, or listings table.\n"
          + "2. ADAPTIVE CROSS-SELL: The moment the lead signals friction (price too high / too low, wrong rooms, wrong area, asks for 'other options', 'משהו אחר', 'יותר זול', 'יקר מדי', 'אולי משהו דומה'), pivot smoothly and surface 1-2 alternatives from the MATCHING LISTINGS block — same deal_type only, within ±15% budget.\n"
          + "3. MATCHMAKING GOAL: Keep the lead engaged turn after turn. After each answer, weave in ONE high-yield qualification question to tighten the match (timeline, budget ceiling, parking, floor, move-in date). Never interrogate — one question per reply, conversational.");


    // Persist WhatsApp Pivot agreement: if the Lead's latest inbound says "yes"
    // (or shares a phone number) on a NON-WhatsApp social channel and we already
    // sent at least one pivot CTA, flip channel_state so the social channel is
    // marked INACTIVE and primary_channel becomes 'whatsapp' for all future turns.
    try {
      if (lead_id && inboundChannel && inboundChannel.toLowerCase() !== "whatsapp" && pivotAttempts >= 1) {
        const lastUserText = [...messages].reverse().find((m: any) => m.role === "user")?.content;
        if (detectWhatsAppPivotAgreement(String(lastUserText ?? ""))) {
          const inactive = new Set<string>(
            (Array.isArray(channelState?.inactive_channels)
              ? (channelState.inactive_channels as string[])
              : []
            ).map((c) => c.toLowerCase()),
          );
          inactive.add(inboundChannel.toLowerCase());
          const nextPrefs = {
            ...(leadPreferences ?? {}),
            channel_state: {
              ...(channelState ?? {}),
              primary_channel: "whatsapp",
              inactive_channels: Array.from(inactive),
              pivoted_at: new Date().toISOString(),
              pivoted_from: inboundChannel.toLowerCase(),
            },
          };
          await supabase
            .from("leads")
            .update({ preferences: nextPrefs })
            .eq("id", lead_id);
        }
      }
    } catch (e) {
      console.warn("channel pivot persistence failed:", e);
    }


    // Escalation Trigger: classify the most recent lead/user message.
    // When a high-risk topic is detected, fire-and-forget the alert function
    // so the human Agent gets a WhatsApp ping while we still draft a safe reply.
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content;
    let escalation: any = null;
    if (lastUserMsg) {
      const hit = classifyEscalation(String(lastUserMsg));
      if (hit) {
        escalation = hit;
        const authHeader = req.headers.get("Authorization") ?? "";
        if (authHeader.startsWith("Bearer ")) {
          // Fire & forget, we don't await so it doesn't block the reply.
          fetch(`${supabaseUrl}/functions/v1/escalation-alert`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({
              lead_message: String(lastUserMsg).slice(0, 4000),
              category: hit.category,
              matched_keywords: hit.matched,
              severity: hit.severity,
              channel: "deal_room",
            }),
          }).catch((e) => console.warn("escalation-alert dispatch failed:", e));
        }
      }
    }

    // Smart Property Extraction (fire-and-forget): scan the latest lead message
    // for structured property data. If a real listing is detected, the helper
    // edge function inserts a PENDING listings row for the Agent to confirm
    // from the dashboard. Never block the user's reply on this.
    if (lastUserMsg && lead_id) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (authHeader.startsWith("Bearer ")) {
        const ctxMessages = (messages as Array<{ role: string; content: string }>)
          .slice(-6)
          .map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 600) }));
        fetch(`${supabaseUrl}/functions/v1/extract-property`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({
            lead_id,
            text: String(lastUserMsg).slice(0, 4000),
            context_messages: ctxMessages,
          }),
        }).catch((e) => console.warn("extract-property dispatch failed:", e));
      }
    }

    // === MULTI-VARIANT MODE ===
    // When the caller asks for N short variants (Deal Room "pick the best"), we
    // skip SQL routing and directly produce N parallel short Hebrew drafts.
    if (variantCount > 1) {
      const variantSystem =
        systemPrompt +
        `\n\nVARIANT MODE: Produce ONE short draft reply only (1-2 sentences, max ~280 chars), in Hebrew, in the Agent's voice. ` +
        `No JSON, no preamble, no explanations — return the message text only. ` +
        `Vary the angle/opening between calls (do NOT repeat the same wording).`;

      const maskedMsgs = maskMessages(messages as Array<{ role: string; content: string }>).messages;

      const callOnce = async (i: number) => {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            temperature: 0.85 + i * 0.05,
            messages: [
              { role: "system", content: variantSystem },
              ...maskedMsgs,
              { role: "user", content: `נסח גרסה קצרה ${i + 1} (שונה מהגרסאות האחרות).` },
            ],
          }),
        });
        if (!r.ok) return "";
        const j = await r.json();
        return String(j?.choices?.[0]?.message?.content ?? "")
          .replace(/^```[a-z]*\n?/i, "")
          .replace(/```$/, "")
          .trim();
      };

      const variantResults = await Promise.all(
        Array.from({ length: variantCount }, (_, i) => callOnce(i)),
      );
      const cleaned = variantResults.map((s) => s.trim()).filter(Boolean);
      if (cleaned.length === 0) {
        return new Response(JSON.stringify({ error: "AI gateway returned no variants" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const fact_violations = factCheckDraft(cleaned[0], listingFacts);
      return new Response(JSON.stringify({
        type: "text",
        content: cleaned[0],
        variants: cleaned,
        sources: kbSources,
        escalation,
        fact_violations,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Ask AI to generate SQL or text response (legacy single-shot path)
    // Multi-modal attachments (PDFs / images / audio) are attached to the last
    // user message only on Master Agent calls so the model can analyze them.
    const baseMasked = maskMessages(messages as Array<{ role: string; content: string }>).messages;
    let outgoingMessages: any[] = baseMasked as any[];
    if (isInternalDashboard && attachments.length > 0 && outgoingMessages.length > 0) {
      const cloned = outgoingMessages.map((m) => ({ ...m }));
      const lastIdx = [...cloned].reverse().findIndex((m) => m.role === "user");
      if (lastIdx !== -1) {
        const idx = cloned.length - 1 - lastIdx;
        const textPart = { type: "text", text: String(cloned[idx].content ?? "") };
        const attachmentParts: any[] = [];
        for (const a of attachments.slice(0, 6)) {
          const mime = String(a.mime ?? "").toLowerCase();
          const dataUrl = a.data_url || a.url || "";
          if (!dataUrl) continue;
          if (mime.startsWith("image/")) {
            attachmentParts.push({ type: "image_url", image_url: { url: dataUrl } });
          } else if (mime === "application/pdf" || /\.pdf(\?|$)/i.test(dataUrl) || /\.pdf$/i.test(a.name ?? "")) {
            attachmentParts.push({ type: "file", file: { filename: a.name || "doc.pdf", file_data: dataUrl } });
          }
        }
        cloned[idx] = { role: "user", content: [textPart, ...attachmentParts] };
        outgoingMessages = cloned;
      }
    }

    // When attachments OR research are present in Master Agent mode, relax the
    // strict JSON-only contract so the model can return a rich Hebrew brief.
    const richResponseHint = isInternalDashboard && (attachments.length > 0 || !!researchBlock)
      ? `\n\nRESPONSE OVERRIDE: למשימה זו (קבצים מצורפים או תקציר מחקר חי), החזר JSON בצורת {"type":"text","content":"..."} כאשר content הוא תקציר עברית מובנה עם כותרות ## ולפחות 5 צעדים מעשיים. אל תחזיר SQL.`
      : "";

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: attachments.length > 0 || researchBlock ? 2400 : 1200,
        messages: [
          { role: "system", content: systemPrompt + richResponseHint },
          // PII MASKING (Compliance Layer): scrub IDs / cards / IBANs /
          // emails / phones from the chat history before it leaves our
          // backend. The originals stay in Supabase for the human Agent.
          ...outgoingMessages,
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "מגבלת בקשות, נסה שוב בעוד רגע" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "נדרשת הוספת קרדיטים ל-AI" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content?.trim() || "";

    // ─── Persist Market Intel findings for long-term agent memory ────────
    // Any turn that surfaced Firecrawl-backed market research is logged so
    // future agent calls (and analytics) can recall prior area evaluations
    // without re-running the search.
    if (marketIntelResults.sources.length && marketIntelResults.address) {
      try {
        // Try to derive summary text out of the model reply.
        let summary = rawContent;
        try {
          const cleanedForSummary = rawContent.replace(/^```(?:json)?\n?/gm, "").replace(/\n?```$/gm, "").trim();
          const p = JSON.parse(cleanedForSummary);
          if (p && typeof p.content === "string") summary = p.content;
        } catch { /* rawContent is plain text — keep as-is */ }

        let createdBy: string | null = null;
        try {
          const authHeader = req.headers.get("Authorization") ?? "";
          if (authHeader.startsWith("Bearer ")) {
            const u = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
              global: { headers: { Authorization: authHeader } },
            });
            const { data: uRes } = await u.auth.getUser();
            createdBy = uRes?.user?.id ?? null;
          }
        } catch { /* service-role path: leave created_by null */ }

        await supabase.from("market_research_logs").insert({
          address: marketIntelResults.address.slice(0, 500),
          agent_summary: String(summary || "").slice(0, 8000),
          property_evaluation_data: {
            query: marketIntelResults.query,
            sources: marketIntelResults.sources,
          },
          created_by: createdBy,
          metadata: {
            lead_id: lead_id ?? null,
            lead_name: resolvedLeadName ?? null,
            mode: mode ?? null,
            source_provider: "firecrawl",
          },
        });
      } catch (e) {
        console.warn("[market_intel] persist to market_research_logs failed", (e as Error).message);
      }
    }


    // Parse AI response
    let parsed;
    try {
      const cleaned = rawContent.replace(/^```(?:json)?\n?/gm, "").replace(/\n?```$/gm, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({
        type: "text",
        content: rawContent,
        escalation,
        research_sources: researchSources,
        webtiv_results: webtivResults, market_intel: marketIntelResults,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsed.type === "text") {
      // Fact-check the AI's draft against verified listings.
      const fact_violations = factCheckDraft(String(parsed.content || ""), listingFacts);
      return new Response(JSON.stringify({ ...parsed, sources: kbSources, research_sources: researchSources, escalation, fact_violations, webtiv_results: webtivResults, market_intel: marketIntelResults }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Execute the SQL query with safety checks
    if (parsed.type === "sql" && parsed.query) {
      let query = parsed.query.trim();

      // Security: only allow SELECT
      if (!query.toUpperCase().startsWith("SELECT")) {
        return new Response(JSON.stringify({
          type: "text",
          content: "⛔ מותר רק שאילתות קריאה (SELECT). פעולה זו נחסמה.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Force LIMIT if missing
      if (!/\bLIMIT\s+\d+/i.test(query)) {
        query = query.replace(/;?\s*$/, " LIMIT 50");
      } else {
        // Cap existing LIMIT to 50
        query = query.replace(/\bLIMIT\s+(\d+)/i, (_, n) => `LIMIT ${Math.min(parseInt(n), 50)}`);
      }

      const { data, error } = await supabase.rpc("execute_readonly_query", {
        query_text: query,
      });

      if (error) {
        return new Response(JSON.stringify({
          type: "error",
          content: `שגיאה בביצוע השאילתה: ${error.message}`,
          query,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        type: "data",
        data: data,
        query,
        explanation: parsed.explanation || "",
        sources: kbSources,
        escalation,
        webtiv_results: webtivResults, market_intel: marketIntelResults,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      type: "text",
      content: rawContent,
      escalation,
      webtiv_results: webtivResults, market_intel: marketIntelResults,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-agent error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
