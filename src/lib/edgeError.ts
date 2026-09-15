/**
 * `supabase.functions.invoke` replaces any non-2xx body with the generic
 * "Edge Function returned a non-2xx status code", which hides the real reason
 * Google refused the connection. This reads the response body behind that mask
 * so the user (and the console log) sees the actual provider message.
 */
export async function readEdgeError(err: unknown, fallback = 'unknown'): Promise<string> {
  const anyErr = err as { message?: string; context?: Response | { text?: () => Promise<string> } };
  const base = String(anyErr?.message ?? fallback);
  const ctx: any = anyErr?.context;
  if (!ctx || typeof ctx.text !== 'function') return base;
  try {
    const raw = await ctx.text();
    if (!raw) return base;
    try {
      const json = JSON.parse(raw);
      const detail = json?.error ?? json?.message ?? raw;
      const code = json?.code ? ` (${json.code})` : '';
      return `${String(detail)}${code}`;
    } catch {
      return raw.slice(0, 500);
    }
  } catch {
    return base;
  }
}
