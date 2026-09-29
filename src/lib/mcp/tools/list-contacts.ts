import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_contacts",
  title: "List contacts",
  description: "Search the signed-in user's workspace contacts by name, phone or city.",
  inputSchema: {
    query: z.string().trim().optional().describe("Text to match in name, phone or city."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = supabaseForUser(ctx)
      .from("leads")
      .select("id, full_name, phone_number, email, city, neighborhood, deal_type, lead_stage, status, last_interaction_at")
      .eq("is_demo", false)
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 25);
    if (query) {
      const s = query.replace(/[,%()]/g, " ");
      q = q.or(`full_name.ilike.%${s}%,phone_number.ilike.%${s}%,city.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const contacts = (data ?? []).map((r) => ({
      id: r.id as string,
      name: (r.full_name as string | null) ?? null,
      phone: (r.phone_number as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      city: (r.city as string | null) ?? null,
      neighborhood: (r.neighborhood as string | null) ?? null,
      deal_type: (r.deal_type as string | null) ?? null,
      stage: (r.lead_stage as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      last_interaction_at: (r.last_interaction_at as string | null) ?? null,
    }));
    return { content: [{ type: "text", text: JSON.stringify(contacts) }], structuredContent: { contacts } };
  },
});
