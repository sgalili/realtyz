import { corsHeaders } from '../_shared/cors.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanAddress(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const address = cleanAddress(body?.address);
    if (address.length < 4) return json({ error: 'address_required' }, 400);

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const mapboxApiKey = Deno.env.get('MAPBOX_API_KEY');
    if (!lovableApiKey || !mapboxApiKey) {
      return json({ error: 'mapbox_not_configured' }, 503);
    }

    const query = encodeURIComponent(address.includes('ישראל') ? address : `${address}, ישראל`);
    const gatewayUrl = `https://connector-gateway.lovable.dev/mapbox/geocoding/v5/mapbox.places/${query}.json?limit=1&country=il&language=he`;
    const response = await fetch(gatewayUrl, {
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'X-Connection-Api-Key': mapboxApiKey,
      },
    });

    if (!response.ok) {
      const details = await response.text();
      console.error(`Mapbox geocoding failed [${response.status}]: ${details}`);
      return json({ error: 'provider_request_failed', status: response.status, details }, response.status);
    }

    const data = await response.json();
    const feature = Array.isArray(data?.features) ? data.features[0] : null;
    const center = Array.isArray(feature?.center) ? feature.center : null;
    const longitude = Number(center?.[0]);
    const latitude = Number(center?.[1]);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json({ error: 'location_not_found' }, 404);
    }

    return json({ latitude, longitude, label: feature?.place_name ?? address });
  } catch (error) {
    console.error('mapbox-geocode error', error);
    return json({ error: 'mapbox_geocode_failed', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});
