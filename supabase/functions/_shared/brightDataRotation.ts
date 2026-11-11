// Web Unlocker manages rotation itself. Sticky proxy session/ip parameters are
// not part of its documented REST schema and must not be added here.
export function rotatingUnlockerPayload(zone: string, url: string, headers: Record<string, string>) {
  return { zone, url, format: 'raw', country: 'il', method: 'GET', headers, debug: true };
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