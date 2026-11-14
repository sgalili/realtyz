// Web Unlocker manages IP rotation itself. Sticky proxy session/ip parameters
// are intentionally absent; background page attempts may rotate a browser UA.
export const WEB_UNLOCKER_ZONE = 'web_unlocker4';
export const UNLOCKER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
] as const;
export function rotatingUnlockerPayload(zone: string, url: string, attempt?: number) {
  if (attempt === undefined) return { zone, url, format: 'raw' };
  const index = Math.abs(Math.trunc(attempt)) % UNLOCKER_USER_AGENTS.length;
  return { zone, url, format: 'raw', headers: { 'User-Agent': UNLOCKER_USER_AGENTS[index] } };
}

export function unlockerRequestOptions(apiKey: string, zone: string, url: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(rotatingUnlockerPayload(zone, url)),
  };
}

export function rotationDiagnostics(header: string | undefined): { peerId?: string; requestId?: string } {
  if (!header) return {};
  try {
    const data = JSON.parse(header);
    return {
      peerId: typeof data.peer_ip === 'string' ? data.peer_ip.slice(0, 128) : undefined,
      requestId: typeof data.req_id === 'string' ? data.req_id.slice(0, 128) : undefined,
    };
  } catch { return {}; }
}