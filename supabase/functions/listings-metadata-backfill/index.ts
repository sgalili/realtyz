// listings-metadata-backfill
// Server-side sweep that fills in the missing `בית` (house number),
// `דירה` (apartment number), `שכונה` (neighborhood) and the TRUE original
// source publication date for every existing Yad2 / Homely row.
//
// Zero external scraping cost: everything is derived from data we already
// stored (address text, source_metadata, homely_raw). Run by pg_cron and
// callable manually with { limit, listing_ids, force }.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  parseHebrewAddress,
  extractPublishedAt,
  toIsoDate,
  publishedFromRelativeHebrew,
} from '../_shared/addressParse.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUDGET_MS = 110_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function firstText(...vals: unknown[]): string | null {
  for (const v of vals) {
    const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
    if (s && s !== 'null' && s !== 'undefined' && s !== '0') return s;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const started = Date.now();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({} as any));
  const limit = Math.min(2000, Math.max(1, Number(body?.limit) || 500));
  const force = Boolean(body?.force);
  const ids: string[] | null = Array.isArray(body?.listing_ids) && body.listing_ids.length
    ? body.listing_ids.map(String)
    : null;

  let query = admin
    .from('listings')
    .select('id, address, city, neighborhood, house_number, apartment_number, description, long_description, source, source_url, source_metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ids) {
    query = query.in('id', ids);
  } else if (!force) {
    query = query.or(
      'house_number.is.null,apartment_number.is.null,neighborhood.is.null,source_metadata->>published_at.is.null',
    );
  }

  const { data: rows, error } = await query;
  if (error) return json({ error: error.message }, 500);

  let scanned = 0;
  let updated = 0;
  const fields = { house_number: 0, apartment_number: 0, neighborhood: 0, published_at: 0 };
  const failures: Array<{ id: string; error: string }> = [];

  for (const row of rows ?? []) {
    if (Date.now() - started > BUDGET_MS) break;
    scanned++;
    const meta = (row.source_metadata ?? {}) as Record<string, any>;
    const homely = (meta.homely_raw ?? {}) as Record<string, any>;
    const patch: Record<string, unknown> = {};
    const metaPatch: Record<string, unknown> = {};

    const parsed = parseHebrewAddress(row.address);

    // --- בית ---
    const house = firstText(
      row.house_number, meta.house_number, homely.number, meta.street_number,
      meta.houseNumber, parsed.house_number,
    );
    if (house && house !== row.house_number) { patch.house_number = house; fields.house_number++; }
    if (house && !meta.house_number) metaPatch.house_number = house;

    // --- דירה ---
    const apt = firstText(
      row.apartment_number, meta.apartment_number, homely.flatnumber, meta.apartmentNumber,
      parsed.apartment_number,
    );
    if (apt && apt !== row.apartment_number) { patch.apartment_number = apt; fields.apartment_number++; }
    if (apt && !meta.apartment_number) metaPatch.apartment_number = apt;

    // --- שכונה ---
    const hood = firstText(
      row.neighborhood, meta.neighborhood, homely.shcuna, meta.hood, meta.area, meta.neighbourhood,
    );
    if (hood && hood !== row.neighborhood) { patch.neighborhood = hood; fields.neighborhood++; }
    if (hood && !meta.neighborhood) metaPatch.neighborhood = hood;

    // --- true original publication date ---
    const existingPublished = toIsoDate(meta.published_at);
    const published = existingPublished
      ?? toIsoDate(homely.startdate)
      ?? extractPublishedAt(meta)
      ?? publishedFromRelativeHebrew(`${row.description ?? ''}\n${row.long_description ?? ''}`);
    if (published && published !== existingPublished) {
      metaPatch.published_at = published;
      metaPatch.published_at_source = homely.startdate ? 'homely_raw.startdate' : 'source_metadata';
      fields.published_at++;
    }

    const updatedAtSource = toIsoDate(meta.updated_at_source) ?? toIsoDate(homely.lastdate);
    if (updatedAtSource && updatedAtSource !== toIsoDate(meta.updated_at_source)) {
      metaPatch.updated_at_source = updatedAtSource;
    }

    if (Object.keys(metaPatch).length) {
      patch.source_metadata = { ...meta, ...metaPatch, metadata_backfilled_at: new Date().toISOString() };
    }
    if (!Object.keys(patch).length) continue;

    const { error: upErr } = await admin.from('listings').update(patch).eq('id', row.id);
    if (upErr) failures.push({ id: row.id, error: upErr.message });
    else updated++;
  }
  // ---------------------------------------------------------------------
  // Optional DEEP pass: Yad2 search feeds never expose `בית` / `דירה`, only
  // the item page does. This costs BrightData credits, so it is opt-in
  // ({ deep: true, deep_limit: n }) and hard-capped.
  // ---------------------------------------------------------------------
  const deep = Boolean(body?.deep);
  const deepLimit = Math.min(25, Math.max(1, Number(body?.deep_limit) || 10));
  let deepScraped = 0;
  let deepFilled = 0;

  if (deep) {
    const { data: deepRows } = await admin
      .from('listings')
      .select('id, address, source_url, source_metadata')
      .eq('source', 'yad2')
      .is('house_number', null)
      .not('source_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(deepLimit);

    for (const row of deepRows ?? []) {
      if (Date.now() - started > BUDGET_MS) break;
      const url = String(row.source_url ?? '');
      if (!/yad2\.co\.il\/realestate\/item\//i.test(url)) continue;
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/yad2-unlocker`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
          body: JSON.stringify({ url, limit: 1 }),
        });
        if (!r.ok) {
          failures.push({ id: row.id, error: `yad2-unlocker ${r.status}: ${(await r.text()).slice(0, 160)}` });
          continue;
        }
        await r.text();
        deepScraped++;
      } catch (e) {
        failures.push({ id: row.id, error: String((e as Error)?.message ?? e) });
        continue;
      }

      // Re-derive from whatever the scrape just stored.
      const { data: fresh } = await admin
        .from('listings')
        .select('id, address, house_number, apartment_number, neighborhood, source_metadata')
        .eq('id', row.id)
        .maybeSingle();
      if (!fresh) continue;
      const fMeta = (fresh.source_metadata ?? {}) as Record<string, any>;
      const fParsed = parseHebrewAddress(fresh.address);
      const patch: Record<string, unknown> = {};
      const house = firstText(fresh.house_number, fMeta.house_number, fParsed.house_number);
      const apt = firstText(fresh.apartment_number, fMeta.apartment_number, fParsed.apartment_number);
      const hood = firstText(fresh.neighborhood, fMeta.neighborhood);
      if (house && house !== fresh.house_number) patch.house_number = house;
      if (apt && apt !== fresh.apartment_number) patch.apartment_number = apt;
      if (hood && hood !== fresh.neighborhood) patch.neighborhood = hood;
      const pub = toIsoDate(fMeta.published_at) ?? extractPublishedAt(fMeta);
      if (pub && pub !== toIsoDate(fMeta.published_at)) {
        patch.source_metadata = { ...fMeta, published_at: pub };
      }
      if (Object.keys(patch).length) {
        const { error: upErr } = await admin.from('listings').update(patch).eq('id', row.id);
        if (!upErr) deepFilled++;
      }
    }
  }

  return json({
    ok: true,
    scanned,
    updated,
    fields,
    deep,
    deep_scraped: deepScraped,
    deep_filled: deepFilled,
    failures: failures.slice(0, 20),
    duration_ms: Date.now() - started,
  });
});

