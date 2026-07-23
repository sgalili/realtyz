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
  tries = 10,
): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    const id = await lookup();
    if (id) return id;
    await new Promise((r) => setTimeout(r, 600));
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
    // Homely/Webtiv single-item import — no URL required. Use `importOutJson`
    // with a propertyIds filter so the edge fn pulls just this serial from
    // the Webtiv stream and upserts it (photos, owner CRM, everything).
    if (!homelyId && !result.url) throw new Error('missing_homely_identifier');
    const { error } = await supabase.functions.invoke('homely-fetch-property', {
      body: {
        action: 'importOutJson',
        propertyIds: homelyId ? [homelyId] : [],
        // If the caller happens to have a URL, pass it too — some Webtiv
        // records include one and importOutJson stores it as source_url.
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
