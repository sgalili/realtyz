# Project Memory

## Core
- **Realtyz AI** (full rebrand from Kalpiz, completed). Real-estate CRM. The codebase contains zero `Kalpiz` references in source — only the legacy DB column `hide_kalpiz_branding` (in `white_label_settings`) and the original SQL migration files retain the old name; treat that column as read-only legacy.
- **Component prefixes**: All prior `KalpizX` components are now `RealtyzX` (RealtyzWave, RealtyzLoader, RealtyzWordmarkSvg). All CSS classes that were `kalpiz-*` are now `realtyz-*`. All localStorage keys (`realtyz-authenticated-session`, `realtyz-demo-mode`, etc.) follow the same convention.
- **Schema**: Use `leads` (was voters), `listings` (was candidate_pages), `contact_submissions` (was leads), `messages.lead_id`, `chat_history.lead_id`.
- **New columns**: leads.preferences (jsonb), leads.lead_stage (text). listings.property_title, .description, .features (jsonb), .asking_price (numeric).
- **Design**: RTL Hebrew layout, Assistant/Inter fonts. Clean minimal style (blues, whites, slate).
- **Data**: Live data only. Normalize phones to 9725XXXXXXXX internally, display as 05X-XXXXXXX.
- **Privacy**: Supabase Realtime disabled for 'leads' & 'messages'. RLS requires auth.uid().
- **UI strings**: Hebrew copy still uses political terms ("בוחרים", "מועמד", "מנדטים"). Realtyz Hebrew copy ("לידים", "נכסים", "מחיר") is a pending UX pass.
- **Demo Mode**: SCOPED. Off everywhere except `src/pages/SmsBlastSimulator.tsx` which may branch on `useDemoMode`/`useDemoGuard` to short-circuit dispatch POSTs and show a "מצב הדגמה" banner. Keep `is_demo=false` filters in queries.
- **Freemium**: 30-day trial · 100 contacts cap · ₪50 wallet (profiles.trial_end_date + wallet_balance_agorot). `useFreemiumStatus()` gates Add/Import buttons in CRM. `enforce_trial_lead_cap` trigger blocks inserts when expired (TRIAL_TIME_EXPIRED / TRIAL_RECORD_LIMIT). Currency always rendered via `<PriceTag>` (₪ left of digits).
- **Gender (HARD)**: `profiles.gender` + `cloned_voices.voice_gender` ('male'|'female'). UI Hebrew must match broker gender (use `heVerb` helper in CampaignCenter). Voice AI MUST self-refer in the voice clone's gender (Udi Whitman=MALE) and address the lead in their gender for the ENTIRE call — never switch mid-call, never assume. vapi-outbound-call injects genderRules() into the system prompt.

## Memories
- [Visual Identity](mem://style/visual-identity) — Realtyz branding: minimalist, no icons/emojis in headers.
- [Localization & Typography](mem://style/localization) — RTL Hebrew layout, Assistant/Inter fonts, specific Hebrew terminology.
- [AI Personality Style](mem://ai/personality-style) — AI tone: 'Sharren Haskel' (Liberal-Right, sharp). Addresses voters warmly in Hebrew by full name.
- [Automation Architecture](mem://tech/automation-architecture) — n8n automation hub integration. Event types: message_sent, contacts_synced, campaign_dispatch.
- [Data Validation Rules](mem://tech/data-validation-rules) — Israeli phone numbers: normalize to 9725XXXXXXXX for storage, display as 05X-XXXXXXX.
- [WhatsApp Gateway Integration](mem://features/whatsapp-gateway-integration) — Dual-gateway WhatsApp: Green API (Instance ID, Token) & Official WBA.
- [Voter CRM Profile](mem://features/voter-crm-profile) — Profile sheet: Radar Chart, engagement score, sentiment, loyalty, interaction timeline.
- [Voter CRM Table](mem://features/voter-crm-table) — High-density table: Full Name, Phone, City, ID, Loyalty, Engagement, Sentiment. Multi-select.
- [Smart Link Logic](mem://tech/smart-link-logic) — Smart links via Edge Function: tracks clicks, updates interest_tag, redirects to WhatsApp.
- [Voter CRM Importer](mem://features/voter-crm-importer) — CSV/XLSX importer: maps Hebrew headers to fields, skips invalid rows, summarizes.
- [API Settings](mem://features/api-settings) — External API credentials (n8n, SMS, WA, AI) management, masked inputs, proxied connection tests.
- [Omnichannel Inbox](mem://features/omnichannel-inbox) — RTL 3-panel layout, unified messaging, sender type, AI Autopilot toggle, Smart Gray-out.
- [Security Architecture](mem://tech/security-architecture) — RBAC (admin/moderator/user) via user_roles. RLS hardened. api_configs admin-only.
- [Data Privacy Constraints](mem://tech/data-privacy-constraints) — PII protection: Supabase Realtime disabled for 'leads' & 'messages'. Use React Query.
- [Dashboard Analytics](mem://features/dashboard-analytics) — BarChart for 7-day registration, PieChart for interests. Live DB counts, no placeholders.
- [RTL Technical Constraints](mem://style/rtl-technical-constraints) — Specific dir overrides for components, logical CSS properties, and flex-row-reverse for Inbox.
- [Backend Architecture](mem://tech/external-backend) — External Supabase DB. Edge functions (generate-content, etc) on Lovable Cloud via fetch.
- [SMS Gateway 019](mem://tech/sms-gateway-019) — 019 SMS XML API integration details: XML body auth, verified sender ID.
- [Compliance & Audit Layer](mem://features/compliance-audit) — audit_logs, PII masking before AI (`_shared/pii.ts`), `/privacy` GDPR page, AI disclosure footer (`_shared/compliance.ts`), `gdpr_delete_lead()` RPC.
- [Team Collaboration & RBAC](mem://features/team-collaboration) — agent/assistant/junior_agent roles, team_invitations + auto-claim trigger, deal_room_comments, can_close_deal trigger on leads, /team page.
- [System Health Watchdog](mem://features/system-health) — integration_error_logs, watchdog cron, get_system_status() RPC, /settings/system-health admin page, SystemStatus footer dot.
- [No Demo Mode](mem://constraints/no-demo-mode) — Demo mode scoped to SmsBlastSimulator only; no demo branches elsewhere.
- [Super-admin Workspaces](mem://features/super-admin-workspaces) — `super-admin-create-user` edge fn + `SuperAdminCreateUserCard` in /super-admin Users tab. profiles.is_unlimited / created_by_super_admin / workspace_owner_id. enforce_trial_lead_cap skips when is_unlimited. New users get 1000 NIS, managing_broker role, optional WA invite via GreenAPI.
- [No Markdown Asterisks](mem://constraints/no-markdown-asterisks) — Strip `*`/`**` from all AI-generated posts, comments, replies, email, SMS via `stripMarkdownEmphasis()`. Exception: WhatsApp Green API keeps `*bold*` (native WA syntax).
- [Campaigns Unified Sent Feed](mem://features/campaigns-unified-feed) — /campaigns must show UI-posted and native Facebook posts in one global sent-post card list, never separate sections.


- [Owner Rules Enforcement](mem://features/owner-rules-enforcement) — Every AI generator (ai-agent, generate-content, generate-outreach-message, outreach-suggest, fb-engagement-draft, suggest-comment-reply, master-research) MUST inject fetchSystemRulesBlock so owner standing orders override persona/template defaults. System prompt block is framed HIGHEST PRIORITY + a user-prompt reminder enforces silent rewrite-to-comply.
- [Owner Hard Laws](mem://constraints/owner-hard-laws) — Two non-negotiable compliance laws: strip building/house numbers from any street address in generated text, and append `רישיון תיווך מספר: <profiles.broker_license_number>` footer to every post/outreach/property draft. Enforced via system-rules.ts prompt block AND `_shared/owner-laws.ts` post-processor wired into ayrshare-post, generate-content, generate-outreach-message, outreach-suggest, draft-property-share, fb-engagement-reply, sanitizeOutboundText.
- [Homely Read-Only](mem://constraints/homely-read-only) — Homely/WebTiv are pull-only (no push/Open Card writes), invite-to-channel flow removed, inbox composer always visible, typing a phone number in inbox search starts a WhatsApp chat and auto-creates the CRM card.
- [Metadata Backfill & Owner CRM](mem://features/metadata-backfill-owner-crm) — listings-metadata-backfill + owner-crm-sync edge fns, crons, Meta WhatsApp owner profile enrichment.
- [Green API Inbound & Avatar Sync](mem://features/greenapi-inbound-and-avatars) — greenapi-webhook inbound AI auto-responder with real listing lookups; resumable background WhatsApp avatar sync jobs (wa_avatar_sync_jobs + useWaAvatarSync).
- [Master Agent Prompt](mem://features/master-agent-prompt) — Dual-frontier internal/external AI directive in _shared/masterAgentPrompt.ts, wired into every agent surface.
- [WhatsApp Meta-Only (HARD)](mem://constraints/whatsapp-meta-only) — Chat/inbox/sending/webhooks are Official Meta Cloud API only; Green API is avatars-only.
- [Tenant Isolation & Product Tour](mem://features/tenant-isolation-and-tour) — workspace-scoped RLS on listings/social_connections/campaign_settings, ProductTour dialog, graphic header logo.
- [Global Meta App + Isolation (HARD)](mem://constraints/tenant-isolation-meta) — One system Meta app for all users; no FB_PAGE_* env token fallbacks; messenger_page_bindings unique on (owner_id,page_id).
