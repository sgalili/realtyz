import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ZCreditConfig = { terminal_id: string; api_key: string; environment: "sandbox" | "production" };

export const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export async function getCaller(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await userClient.auth.getUser();
  return { user: data.user, userClient };
}

export async function isSuperAdmin(userId: string) {
  const { data } = await admin().from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  return !!data;
}

export async function loadZCredit(): Promise<ZCreditConfig | null> {
  const { data } = await admin().from("api_configs").select("api_key,is_active").eq("service_name", "zcredit").maybeSingle();
  if (!data?.api_key || !data.is_active) return null;
  try {
    const c = JSON.parse(data.api_key) as ZCreditConfig;
    return c.terminal_id && c.api_key ? c : null;
  } catch { return null; }
}

export const zcreditBase = (env: string) =>
  env === "production" ? "https://pci.zcredit.co.il" : "https://pci.zcredit.co.il"; // Z-Credit uses one host; sandbox = test terminal
