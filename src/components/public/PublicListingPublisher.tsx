import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { uploadMediaToLibrary } from '@/lib/mediaUpload';
import { clearPublicListingDraft, readPublicListingDraft, savePublicListingDraft, type PublicListingDraftFields } from '@/lib/publicListingDraft';
import { setPendingSignupRole } from '@/lib/signupRole';

const EMPTY: PublicListingDraftFields = {
  dealType: 'sale', propertyType: '', city: '', neighborhood: '', address: '', price: '', rooms: '', sqm: '', floor: '', description: '',
};

function slugFor(userId: string) {
  return `owner-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
}

export function PublicListingPublisher({ autoResume = false, disabled = false }: { autoResume?: boolean; disabled?: boolean }) {
  const { user } = useAuth();
  const { isPropertyOwner, refetch: refetchRoles } = useUserRole();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<PublicListingDraftFields>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [resumed, setResumed] = useState(false);

  const set = (key: keyof PublicListingDraftFields, value: string) => setFields((current) => ({ ...current, [key]: value }));

  const publish = async (draftFields = fields, draftFiles = files) => {
    if (!user?.id || publishing) return;
    if (!draftFields.city.trim() || !draftFields.address.trim() || !draftFields.propertyType.trim() || !draftFields.price) {
      toast.error('יש למלא סוג נכס, עיר, כתובת ומחיר');
      return;
    }
    setPublishing(true);
    try {
      if (!isPropertyOwner) {
        const { error } = await supabase.rpc('register_as_property_owner', { _display_name: null });
        if (error) throw error;
        await refetchRoles();
      }
      const uploaded: string[] = [];
      for (const file of draftFiles) {
        const row = await uploadMediaToLibrary({ userId: user.id, fileName: file.name, data: file, mimeType: file.type, source: 'public_property_listing' });
        const url = (row as { public_url?: string | null })?.public_url;
        if (url) uploaded.push(url);
      }
      const title = `${draftFields.propertyType.trim()} · ${draftFields.city.trim()}${draftFields.neighborhood.trim() ? ` · ${draftFields.neighborhood.trim()}` : ''}`;
      const { data, error } = await supabase.from('listings').insert({
        user_id: user.id, workspace_owner_id: user.id, owner_id: user.id,
        slug: slugFor(user.id), property_title: title, description: draftFields.description.trim(), asking_price: Number(draftFields.price),
        city: draftFields.city.trim(), neighborhood: draftFields.neighborhood.trim() || null, address: draftFields.address.trim(),
        deal_type: draftFields.dealType, rooms: draftFields.rooms ? Number(draftFields.rooms) : null,
        sqm: draftFields.sqm ? Number(draftFields.sqm) : null, floor: draftFields.floor ? Number(draftFields.floor) : null,
        features: { property_type: draftFields.propertyType.trim() }, media_photos: uploaded, image_url: uploaded[0] ?? null,
        status: 'live', source: 'manual', is_published: true, affiliate_enabled: true,
      } as never).select('id').single();
      if (error) throw error;
      await clearPublicListingDraft();
      toast.success('הנכס פורסם בלוח השיתופי');
      setOpen(false); setFields(EMPTY); setFiles([]);
      navigate('/owner/properties', { replace: true, state: { publishedListingId: (data as { id?: string } | null)?.id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(message.includes('one active property') || message.includes('duplicate') ? 'בעל נכס פרטי יכול לפרסם נכס פעיל אחד בלבד' : 'פרסום הנכס נכשל, הטיוטה נשמרה');
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (!autoResume || !user?.id || resumed) return;
    setResumed(true);
    void readPublicListingDraft().then((draft) => {
      if (!draft) return;
      setFields(draft); setFiles(draft.files ?? []);
      void publish(draft, draft.files ?? []);
    });
  }, [autoResume, user?.id, resumed]);

  const continueToPublish = async () => {
    if (!fields.city.trim() || !fields.address.trim() || !fields.propertyType.trim() || !fields.price) {
      toast.error('יש למלא סוג נכס, עיר, כתובת ומחיר'); return;
    }
    try {
      await savePublicListingDraft(fields, files);
      if (!user) { setPendingSignupRole('property_owner'); navigate('/auth'); return; }
      await publish();
    } catch { toast.error('לא ניתן לשמור את הטיוטה בדפדפן'); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button disabled={disabled} className="gap-2 bg-success text-success-foreground hover:bg-success/90"><Building2 className="h-4 w-4" /> פרסום נכס</Button></DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader className="text-right"><DialogTitle>פרסום נכס בלוח השיתופי</DialogTitle><DialogDescription>מלאו פרטים והוסיפו תמונות. הטיוטה תישמר גם אם תידרשו להירשם.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2"><Button type="button" variant={fields.dealType === 'sale' ? 'default' : 'outline'} onClick={() => set('dealType', 'sale')}>מכירה</Button><Button type="button" variant={fields.dealType === 'rent' ? 'default' : 'outline'} onClick={() => set('dealType', 'rent')}>השכרה</Button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>סוג נכס *</Label><Input value={fields.propertyType} onChange={(e) => set('propertyType', e.target.value)} placeholder="דירה, בית פרטי, משרד" /></div>
            <div><Label>עיר *</Label><Input value={fields.city} onChange={(e) => set('city', e.target.value)} /></div>
            <div><Label>שכונה</Label><Input value={fields.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} /></div>
            <div><Label>כתובת מלאה *</Label><Input value={fields.address} onChange={(e) => set('address', e.target.value)} /></div>
            <div><Label>מחיר *</Label><Input inputMode="numeric" value={fields.price} onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))} /></div>
            <div><Label>חדרים</Label><Input inputMode="decimal" value={fields.rooms} onChange={(e) => set('rooms', e.target.value)} /></div>
            <div><Label>שטח במ״ר</Label><Input inputMode="numeric" value={fields.sqm} onChange={(e) => set('sqm', e.target.value.replace(/\D/g, ''))} /></div>
            <div><Label>קומה</Label><Input inputMode="numeric" value={fields.floor} onChange={(e) => set('floor', e.target.value.replace(/[^\d-]/g, ''))} /></div>
          </div>
          <div><Label>תיאור הנכס</Label><Textarea rows={4} value={fields.description} onChange={(e) => set('description', e.target.value)} /></div>
          <div><Label htmlFor="public-listing-photos" className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary"><ImagePlus className="h-5 w-5" /> {files.length ? `${files.length} תמונות נבחרו` : 'בחירת תמונות'}</Label><input id="public-listing-photos" type="file" accept="image/*" multiple className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 20))} /></div>
          <Button className="w-full" disabled={publishing} onClick={() => void continueToPublish()}>{publishing ? <><Loader2 className="h-4 w-4 animate-spin" /> מפרסם…</> : user ? 'פרסום הנכס' : 'שמירת טיוטה והרשמה'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PublicListingPublisher;
