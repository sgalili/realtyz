/**
 * waTemplates
 * -----------
 * Meta WhatsApp template helpers shared by the follow-up drip and the
 * autopilot drain worker.
 *
 * Meta only allows free-form text inside the 24h customer-service window.
 * Anything later MUST go out as a pre-approved template, otherwise Meta
 * rejects the send (error 131047 / 470). These helpers pick an APPROVED
 * template for a category and turn a flat variable list into Graph API
 * `components`.
 */

export const WA_24H_WINDOW_MS = 24 * 3_600_000;

/** Meta error codes/messages that will never succeed on retry. */
const NON_RETRYABLE_RE =
  /(131047|131026|132000|132001|132005|132007|132012|132015|132068|132069|template|re-?engagement|outside.*24)/i;

export function isTemplateOrWindowError(message: string): boolean {
  return NON_RETRYABLE_RE.test(message || "");
}

export type ResolvedTemplate = {
  name: string;
  language: string;
  variable_count: number;
};

/**
 * Finds an APPROVED template for the given owner, preferring the requested
 * categories in order. Falls back to any approved template of the workspace.
 */
export async function resolveApprovedTemplate(
  admin: any,
  ownerUserId: string | null,
  categories: string[] = ["UTILITY", "MARKETING"],
): Promise<ResolvedTemplate | null> {
  try {
    let q = admin
      .from("wa_message_templates")
      .select("name, language, category, status, variable_count, owner_user_id, synced_at")
      .eq("status", "APPROVED")
      .order("synced_at", { ascending: false })
      .limit(200);
    if (ownerUserId) q = q.eq("owner_user_id", ownerUserId);
    const { data } = await q;
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return null;
    for (const cat of categories) {
      const hit = rows.find((r) => String(r.category ?? "").toUpperCase() === cat.toUpperCase());
      if (hit) {
        return {
          name: String(hit.name),
          language: String(hit.language ?? "he"),
          variable_count: Number(hit.variable_count ?? 0),
        };
      }
    }
    const any = rows.find((r) => String(r.category ?? "").toUpperCase() !== "AUTHENTICATION");
    return any
      ? { name: String(any.name), language: String(any.language ?? "he"), variable_count: Number(any.variable_count ?? 0) }
      : null;
  } catch {
    return null;
  }
}

/**
 * Builds Graph API body components from a flat variable list, padded/trimmed to
 * the template's declared variable count so Meta never rejects the payload for
 * a parameter mismatch.
 */
export function buildTemplateComponents(variables: string[], variableCount: number): unknown[] {
  const count = Math.max(0, variableCount || variables.length);
  if (count === 0) return [];
  const params = Array.from({ length: count }, (_, i) => ({
    type: "text",
    text: String(variables[i] ?? "").trim() || "-",
  }));
  return [{ type: "body", parameters: params }];
}
