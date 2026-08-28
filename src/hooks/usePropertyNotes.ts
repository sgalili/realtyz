/**
 * Property notes — every note attached to a listing.
 *
 * Sources:
 *  - `interaction_activity_log` rows (`action_type` note/interaction) whose
 *    metadata carries a `listing_id`.
 *  - `listings.office_notes` (the broker's own note written on the property).
 *
 * Notes are returned in FULL (never truncated) so the UI can print the whole
 * text under the property name in tables, cards and the Today's Tasks page.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type PropertyNote = {
  id: string;
  listingId: string;
  content: string;
  createdAt: string | null;
  kind: 'note' | 'interaction' | 'office';
  listingLabel: string | null;
};

const NOTE_KIND_LABEL: Record<PropertyNote['kind'], string> = {
  note: 'פתק',
  interaction: 'סיכום שיחה',
  office: 'הערת משרד',
};

export function propertyNoteKindLabel(kind: PropertyNote['kind']) {
  return NOTE_KIND_LABEL[kind] ?? 'פתק';
}

async function fetchPropertyNotes(): Promise<PropertyNote[]> {
  const [logRes, listingRes] = await Promise.all([
    (supabase as any)
      .from('interaction_activity_log')
      .select('id, action_type, content, metadata, created_at')
      .in('action_type', ['note', 'interaction'])
      .order('created_at', { ascending: false })
      .limit(400),
    (supabase as any)
      .from('listings')
      .select('id, office_notes, property_title, address, city, updated_at')
      .not('office_notes', 'is', null)
      .limit(400),
  ]);

  const listingRows: any[] = Array.isArray(listingRes?.data) ? listingRes.data : [];
  const labelOf = (l: any) =>
    l?.property_title || [l?.address, l?.city].filter(Boolean).join(', ') || null;

  const out: PropertyNote[] = [];

  for (const r of (Array.isArray(logRes?.data) ? logRes.data : [])) {
    const listingId = (r.metadata ?? {})?.listing_id;
    const content = String(r.content ?? '').trim();
    if (!listingId || !content) continue;
    out.push({
      id: r.id,
      listingId,
      content,
      createdAt: r.created_at ?? null,
      kind: r.action_type === 'interaction' ? 'interaction' : 'note',
      listingLabel: null,
    });
  }

  for (const l of listingRows) {
    const content = String(l.office_notes ?? '').trim();
    if (!content) continue;
    out.push({
      id: `office-${l.id}`,
      listingId: l.id,
      content,
      createdAt: l.updated_at ?? null,
      kind: 'office',
      listingLabel: labelOf(l),
    });
  }

  // Resolve labels for log-based notes.
  const missing = Array.from(
    new Set(out.filter((n) => !n.listingLabel).map((n) => n.listingId)),
  );
  if (missing.length) {
    const { data } = await (supabase as any)
      .from('listings')
      .select('id, property_title, address, city')
      .in('id', missing);
    const map = new Map<string, any>((data ?? []).map((l: any) => [l.id, l]));
    for (const n of out) {
      if (!n.listingLabel) n.listingLabel = labelOf(map.get(n.listingId));
    }
  }

  out.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  return out;
}

/** All property notes, newest first. */
export function usePropertyNotes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['property-notes', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 30_000,
    refetchOnMount: 'always',
    queryFn: fetchPropertyNotes,
  });
}

/** Notes grouped by listing id — for tables and cards. */
export function usePropertyNotesByListing() {
  const q = usePropertyNotes();
  const map = new Map<string, PropertyNote[]>();
  for (const n of q.data ?? []) {
    const arr = map.get(n.listingId);
    if (arr) arr.push(n);
    else map.set(n.listingId, [n]);
  }
  return { ...q, notesByListing: map };
}

/** Permanently delete a property note. */
export async function deletePropertyNote(note: PropertyNote) {
  if (note.kind === 'office') {
    const { error } = await (supabase as any)
      .from('listings')
      .update({ office_notes: null })
      .eq('id', note.listingId);
    if (error) throw error;
    return;
  }
  const { error } = await (supabase as any)
    .from('interaction_activity_log')
    .delete()
    .eq('id', note.id);
  if (error) throw error;
}

/** Update a property note's text. */
export async function updatePropertyNote(note: PropertyNote, content: string) {
  const text = content.trim();
  if (note.kind === 'office') {
    const { error } = await (supabase as any)
      .from('listings')
      .update({ office_notes: text || null })
      .eq('id', note.listingId);
    if (error) throw error;
    return;
  }
  const { error } = await (supabase as any)
    .from('interaction_activity_log')
    .update({ content: text })
    .eq('id', note.id);
  if (error) throw error;
}
