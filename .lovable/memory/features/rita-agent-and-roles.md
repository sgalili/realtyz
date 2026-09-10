---
name: Rita AI agent, shared-number routing, broker/partner roles
description: Rita is the platform-wide female AI agent; inbound WhatsApp on the shared official number is routed by last outbound session; registration picks מתווך vs שותף.
type: feature
---
**Rita (ריטה)** is the ONLY AI agent identity across every workspace. Defined in `supabase/functions/_shared/masterAgentPrompt.ts` as `RITA_IDENTITY_RULES` / `RITA_AGENT_NAME`, prepended to the persona block in every prompt. Strict Hebrew feminine grammar about herself. Forbidden self-labels: "קצין המודיעין", "הסוכן הדיגיטלי", "העוזר", "הבוט". UI strings use "ריטה" (LeadCRM, AiAgentDrawer, OmnichannelInbox, VoterProfileSidebar). All WhatsApp traffic only via official number 972537983832.

**Shared-number context routing**: `supabase/functions/_shared/waContextRouter.ts` → `resolveWaContext(admin, phone)` picks the tenant by last OUTBOUND message to that phone, then last thread message, then freshest owned lead. Used by `meta-wa-webhook` (per message, provider row is only the fallback) and `whatsapp-webhook` (before the phone-variant lead lookup).

**Registration roles**: only מתווך (broker) or שותף (partner) — never buyer/seller/renter/landlord (those are CRM contact kinds). `src/lib/signupRole.ts` stores the pick, `ProtectedRoute` in `App.tsx` applies it after first login: partner → RPC `register_as_affiliate` + `/affiliate` portal; broker → RPC `register_as_broker` (grants `agent` only when the account has no role). Partner-only accounts stay locked to `AFFILIATE_ALLOWED_PATHS`.

Note: Meta template `invitation_to_realestate_brokers` is PENDING approval at Meta; sync itself works.
