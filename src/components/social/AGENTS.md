# Social/Facebook rules
- Facebook auth/groups are mounted siblings, so Page state never interrupts groups.
- Group membership UI reads persisted cloud events, never local membership overrides. Why: truthful status.
- Group selection: one checkbox per row, immutable deduped snapshots, no-op guards; peer expansions use exclusive motion groups.
- Facebook groups UI reuses FacebookCloudConnectGate for cloud login and confirmed membership import; legacy entry points delegate to it, never installation or cookie entry. Joins need server evidence and rule consent; quotas stay workspace-scoped. Why: one truthful cloud connection flow.
