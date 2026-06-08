// Centralized client helper that ships broker manual-edits of AI-generated
// text to the `learn-from-edit` edge function. The edge function diffs the
// pair, extracts a concise rule via the AI gateway, and inserts it into
// `agent_learning_lexicon`. Persona prompts (see `_shared/persona.ts`) read
// the last N rules and inject them as CRITICAL OVERRIDES before EVERY future
// generation — so every captured edit retrains the agent app-wide
// (campaign replies, posts, inbox messages, AI drawer, deal-room, etc.).
//
// Call this anywhere a human edits text the AI drafted, on the success path
// AFTER the edited text was actually used (sent / published / saved). It is
// safe to call with empty/equal strings — the helper no-ops in that case.
import { supabase } from "@/integrations/supabase/client";

export type EditPair = {
  label: string;
  original: string;
  edited: string;
};

export type LearnFromEditOptions = {
  /** Free-form context label, e.g. "campaign_post:facebook", "inbox_reply:whatsapp". */
  context?: string | null;
  /** Optional listing the edit relates to. */
  listing_id?: string | null;
  pairs: EditPair[];
};

const isMeaningful = (p: EditPair) => {
  const a = (p.original ?? "").trim();
  const b = (p.edited ?? "").trim();
  return a.length > 0 && b.length > 0 && a !== b;
};

/**
 * Fire-and-forget capture. Never throws, never blocks the UI.
 * Returns true when at least one pair was actually sent.
 */
export function learnFromEdit(opts: LearnFromEditOptions): boolean {
  const pairs = (opts.pairs ?? []).filter(isMeaningful);
  if (pairs.length === 0) return false;
  void supabase.functions
    .invoke("learn-from-edit", {
      body: {
        context: opts.context ?? null,
        listing_id: opts.listing_id ?? null,
        pairs,
      },
    })
    .catch((err) => {
      // Background-only; surfacing this would distract the broker mid-flow.
      console.warn("[learnFromEdit] capture failed", err);
    });
  return true;
}
