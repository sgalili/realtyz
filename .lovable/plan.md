# Rita phone integration

## What changes

- Add required `שם מלא` to the existing property callback sheet and every other callback-only entry point found in the same lead flow. Keep the full name on the CRM lead and derive only the first token for Rita’s greeting.
- Introduce one shared call-context contract containing `agency_name`, `agent_name`, `broker_id`, `lead_name`, `lead_phone`, `property_id`, and structured property facts. Resolve broker identity and property facts on the server rather than trusting browser-supplied names or IDs.
- Route outbound callback requests through the existing authorized lead intake path, then start ElevenLabs outbound calls through the connected Twilio number. Preserve current Vapi/IVR features and full-marketplace behavior.
- Expose a signed ElevenLabs server-tool endpoint for property search. Search the broker’s active public-safe inventory first, then expand to other active public inventory without exposing private contacts, rewards, drafts, or workspace-only fields.
- Expose a signed ElevenLabs post-call webhook. Store call context, transcript, summary, matched property IDs, qualification answers, and idempotent CRM updates. Reuse existing lead, message, call-history, and notification conventions.
- Configure Rita’s ElevenLabs agent with dynamic variables, the property-search tool, qualification collection, and the post-call webhook. Reuse the already connected Twilio voice number `+97233826735`; do not place a real call without an approved recipient.

## Provider endpoints

External provider callbacks will use stable public app routes under `/api/public/rita/`, with provider signature verification and validated bounded input. App-internal authenticated actions will use server functions. Existing Supabase functions remain intact for compatibility.

## Data and access

- Add only the fields/indexes needed for call context, idempotent webhook processing, qualification, and property matches.
- Keep workspace ownership and existing RLS unchanged. Public search returns only concise public property facts.
- Webhook writes are service-only after signature verification and exact agent ownership resolution.
- Demo calls use `TORAFF` by default and never create or expose real customer data.

## Verification

- Unit tests for first-name extraction, context mapping, broker-first search/fallback, signature rejection, webhook idempotency, and required full-name validation.
- Submit a test callback through the real UI/route without placing a call, confirm the stored lead/context, and remove only that test record.
- Verify ElevenLabs tool/webhook configuration by provider readback and check the relevant mobile and desktop forms.
- Report exact tool and webhook URLs, field mappings, tests performed, and anything still requiring provider approval or a real call.
