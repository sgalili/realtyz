# Memory: index.md
Updated: today

# Project Memory

## Core
- **Realtyz AI** (pivoted from Kalpiz AI). Real-estate CRM. Avoid legacy 'Kalpiz', 'voters', 'candidate_pages'.
- **Schema**: Use `leads` (was voters), `listings` (was candidate_pages), `contact_submissions` (was leads), `messages.lead_id`, `chat_history.lead_id`.
- **New columns**: leads.preferences (jsonb), leads.lead_stage (text). listings.property_title, .description, .features (jsonb), .asking_price (numeric).
- **Design**: RTL Hebrew layout, Assistant/Inter fonts. Clean minimal style (blues, whites, slate).
- **Data**: Live data only. Normalize phones to 9725XXXXXXXX internally, display as 05X-XXXXXXX.
- **Privacy**: Supabase Realtime disabled for 'leads' & 'messages'. RLS requires auth.uid().
- **UI strings**: Hebrew copy still uses political terms ("בוחרים", "מועמד", "מנדטים"). Realtyz Hebrew copy ("לידים", "נכסים", "מחיר") is a pending UX pass.
- **Demo Mode**: Client-side context flag (super-admin toggle in header). NO separate auth user, NO secrets, NO session swap. `useDemoMode()` reads localStorage `realtyz-demo-mode`. Components branch on `if (isDemoMode)` to read `src/lib/demoData.ts`.

## Memories
- [Project Identity](mem://project/identity) — Kalpiz AI - Political campaign dashboard. UX metaphor: Digital Friend. (LEGACY — see Realtyz pivot)
- [Visual Identity](mem://style/visual-identity) — Kalpiz branding: minimalist, no icons/emojis in headers. Israeli Liberal-Right aesthetic.
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
- [Demo Mode Context Switcher](mem://features/demo-mode) — Client-side context flag, super-admin only toggle in header. No auth swap, no secrets.
