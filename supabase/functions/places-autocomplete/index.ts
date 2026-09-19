// Google Places (New) proxy for the public listing wizard address step.
// Authenticated app users only; all Google calls go through the Lovable connector gateway.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') ?? '';
const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function gatewayHeaders(fieldMask: string) {
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    'X-Connection-Api-Key': GOOGLE_MAPS_API_KEY,
    'Content-Type': 'application/json',
    'X-Goog-FieldMask': fieldMask,
  };
}

type Component = { longText?: string; shortText?: string; types?: string[] };

function pick(components: Component[], type: string) {
  return components.find((c) => (c.types ?? []).includes(type))?.longText ?? '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ error: 'unauthorized' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) return json({ error: 'unauthorized' }, 401);

    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) return json({ error: 'maps_not_configured' }, 503);

    const body = await req.json().catch(() => ({}));
    const action = String((body as { action?: string }).action ?? 'autocomplete');
    const sessionToken = String((body as { sessionToken?: string }).sessionToken ?? '').slice(0, 64) || undefined;

    if (action === 'autocomplete') {
      const input = String((body as { input?: string }).input ?? '').trim().slice(0, 120);
      if (input.length < 2) return json({ suggestions: [] });
      const response = await fetch(`${GATEWAY_URL}/places/v1/places:autocomplete`, {
        method: 'POST',
        headers: gatewayHeaders('suggestions.placePrediction.placeId,suggestions.placePrediction.text.text'),
        body: JSON.stringify({
          input,
          sessionToken,
          languageCode: 'he',
          includedRegionCodes: ['il'],
        }),
      });
      if (!response.ok) {
        const details = await response.text();
        console.error(`places:autocomplete failed [${response.status}]: ${details}`);
        return json({ error: 'places_request_failed', status: response.status, details }, response.status);
      }
      const payload = await response.json();
      const suggestions = (payload?.suggestions ?? [])
        .map((s: { placePrediction?: { placeId?: string; text?: { text?: string } } }) => ({
          place_id: s.placePrediction?.placeId ?? '',
          label: s.placePrediction?.text?.text ?? '',
        }))
        .filter((s: { place_id: string }) => s.place_id)
        .slice(0, 6);
      return json({ suggestions });
    }

    if (action === 'details') {
      const placeId = String((body as { place_id?: string }).place_id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 200);
      if (!placeId) return json({ error: 'place_id_required' }, 400);
      const query = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : '';
      const response = await fetch(`${GATEWAY_URL}/places/v1/places/${placeId}${query}`, {
        headers: gatewayHeaders('id,formattedAddress,addressComponents,location'),
      });
      if (!response.ok) {
        const details = await response.text();
        console.error(`places details failed [${response.status}]: ${details}`);
        return json({ error: 'places_request_failed', status: response.status, details }, response.status);
      }
      const payload = await response.json();
      const components: Component[] = payload?.addressComponents ?? [];
      return json({
        place: {
          formatted_address: payload?.formattedAddress ?? '',
          street: pick(components, 'route'),
          house_number: pick(components, 'street_number'),
          neighborhood: pick(components, 'neighborhood') || pick(components, 'sublocality_level_1') || pick(components, 'sublocality'),
          city: pick(components, 'locality') || pick(components, 'postal_town'),
          area: pick(components, 'administrative_area_level_2'),
          district: pick(components, 'administrative_area_level_1'),
          lat: payload?.location?.latitude ?? null,
          lng: payload?.location?.longitude ?? null,
        },
      });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    console.error('places-autocomplete error', error);
    return json({ error: error instanceof Error ? error.message : 'unexpected_error' }, 500);
  }
});
