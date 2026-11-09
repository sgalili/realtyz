// preview-master-auth (retired)
// The former shared "master code" sign-in let anyone obtain a session for any
// account and has been permanently disabled. The endpoint stays deployed so
// existing clients fall through to the normal OTP flow.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ success: false, reason: "not_master_code" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
