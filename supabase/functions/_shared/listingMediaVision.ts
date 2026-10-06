export type MediaVerdict = { logo: boolean; person: boolean; publisher_logo: boolean; branding_name: string | null };

/** Inspect branding before gallery cleanup; never infer a license from an image. */
export async function classifyListingMedia(url: string, advertiser: string, apiKey: string): Promise<MediaVerdict | null> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': apiKey, 'X-Lovable-AIG-SDK': 'fetch' },
    body: JSON.stringify({
      model: 'openai/gpt-6-astra', stream: true, store: false,
      reasoning: { effort: 'low', summary: 'auto' }, include: ['reasoning.encrypted_content'],
      input: [{ role: 'user', content: [
        { type: 'input_text', text: `Classify a real-estate listing image. logo=true for standalone logos, brand cards, business cards or text graphics; not for property photos with a small watermark. person=true when a human is visible. publisher_logo=true ONLY for a standalone office/broker logo whose legible branding matches this original advertiser: ${advertiser || 'unknown (publisher_logo must be false)'}. Exclude platform logos, unrelated brands, portraits and watermarked property photos. branding_name is the exact visible advertiser name or null. Never guess. Return only the four JSON fields.` },
        { type: 'input_image', image_url: url },
      ] }],
      text: { format: { type: 'json_schema', name: 'listing_media', strict: true, schema: {
        type: 'object', additionalProperties: false,
        properties: { logo: { type: 'boolean' }, person: { type: 'boolean' }, publisher_logo: { type: 'boolean' }, branding_name: { type: ['string', 'null'] } },
        required: ['logo', 'person', 'publisher_logo', 'branding_name'],
      } } },
    }),
  });
  if (!response.ok) {
    const error = new Error(`media_vision_failed_${response.status}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', output = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ') || line.slice(6).trim() === '[DONE]') continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === 'response.output_text.delta') output += event.delta ?? '';
      if (event.type === 'error' || event.type === 'response.failed') throw new Error('media_vision_stream_failed');
      if (event.type === 'response.refusal.delta') return null;
    }
  }
  if (!output.trim()) return null;
  return JSON.parse(output) as MediaVerdict;
}

export function matchesAdvertiser(visible: string | null, names: unknown[]): boolean {
  const normalize = (s: unknown) => typeof s === 'string' ? s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() : '';
  const value = normalize(visible);
  return value.length >= 3 && names.some(name => { const expected = normalize(name); return expected.length >= 3 && (value.includes(expected) || expected.includes(value)); });
}