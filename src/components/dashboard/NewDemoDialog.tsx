/**
 * NewDemoDialog
 * -------------
 * Complete flow for scheduling a new product demo ("הדגמה חדשה"):
 * pick an existing contact (or type a new one) -> date & time -> notes,
 * then save the demo and (optionally) push it to the Google calendar and send
 * the WhatsApp confirmation from the OFFICIAL Meta number only.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search } from 'lucide-react';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

type LeadOption = {
  id: string;
  full_name: string | null;
  phone_number: string;
  profile_picture_url: string | null;
};

function defaultDate() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function NewDemoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const ownerId = useActiveWorkspaceOwnerId();

  const [contactQuery, setContactQuery] = useState('');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState('11:00');
  const [notes, setNotes] = useState('');
  const [addToCalendar, setAddToCalendar] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: leads = [] } = useQuery({
    queryKey: ['new-demo-leads', ownerId, contactQuery],
    enabled: !!ownerId && open && contactQuery.trim().length >= 2,
    queryFn: async () => {
      const q = contactQuery.trim();
      const { data } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, profile_picture_url')
        .eq('workspace_owner_id', ownerId!)
        .or(`full_name.ilike.%${q}%,phone_number.ilike.%${q}%`)
        .limit(8);
      return (data ?? []) as LeadOption[];
    },
  });

  const pickLead = (l: LeadOption) => {
    const parts = (l.full_name ?? '').trim().split(/\s+/);
    setLeadId(l.id);
    setFirstName(parts[0] ?? '');
    setLastName(parts.slice(1).join(' '));
    setPhone(l.phone_number ?? '');
    setContactQuery('');
  };

  const reset = () => {
    setContactQuery('');
    setLeadId(null);
    setFirstName('');
    setLastName('');
    setPhone('');
    setDate(defaultDate());
    setTime('11:00');
    setNotes('');
    setAddToCalendar(true);
  };

  const submit = async () => {
    if (!ownerId) return;
    if (!firstName.trim() || !phone.trim()) {
      toast.error('נדרשים שם וטלפון');
      return;
    }
    if (!date || !time) {
      toast.error('נדרשים תאריך ושעה להדגמה');
      return;
    }
    setSaving(true);
    try {
      const preferredAt = new Date(`${date}T${time}:00+03:00`);
      const { data, error } = await supabase
        .from('demo_requests')
        .insert({
          workspace_owner_id: ownerId,
          first_name: firstName.trim(),
          last_name: lastName.trim() || '-',
          phone: phone.trim(),
          preferred_at: preferredAt.toISOString(),
          notes: notes.trim() || null,
          status: 'scheduled',
          source: 'manual',
          lead_id: leadId,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (addToCalendar && data?.id) {
        const res = await supabase.functions.invoke('demo-booking-notify', {
          body: { demo_request_id: data.id },
        });
        if (res.error) {
          toast.warning('ההדגמה נשמרה, אך העדכון ביומן ובוואטסאפ לא הושלם');
        }
      }

      toast.success('ההדגמה נקבעה');
      qc.invalidateQueries({ queryKey: ['tasks-scheduled-demos'] });
      qc.invalidateQueries({ queryKey: ['tasks-demos-count'] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'קביעת ההדגמה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>הדגמה חדשה</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>איש קשר</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="חיפוש לפי שם או טלפון"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
              />
            </div>
            {leads.length > 0 && contactQuery.trim().length >= 2 ? (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-1">
                {leads.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => pickLead(l)}
                    className="flex w-full items-center gap-2 rounded-md p-2 text-right hover:bg-accent"
                  >
                    <ContactAvatar name={l.full_name ?? ''} imageUrl={l.profile_picture_url} className="h-8 w-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.full_name || 'ללא שם'}</span>
                      <span className="block text-[12px] text-muted-foreground">{formatPhoneDisplay(l.phone_number)}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="שם פרטי" value={firstName} onChange={(e) => { setLeadId(null); setFirstName(e.target.value); }} />
              <Input placeholder="שם משפחה" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <Input placeholder="טלפון" value={phone} onChange={(e) => { setLeadId(null); setPhone(e.target.value); }} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>תאריך</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>שעה</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>הערות</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="פרטים להדגמה" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={addToCalendar} onCheckedChange={(v) => setAddToCalendar(!!v)} />
            הוספה ליומן ושליחת אישור
          </label>
        </div>

        <DialogFooter className="flex-row justify-between gap-2 space-x-0">
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}
            קביעת הדגמה
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewDemoDialog;
