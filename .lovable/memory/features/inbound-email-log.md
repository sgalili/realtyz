---
name: Inbound Email Log
description: inbound_emails_log table + resend-inbound-webhook tee + inline EmailAliasSetupDialog on dashboard.
type: feature
---
Inline email provisioning: clicking "חבר" on the Email channel card in CampaignCenter opens `EmailAliasSetupDialog` (writes profiles.email_alias + direct_channels.email=true). No profile redirect.

`inbound_emails_log` table mirrors every Resend inbound POST (from/to/subject/body/raw_payload/provider_message_id) and records matched_lead_id + matched_broker_user_id (resolved via profiles.email_alias from the recipient prefix). RLS: broker reads own rows, admins read all, service_role writes.

resend-inbound-webhook still inserts into `messages` when a lead matches but now ALWAYS tees into inbound_emails_log first (status=matched|unmatched). resend-email-sender continues to read sender alias from profiles.email_alias dynamically.
