// Web Unlocker manages rotation itself. Sticky proxy session/ip parameters are
// not part of its documented REST schema and must not be added here.
export function rotatingUnlockerPayload(zone: string, url: string) {
  return { zone, url, format: 'raw' };
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