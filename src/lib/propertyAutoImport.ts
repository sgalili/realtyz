// Auto-import a search result from an external source into the local `listings`
// table so it becomes usable inside the CRM/post pipeline. Idempotent: if a row
// already exists for the same source_url we return that row's id directly.

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

async function pollForListing(url: string | null, tries = 8): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    const id = await findLocalBySourceUrl(url);
    if (id) return id;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

export async function autoImportResult(result: UnifiedResult): Promise<string> {
  if (result.localId) return result.localId;

  // Short-circuit: maybe another workspace member already imported the same URL.
  const existing = await findLocalBySourceUrl(result.url);
  if (existing) {
    // Ensure the row is stamped as 'local' so the multi-source badge stops
    // showing it as still-external on subsequent searches.
    await supabase.from('listings').update({ source: 'local' }).eq('id', existing);
    return existing;
  }

  const url = result.url;
  if (!url) throw new Error('missing_source_url');

  if (result.source === 'yad2') {
    const { error } = await supabase.functions.invoke('yad2-unlocker', { body: { url } });
    if (error) throw new Error(error.message || 'yad2_import_failed');
  } else if (result.source === 'homely' || result.source === 'webtiv') {
    const { error } = await supabase.functions.invoke('homely-fetch-property', {
      body: { source_url: url, homely_id: result.raw?.id, upsert: true },
    });
    if (error) throw new Error(error.message || 'homely_import_failed');
  } else {
    throw new Error(`unsupported_source:${result.source}`);
  }

  const localId = await pollForListing(url);
  if (!localId) throw new Error('import_not_visible');

  // Stamp as local so future searches recognize it as internal (no re-import,
  // no external badge). Best-effort — a failure here is non-fatal, the listing
  // is already in the DB.
  const { error: stampErr } = await supabase
    .from('listings')
    .update({ source: 'local' })
    .eq('id', localId);
  if (stampErr) {
    console.warn('[autoImportResult] failed to stamp source=local', stampErr.message);
  }

  return localId;
}
