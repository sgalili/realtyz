import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    // Expected path: /smart-link/<short_code>
    const shortCode = pathParts[pathParts.length - 1];

    if (!shortCode || shortCode === "smart-link") {
      return new Response("Missing short code", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Look up the tracking link
    const { data: link, error } = await supabase
      .from("tracking_links")
      .select("*")
      .eq("short_code", shortCode)
      .single();

    if (error || !link) {
      return new Response("Link not found", { status: 404 });
    }

    // 2. Increment click count
    await supabase
      .from("tracking_links")
      .update({ click_count: (link.click_count || 0) + 1 })
      .eq("id", link.id);

    // 3. If the link has a tag, try to update the voter's interest_tag
    // We use the referrer or a voter_id query param if provided
    const voterId = url.searchParams.get("v");
    if (voterId && link.tag) {
      await supabase
        .from("voters")
        .update({ interest_tag: link.tag, last_interaction_at: new Date().toISOString() })
        .eq("id", voterId);
    }

    // 4. Check if target_url is a WhatsApp link with pre-filled text
    const targetUrl = link.target_url;

    // 5. Redirect
    return new Response(null, {
      status: 302,
      headers: { Location: targetUrl },
    });
  } catch (err) {
    console.error("Smart link error:", err);
    return new Response("Internal server error", { status: 500 });
  }
});
