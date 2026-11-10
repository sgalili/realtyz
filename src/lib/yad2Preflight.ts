import { supabase } from '@/integrations/supabase/client';

type Choice = 'draft' | 'skip';
export type InactiveImportRequest = { url: string; resolve: (choice: Choice) => void };
const listeners = new Set<(request: InactiveImportRequest) => void>();
let queue: InactiveImportRequest[] = [];
export function subscribeInactiveImports(listener: (request: InactiveImportRequest) => void) {
  listeners.add(listener);
  for (const request of queue) listener(request);
  queue = [];
  return () => { listeners.delete(listener); };
}
export function inactiveImportChoice(url: string): Promise<Choice> {
  return new Promise(resolve => {
    const request = { url, resolve };
    if (!listeners.size) queue.push(request);
    else listeners.forEach(listener => listener(request));
  });
}
export async function checkYad2BeforeImport(url: string): Promise<'continue' | Choice> {
  if (!/\/realestate\/item\//i.test(url)) return 'continue';
  try {
    const { data, error } = await supabase.functions.invoke('yad2-ad-status', { body: { urls: [url] } });
    if (!error && data?.statuses?.[url] === 'gone') return inactiveImportChoice(url);
  } catch { /* Uncertain network status must not masquerade as a removed ad. */ }
  return 'continue';
}
export async function createInactiveYad2Draft(url: string, workspaceId: string) {
  const item = url.match(/\/item\/(?:[a-z0-9-]+\/)?([a-z0-9_-]+)(?=[/?#]|$)/i)?.[1]?.toLowerCase();
  if (!item) throw new Error('יש להדביק קישור מלא למודעה');
  const { data: existing, error: readError } = await supabase.from('listings').select('id,canonical_duplicate_of').eq('workspace_owner_id', workspaceId).eq('source', 'yad2').eq('external_id', item).limit(1).maybeSingle();
  if (readError) throw readError;
  if (existing) return existing.canonical_duplicate_of ?? existing.id;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('יש להתחבר לפני שמירת הטיוטה');
  const { data, error } = await supabase.from('listings').insert({ user_id: user.id, workspace_owner_id: workspaceId, source: 'yad2', external_id: item, source_url: url, status: 'pending', is_published: false, affiliate_enabled: false, property_title: '', description: '', slug: crypto.randomUUID(), source_metadata: { yad2_status: 'gone', manual_completion: true }, features: { manual_completion: true } }).select('id').single();
  if (error) throw error;
  return data.id;
}