# Social/Facebook rules
- Facebook auth/groups are mounted siblings, so Page state never interrupts groups.
- Group membership UI reads persisted cloud events, never local membership overrides. Why: truthful status.
- Group selection: one checkbox per row, immutable deduped snapshots, no-op guards; peer expansions use exclusive motion groups.
- Facebook groups UI reuses FacebookCloudConnectGate for cloud login and confirmed membership import; legacy entry points delegate to it, never installation or cookie entry. Joins need server evidence and rule consent; quotas stay workspace-scoped. Why: one truthful cloud connection flow.
- Graph Page selection uses server discovery/bindings; confirmed cloud groups stay separate with bounded cancellable scans. Reject client passwords/cookies. Server-redact social identity; append service-only durable retry-keyed rotating footers after sanitization, never in drafts. Why: private publishing.
- Facebook Messenger replies, group-comment capture/auto-replies and their leads run through cloud-social-inbox and the cloud-runner job types (inbox_sync, messenger_send, comments_sync, comment_reply) on the saved cloud session; leads are keyed per workspace. Why: no Meta Graph dependency while business verification is pending.
