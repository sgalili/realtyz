import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_properties",
  title: "List properties",
  description: "List properties in the signed-in user's workspace, optionally filtered by city, deal type and price.",
  inputSchema: {
    city: z.string().trim().optional().describe("City name to match."),
    deal_type: z.enum(["sale", "rent"]).optional().describe("sale or rent."),
    max_price: z.number().positive().optional().describe("Maximum asking price."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ city, deal_type, max_price, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = supabaseForUser(ctx)
      .from("listings")
      .select("id, slug, property_title, address, house_number, city, neighborhood, deal_type, asking_price, rooms, sqm, floor, status, is_published")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (city) q = q.ilike("city", `%${city}%`);
    if (deal_type) q = q.eq("deal_type", deal_type);
    if (max_price) q = q.lte("asking_price", max_price);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const properties = (data ?? []).map((r) => ({
      id: r.id as string,
      title: (r.property_title as string | null) ?? null,
      address: [r.address, r.house_number].filter(Boolean).join(" ") || null,
      city: (r.city as string | null) ?? null,
      neighborhood: (r.neighborhood as string | null) ?? null,
      deal_type: (r.deal_type as string | null) ?? null,
      price: r.asking_price == null ? null : Number(r.asking_price),
      rooms: r.rooms == null ? null : Number(r.rooms),
      sqm: r.sqm == null ? null : Number(r.sqm),
      floor: r.floor == null ? null : String(r.floor),
      status: (r.status as string | null) ?? null,
      published: Boolean(r.is_published),
      url: r.slug ? `https://realtyz.co.il/p/${r.slug}` : null,
    }));
    return { content: [{ type: "text", text: JSON.stringify(properties) }], structuredContent: { properties } };
  },
});
