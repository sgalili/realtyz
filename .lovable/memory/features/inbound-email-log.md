---
name: Workspace Mailbox (Resend)
description: One email box per workspace; Gmail first, else <alias>@realtyz.co.il via Resend; info@ is platform-reserved; inbound matched only inside the mailbox's workspace.
type: feature
---
- Each workspace has exactly ONE mailbox. If the workspace owner has Gmail connected, Gmail is used; otherwise the workspace's <alias>@realtyz.co.il (Resend) is used.
- Alias lives on the workspace owner's profiles.email_alias; set only by the owner via set_workspace_email_alias RPC; read via get_workspace_mailbox RPC.
- Reserved aliases: info, noreply, admin, support, etc. info@realtyz.co.il is the platform mailbox (inbound logged, never attached to a workspace).
- Inbound: Resend webhook (email.received, svix-signed, RESEND_INBOUND_SIGNING_SECRET) -> resend-inbound-webhook fetches body, matches leads ONLY where workspace_owner_id = alias owner, idempotent by provider_message_id, always logs to inbound_emails_log.
- Resend API called directly with RESEND_API_KEY (not the connector gateway). Replies-To = workspace alias.
