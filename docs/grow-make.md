# Grow through Make: connection contract

The app is implemented, but does not create or configure a Make scenario. Grow account OTP is completed in Make, not in TORAFF. No live payments are enabled by default.

## Connection

1. Create a Make Custom Webhook with API-key authentication and a Grow connection. Use Grow Sandbox first. Business ID and registered mobile are supplied to the Grow connection; finish its OTP in Make.
2. Store the webhook URL and its API key securely as `GROW_MAKE_SANDBOX_URL` and `GROW_MAKE_SANDBOX_API_KEY`. Live uses distinct `GROW_MAKE_LIVE_URL` and `GROW_MAKE_LIVE_API_KEY`.
3. Configure a separate shared secret `GROW_MAKE_NOTIFY_SECRET` in TORAFF and in Make's outgoing callback header `x-grow-notify-secret`.
4. TORAFF calls Make using `x-make-apikey`. The app restricts URLs to Make/legacy Integromat webhook hosts, disables redirects and times out after 40 seconds. Never put these URLs or keys in browser code or public settings.

## Scenario routes and JSON responses

Use a router on `action`; every route ends with Webhooks > Webhook response containing JSON, not Make's default `Accepted` text.

- `test`: perform a harmless authenticated Grow read/connection check; do not create a charge or send SMS. Return `{ "connected": true, "environment": "sandbox" }` only after a successful check.
- `capabilities`: read the connected Grow account's enabled payment methods and required customer fields. Return `{ "methods": [{ "id": "card", "fields": ["full_name", "phone"] }] }`. Allowed method IDs: `card`, `bit`, `apple_pay`, `google_pay`, `bank_transfer`. Allowed customer fields: `full_name`, `phone`, `email`, `national_id`. Only declare methods actually enabled and usable for that environment/device; missing capability mapping blocks checkout rather than assuming support. TORAFF also requires a customer mobile for the receipt. Card numbers, CVV, wallet authentication and bank instructions are handled only by Grow's hosted checkout, never this payload or TORAFF storage.
- `create`: map server-owned `amount_ils`, `title`, customer `full_name`/`phone`, `sending_mode`, `success_url`, regular-charge/one-time payment mode into Grow Create Payment Link. Put `order_id` in Custom Field 1, and retain the returned payment-link identifier alongside the order. Return `{ "payment_url": "<Grow HTTPS checkout URL>" }`. TORAFF accepts Grow or Meshulam checkout domains only.
  Map the validated `payment_method` to Grow's actual method selection/restrictions; do not return a generic checkout that ignores the selected method. Optional `email`/`national_id` are included only when declared required. Bank transfers remain pending until Grow independently confirms settlement.
- `verify`: use Get Payment Link Info and the persisted payment-link mapping. Return `{ "paid": true, "order_id": "<Custom Field 1>", "transaction_id": "<verified transaction>", "amount_ils": 6500, "currency": "ILS", "environment": "sandbox" }` only when a completed payment, not authorization-only J4/J5, is independently confirmed by Grow. Never mirror incoming webhook values as verification.
- `approve`: call Grow Approve Transaction with the provider-required fields held by Make. Return `{ "approved": true }` after acknowledgment succeeds. This acknowledges the notification; it is not a payment authorization.

## Notifications

Grow Notify URL points to the Make Grow Notify URL Webhook. Make then POSTs to the deployed `grow-payments` endpoint with:

```json
{ "action": "notify", "order_id": "<Custom Field 1>", "transaction_id": "<Grow transaction>" }
```

Supply the separate shared-secret header above. Obtain the endpoint from the Cloud function view; no credential is included in its URL. TORAFF independently calls `verify`, atomically records payment and (live only) grants the order's snapshotted entitlement, then calls `approve`. Failed acknowledgment returns 502 so Make must retry. Duplicate callbacks are idempotent. Configure sequential notification handling/retries in Make; a successful browser redirect never grants access.

Live completion atomically enqueues a transaction SMS in service-only `payment_sms_outbox`. Before acknowledgment the handler atomically claims the pending item and sends a concise action/amount/order summary to the snapshotted customer mobile through the platform 019 sender (not a workspace sender). Sandbox sends no SMS. Failed/ambiguous sends are recorded as `uncertain`; interrupted claimed sends remain `sending` for operator review. Neither is blindly retried because 019 has no idempotent-send API. Repeated notifications retry only unclaimed `pending` work, never an accepted or ambiguous send. Delivery failure does not roll back a paid transaction. Legacy orders without a saved customer mobile cannot receive a summary. Review outbox failures in Cloud before manually retrying after confirming provider non-delivery.

## Subscription and acceptance checks

The requested price is ₪6,500, separate from wallet funds. Title, duration and benefits are unset until the owner supplies them. Automatic renewal is not configured and must not be advertised. Settings are Super Admin-only; orders and entitlements are self-readable, and financial completion is service-only.

Before enabling live: test completed sandbox checkout, denied/incorrect callbacks, duplicate notification acknowledgment, amount/currency/environment mismatches, and no live entitlement from sandbox. Supply agreed benefits and test their actual feature access before claiming subscription functionality complete. Current entitlements record the paid term; they do not grant broker privileges or bypass existing workspace/licensing/credit guards.

## Saved cards and lead authorizations (not live-enabled)

Customer mandate is explicit and unchecked by default. For card payments only, `create.save_card_token=true` maps to Grow `saveCardToken=1`. Never infer a reusable credit card from Bit, bank transfer or wallet payments. After independently verified live payment, `card_reference` must retrieve a reference from a protected Make/Grow vault and return `{order_id,customer_id,environment:"live",vault_reference,last4,brand}`. The reference is customer/order bound; the raw token stays in the provider vault. TORAFF stores only the server-private reference and safe display metadata. Retry callbacks cannot undo a revoked mandate; newer card mandates replace older ones. Wallet has a self-only revoke action.

Price saves and daily-spend-cap changes enqueue issuer checks for accounts with active mandates. The amount is the maximum of the three server-saved lead fees ×5, or the explicit account `daily_spend_ils`. Count caps are not money caps. `billing_capabilities` must return `token_preauthorization`, `idempotent_operations` and `authorization_release` all true before checks run. `preauthorize` receives a unique operation ID, customer ID, vault reference and ILS amount; it must use a permitted token authorization, independently read back the result, and release the hold. Return `{authorized,customer_id,operation_id,amount_ils,currency:"ILS",environment:"live",authorization_reference?,expires_at?}`. Never substitute a regular charge. Timeout/unknown results are persisted for reconciliation, not retried with a new operation ID. Authorizations are point-in-time checks, not visibility into the customer's total credit limit or guarantees of future payment. Grow J5 permissions and the Make implementation remain external prerequisites.

**Direct low-wallet charging is not enabled.** Existing `charge_lead_commission` still uses the wallet. Switching it requires an independently tested settlement state machine that reserves each charge/tier upgrade and account budget, charges with Grow's unique transaction identifiers, verifies captured funds, then releases partner rewards exactly once. Uncertain outcomes need provider readback, not blind retries. Card-paid costs must live in a separate billing ledger without wallet credit/debit; disputes must refund the actual funding source. No payouts may occur merely because a card request was queued. Do not bypass wallet locks, existing tier validation, reward snapshots or daily budgets while this provider path is unavailable. The partial-insufficient-wallet case must preserve remaining wallet funds rather than silently erase them to force zero. No real-time notifications for these future lead charges; the earlier SMS rule continues for subscription checkout.