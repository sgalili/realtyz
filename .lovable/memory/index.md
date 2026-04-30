# Memory: index.md
Updated: today

# Project Memory

## Core
- **Kalpiz AI**: Political campaign dashboard ('Digital Friend'). Avoid legacy 'VoterMachine'.
- **Design**: RTL Hebrew layout, Assistant/Inter fonts. Clean minimal style (blues, whites, slate).
- **AI Tone**: 'Sharren Haskel' (Liberal-Right, sharp). Address voters warmly by full_name.
- **Data**: Live data only. Normalize phones to 9725XXXXXXXX internally, display as 05X-XXXXXXX.
- **Privacy**: Supabase Realtime disabled for 'voters' & 'messages'. RLS requires auth.uid().
- **Never use em dashes (—) anywhere.** Use regular hyphens (-) or rewrite.

## Memories
- [No Em Dashes](mem://style/no-em-dash) — Hard rule: never output — anywhere (UI, code, prompts, messages).
- [Project Identity](mem://project/identity) — Kalpiz AI - Political campaign dashboard. UX metaphor: Digital Friend.
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
- [Data Privacy Constraints](mem://tech/data-privacy-constraints) — PII protection: Supabase Realtime disabled for 'voters' & 'messages'. Use React Query.
- [Dashboard Analytics](mem://features/dashboard-analytics) — BarChart for 7-day registration, PieChart for interests. Live DB counts, no placeholders.
- [RTL Technical Constraints](mem://style/rtl-technical-constraints) — Specific dir overrides for components, logical CSS properties, and flex-row-reverse for Inbox.
- [Backend Architecture](mem://tech/external-backend) — External Supabase DB. Edge functions (generate-content, etc) on Lovable Cloud via fetch.
- [SMS Gateway 019](mem://tech/sms-gateway-019) — 019 SMS XML API integration details: XML body auth, verified sender ID.
