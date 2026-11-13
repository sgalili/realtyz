import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { publicProfileBio } from '@/lib/publicProfileBio';

export function PublicBioField({ ownerId }: { ownerId: string | null }) {
  const qc = useQueryClient();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const visibleBio = publicProfileBio(draft);
  const bio = useQuery({ queryKey: ['profile-bio', ownerId], enabled: !!ownerId, queryFn: async () => {
    if (!ownerId) return null;
    const { data, error } = await supabase.from('profiles').select('id,public_bio').eq('id', ownerId).single();
    if (error) throw error;
    return data.public_bio;
  } });
  const save = async () => {
    if (!ownerId || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('profiles').update({ public_bio: draft.trim() || null }).eq('id', ownerId).select('id,public_bio').single();
      if (error) throw error;
      if (!data || data.id !== ownerId) throw new Error('הביו לא נשמר');
      if (!alive.current) return;
      qc.setQueryData(['profile-bio', ownerId], data.public_bio);
      void qc.invalidateQueries({ queryKey: ['community-profile-page'] });
      setEditing(false);
      toast.success('הביו נשמר');
    } catch { if (alive.current) toast.error('שמירת הביו נכשלה'); }
    finally { if (alive.current) setSaving(false); }
  };
  return <div className="space-y-2 border-b border-border py-3" dir="rtl">
    <div className="flex items-center justify-between gap-2"><label htmlFor="public-bio" className="text-base font-semibold">ביו</label><Button size="icon" variant="ghost" aria-label={editing ? 'שמירת ביו' : 'עריכת ביו'} disabled={saving || bio.isLoading || bio.isError} onClick={() => { if (editing) void save(); else { setDraft(bio.data ?? ''); setEditing(true); } }}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button></div>
    {editing ? <Textarea id="public-bio" value={draft} onChange={e => setDraft(e.target.value)} maxLength={5000} className="min-h-28 text-base" /> : <p className="whitespace-pre-line break-words text-base text-muted-foreground">{bio.data || '—'}</p>}
    {editing && <output className="text-sm text-muted-foreground" aria-label="אורך ביו">{draft.trim().length} / {visibleBio ? '50+' : '50'}</output>}
    {bio.isError && <p role="alert" className="text-destructive">טעינת הביו נכשלה</p>}
  </div>;
}