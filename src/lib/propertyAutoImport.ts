// Auto-import a search result from an external source into the local `listings`
// table so it becomes usable inside the CRM/post pipeline. Idempotent: if a row
// already exists for the same source_url / external_id we return that id.

import { supabase } from '@/integrations/supabase/client';
import type { UnifiedResult } from '@/lib/propertySearch';

async function findLocalBySourceUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const { data } = await supabase
    .from('listings')
    .select('id')
    .eq('source_url', url)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function findLocalByExternalId(externalId: string | null): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await supabase
    .from('listings')
    .select('id')
    .eq('external_id', externalId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function pollForListing(
  lookup: () => Promise<string | null>,
  tries = 24,
): Promise<string | null> {
  // Progressive back-off: 500ms, 700ms, 900ms, … capped at 2000ms.
  // Homely's outJson stream + image mirroring can take 10-15s on a cold run;
  // the previous 6s window was the root cause of most `import_not_visible`
  // errors even when the row was actually saved seconds later.
  for (let i = 0; i < tries; i++) {
    const id = await lookup();
    if (id) return id;
    const wait = Math.min(2000, 500 + i * 200);
    await new Promise((r) => setTimeout(r, wait));
  }
  return null;
}

function extractHomelyId(result: UnifiedResult): string | null {
  const raw = result.raw ?? {};
  const cand =
    raw.homely_id ??
    raw.external_id ??
    raw.serial ??
    raw.Sidur ??
    raw.sidur ??
    raw.id ??
    null;
  const s = cand == null ? '' : String(cand).trim();
  return s || null;
}

export async function autoImportResult(result: UnifiedResult): Promise<string> {
  if (result.localId) return result.localId;

  // 1) Try by source URL when we have one.
  const existingByUrl = await findLocalBySourceUrl(result.url);
  if (existingByUrl) {
    await supabase.from('listings').update({ source: 'local' }).eq('id', existingByUrl);
    return existingByUrl;
  }

  // 2) Fall back to external_id (Homely/Webtiv rows regularly arrive without a URL —
  //    the Webtiv outJson feed doesn't emit one — so we must accept them via serial).
  const homelyId = extractHomelyId(result);
  const existingByExt = await findLocalByExternalId(homelyId);
  if (existingByExt) {
    await supabase.from('listings').update({ source: 'local' }).eq('id', existingByExt);
    return existingByExt;
  }

  if (result.source === 'yad2') {
    if (!result.url) throw new Error('missing_source_url');
    const { error } = await supabase.functions.invoke('yad2-unlocker', { body: { url: result.url } });
    if (error) throw new Error(error.message || 'yad2_import_failed');
  } else if (result.source === 'homely' || result.source === 'webtiv') {
    // Homely/Webtiv single-item import — no URL required. Pass the raw
    // property record inline whenever we already have it from search so the
    // edge function doesn't have to re-filter the bulk outJson stream (which
    // frequently returns 0 matches when the property came from a different
    // agency feed — the root cause of past `import_not_visible` errors).
    if (!homelyId && !result.url) throw new Error('missing_homely_identifier');
    const raw = result.raw && typeof result.raw === 'object' ? result.raw : null;
    const inlineProperty = raw
      ? {
          ...raw,
          homely_id: homelyId ?? String(raw.homely_id ?? raw.id ?? '').trim(),
          source_url: result.url ?? raw.source_url ?? undefined,
        }
      : null;
    const { error } = await supabase.functions.invoke('homely-fetch-property', {
      body: {
        action: 'importOutJson',
        propertyIds: homelyId ? [homelyId] : [],
        properties: inlineProperty && inlineProperty.homely_id ? [inlineProperty] : undefined,
        source_url: result.url ?? undefined,
      },
    });
    if (error) throw new Error(error.message || 'homely_import_failed');
  } else {
    throw new Error(`unsupported_source:${result.source}`);
  }

  // Poll: prefer external_id (works for URL-less Homely rows), then source_url.
  const localId = await pollForListing(async () =>
    (await findLocalByExternalId(homelyId)) ?? (await findLocalBySourceUrl(result.url)),
  );
  if (!localId) throw new Error('import_not_visible');

  const { error: stampErr } = await supabase
    .from('listings')
    .update({ source: 'local' })
    .eq('id', localId);
  if (stampErr) {
    console.warn('[autoImportResult] failed to stamp source=local', stampErr.message);
  }

  return localId;
}
