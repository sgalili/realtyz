import { supabase } from '@/lib/supabaseClient';

interface N8nConfig {
  webhookUrl: string;
  apiKey: string;
}

/**
 * Fetches the n8n webhook configuration from api_configs table.
 */
async function getN8nConfig(): Promise<N8nConfig | null> {
  const { data } = await supabase
    .from('api_configs')
    .select('api_key, webhook_url, is_active')
    .eq('service_name', 'n8n Webhook')
    .maybeSingle();

  if (!data || !data.is_active || !data.webhook_url) return null;
  return { webhookUrl: data.webhook_url, apiKey: data.api_key };
}

export type N8nEventType = 'message_sent' | 'contacts_synced' | 'campaign_dispatch' | 'add_to_campaign' | 'lead_whatsapp';

interface N8nPayload {
  event: N8nEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Sends a POST to the configured n8n webhook.
 * Returns { ok, skipped?, error? }.
 */
export async function sendToN8n(
  event: N8nEventType,
  data: Record<string, unknown>
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const config = await getN8nConfig();
  if (!config) {
    return { ok: false, skipped: true };
  }

  const payload: N8nPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey && config.apiKey !== 'none') {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  try {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error' };
  }
}
