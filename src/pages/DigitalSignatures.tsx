import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, FileSignature, FileText, Link2, Search, ShieldCheck, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { publicUrl } from '@/lib/publicUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ClosingRoomDialog } from '@/components/dealroom/ClosingRoomDialog';
import { usePublicWorkspace } from '@/components/demo/PublicWorkspaceProvider';
import { notifyDemoReadOnly } from '@/lib/demoReadOnly';

type Lead = { id: string; full_name: string | null; phone_number: string };
type Doc = {
  id: string; title: string; status: string; template_key: string; lead_id: string | null;
  signer_name: string | null; sign_token: string | null; pdf_path: string | null; signed_pdf_path: string | null;
  sent_at: string | null; viewed_at: string | null; signed_at: string | null; created_at: string;
  approved_at: string | null; approval_note: string | null; fields: Record<string, unknown> | null;
};
type Filter = 'all' | 'pending' | 'signed' | 'approved';

const STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'טיוטה', variant: 'secondary' }, sent: { label: 'ממתין לחתימה', variant: 'outline' },
  viewed: { label: 'נצפה, טרם נחתם', variant: 'outline' }, signed: { label: 'נחתם, ממתין לאישור', variant: 'default' },
  expired: { label: 'פג תוקף', variant: 'destructive' }, cancelled: { label: 'בוטל', variant: 'secondary' },
};
const fmt = (d: string | null) => d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const STEPS = [
  { icon: FileText, title: 'מכינים מסמך', body: 'בוחרים לקוח ומפיקים הסכם מוכן (סיור, הזמנת שירותי תיווך, שכירות) או מעלים קובץ PDF משלכם.' },
  { icon: Link2, title: 'שולחים לחתימה', body: 'הלקוח מקבל קישור אישי בווטסאפ הרשמי של TORAFF, פותח את המסמך בטלפון וחותם באצבע.' },
  { icon: ShieldCheck, title: 'מאמתים ומאשרים', body: 'המסמך החתום נשמר אוטומטית בכרטיס הלקוח. בודקים את פרטי החותם ואת הקובץ ומאשרים בלחיצה.' },
];

export default function DigitalSignatures() {
  const owner = useActiveWorkspaceOwnerId();
  return <DigitalSignaturesContent key={owner ?? 'none'} owner={owner} />;
}

function DigitalSignaturesContent({ owner }: { owner: string | null }) {
  const demo = usePublicWorkspace();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [leadSearch, setLeadSearch] = useState('');
  const [lead, setLead] = useState<Lead | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [review, setReview] = useState<Doc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const docsKey = ['signature-docs', user?.id, owner];
  const docs = useQuery({
    queryKey: docsKey, enabled: !!user && !!owner, refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('closing_documents')
        .select('id,title,status,template_key,lead_id,signer_name,sign_token,pdf_path,signed_pdf_path,sent_at,viewed_at,signed_at,created_at,approved_at,approval_note,fields')
        .eq('workspace_owner_id', owner!).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });
  const leads = useQuery({
    queryKey: ['signature-lead-search', owner, leadSearch.trim()], enabled: !!owner && leadSearch.trim().length >= 2,
    queryFn: async () => {
      const q = leadSearch.trim().replace(/[%,()]/g, '');
      const { data, error } = await supabase.from('leads').select('id,full_name,phone_number')
        .eq('workspace_owner_id', owner!).or(`full_name.ilike.%${q}%,phone_number.ilike.%${q}%`).limit(8);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const all = docs.data ?? [];
  const counts = useMemo(() => ({
    all: all.length,
    pending: all.filter(d => ['draft', 'sent', 'viewed'].includes(d.status)).length,
    signed: all.filter(d => d.status === 'signed' && !d.approved_at).length,
    approved: all.filter(d => !!d.approved_at).length,
  }), [all]);
  const visible = all.filter(d => filter === 'all' ? true : filter === 'pending' ? ['draft', 'sent', 'viewed'].includes(d.status)
    : filter === 'signed' ? d.status === 'signed' && !d.approved_at : !!d.approved_at);
  const refresh = () => qc.invalidateQueries({ queryKey: docsKey });

  async function openFile(path: string | null) {
    if (demo) { notifyDemoReadOnly(); return; }
    if (!path) { toast.error('אין קובץ זמין למסמך הזה'); return; }
    const { data, error } = await supabase.storage.from('closing-docs').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error('לא ניתן לפתוח את הקובץ'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function uploadAndSend(file: File) {
    if (demo) { notifyDemoReadOnly(); return; }
    if (!user || !owner || !lead) return;
    if (file.type !== 'application/pdf') { toast.error('אפשר להעלות קובץ PDF בלבד'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('הקובץ גדול מ־10MB'); return; }
    setUploading(true);
    try {
      const id = crypto.randomUUID();
      const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
      const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      const path = `${user.id}/${id}.pdf`;
      const up = await supabase.storage.from('closing-docs').upload(path, file, { contentType: 'application/pdf' });
      if (up.error) throw new Error('העלאת הקובץ נכשלה');
      const name = file.name.replace(/\.pdf$/i, '');
      const { error } = await supabase.from('closing_documents').insert({
        id, user_id: user.id, workspace_owner_id: owner, lead_id: lead.id, template_key: 'custom_upload',
        title: `${name} · ${lead.full_name ?? ''}`.trim(), status: 'draft', pdf_path: path, sign_token: token,
        signer_name: lead.full_name, fields: { lead_name: lead.full_name, uploaded_file_name: file.name },
      });
      if (error) throw new Error('שמירת המסמך נכשלה. ייתכן שאין לחשבון הרשאה לחדר הסגירה.');
      const { data, error: sendErr } = await supabase.functions.invoke('send-closing-doc', { body: { document_id: id, site_url: publicUrl('').replace(/\/$/, '') } });
      if (sendErr || (data as { success?: boolean })?.success === false) {
        toast.warning('המסמך נשמר כטיוטה, אך השליחה נכשלה', { description: 'אפשר להעתיק את קישור החתימה ולשלוח ידנית.' });
      } else toast.success('המסמך נשלח לחתימה', { description: `${lead.full_name ?? 'הלקוח'} יקבל קישור בווטסאפ.` });
      await refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  return (
    <section dir="rtl" className="mx-auto max-w-4xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">חתימות דיגיטליות</h1>
        <p className="text-muted-foreground">שולחים מסמכים לחתימה, עוקבים אחרי הסטטוס ומאשרים מסמכים חתומים, הכל ממקום אחד.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => <Card key={s.title}><CardContent className="space-y-1 p-4">
          <s.icon className="h-5 w-5 text-primary" />
          <p className="font-bold">{i + 1}. {s.title}</p>
          <p className="text-sm text-muted-foreground">{s.body}</p>
        </CardContent></Card>)}
      </div>

      <Card><CardContent className="space-y-3 p-4">
        <p className="font-bold">מסמך חדש לחתימה</p>
        {lead ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
            <span><span className="font-semibold">{lead.full_name || 'ללא שם'}</span> <span className="text-sm text-muted-foreground" dir="ltr">{lead.phone_number}</span></span>
            <Button variant="ghost" size="sm" onClick={() => setLead(null)}>החלפת לקוח</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={leadSearch} onChange={e => setLeadSearch(e.target.value)} placeholder="חיפוש לקוח לפי שם או טלפון" className="pr-9" aria-label="חיפוש לקוח" /></div>
            {(leads.data ?? []).map(l => <Button key={l.id} variant="outline" className="w-full justify-between" onClick={() => { setLead(l); setLeadSearch(''); }}>
              <span>{l.full_name || 'ללא שם'}</span><span dir="ltr" className="text-muted-foreground">{l.phone_number}</span></Button>)}
            {leadSearch.trim().length >= 2 && leads.data?.length === 0 && <p className="text-sm text-muted-foreground">לא נמצאו לקוחות. הוסיפו את הלקוח קודם בלידים.</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!lead} onClick={() => setTemplateOpen(true)} className="gap-2"><FileSignature className="h-4 w-4" />הפקת הסכם מוכן</Button>
          <Button variant="outline" disabled={!lead || uploading} onClick={() => { if (demo) notifyDemoReadOnly(); else fileRef.current?.click(); }} className="gap-2"><Upload className="h-4 w-4" />{uploading ? 'מעלה ושולח…' : 'העלאת PDF ושליחה'}</Button>
          <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void uploadAndSend(f); }} />
        </div>
      </CardContent></Card>

      <div className="space-y-3">
        <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">הכל ({counts.all})</TabsTrigger>
            <TabsTrigger value="pending">בתהליך ({counts.pending})</TabsTrigger>
            <TabsTrigger value="signed">לאישור ({counts.signed})</TabsTrigger>
            <TabsTrigger value="approved">אושרו ({counts.approved})</TabsTrigger>
          </TabsList>
        </Tabs>
        {docs.isLoading ? <p role="status">טוען מסמכים…</p> : docs.isError ? <Button variant="outline" onClick={() => void docs.refetch()}>ניסיון נוסף</Button>
          : visible.length === 0 ? <p className="py-8 text-center text-muted-foreground">אין מסמכים כאן עדיין</p> : (
          <ul className="space-y-2">{visible.map(d => {
            const st = d.approved_at ? { label: 'אושר', variant: 'default' as const } : STATUS[d.status] ?? { label: d.status, variant: 'secondary' as const };
            return <li key={d.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{d.title}</p>
                  <p className="text-sm text-muted-foreground">{d.signed_at ? `נחתם ${fmt(d.signed_at)}` : d.sent_at ? `נשלח ${fmt(d.sent_at)}` : `נוצר ${fmt(d.created_at)}`}</p>
                </div>
                <Badge variant={st.variant} className="gap-1">{d.approved_at ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{st.label}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => void openFile(d.signed_pdf_path || d.pdf_path)}>צפייה בקובץ</Button>
                {d.sign_token && d.status !== 'signed' && <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(publicUrl(`/sign/${d.sign_token}`)); toast.success('קישור החתימה הועתק'); }}>העתקת קישור חתימה</Button>}
                {d.status === 'signed' && <Button size="sm" variant={d.approved_at ? 'ghost' : 'default'} onClick={() => setReview(d)}>{d.approved_at ? 'פרטי אימות' : 'אימות ואישור'}</Button>}
              </div>
            </li>;
          })}</ul>
        )}
      </div>

      <ClosingRoomDialog lead={lead} open={templateOpen} onOpenChange={o => { setTemplateOpen(o); if (!o) void refresh(); }} defaultTemplate="tour_agreement" />
      {review && <ReviewDialog doc={review} onClose={() => setReview(null)} onOpen={openFile} onApproved={() => { setReview(null); void refresh(); }} />}
    </section>
  );
}

function ReviewDialog({ doc, onClose, onOpen, onApproved }: { doc: Doc; onClose: () => void; onOpen: (p: string | null) => void; onApproved: () => void }) {
  const demo = usePublicWorkspace();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const f = doc.fields ?? {};
  const idNumber = (f.identity_number ?? f.signer_identity_number) as string | undefined;
  const checks = [
    { ok: doc.status === 'signed' && !!doc.signed_at, label: `המסמך נחתם ב־${fmt(doc.signed_at)}` },
    { ok: !!doc.signed_pdf_path, label: 'קובץ חתום נשמר במערכת' },
    { ok: !!doc.signer_name, label: `שם החותם: ${doc.signer_name ?? 'לא נשמר'}` },
    ...(idNumber ? [{ ok: true, label: `תעודת זהות: ${idNumber}` }] : []),
  ];
  const approve = async () => {
    if (demo) { notifyDemoReadOnly(); return; }
    setBusy(true);
    const { error } = await supabase.rpc('approve_signed_document', { _id: doc.id, _note: note || undefined });
    setBusy(false);
    if (error) { toast.error(error.message.includes('not_signed') ? 'אפשר לאשר רק מסמך שנחתם' : 'האישור נכשל'); return; }
    toast.success('המסמך אושר'); onApproved();
  };
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>אימות חתימה</DialogTitle><DialogDescription>{doc.title}</DialogDescription></DialogHeader>
        <ul className="space-y-2">{checks.map(c => <li key={c.label} className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${c.ok ? 'text-success' : 'text-destructive'}`} />{c.label}</li>)}</ul>
        <Button variant="outline" onClick={() => onOpen(doc.signed_pdf_path)}>פתיחת הקובץ החתום לבדיקה</Button>
        {doc.approved_at ? <p className="text-sm text-muted-foreground">אושר ב־{fmt(doc.approved_at)}{doc.approval_note ? ` · ${doc.approval_note}` : ''}</p> : <>
          <Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="הערה לאישור (לא חובה)" aria-label="הערה לאישור" />
          <div className="flex justify-between gap-2"><Button variant="outline" onClick={onClose}>ביטול</Button><Button disabled={busy || !checks.every(c => c.ok)} onClick={() => void approve()}>אישור המסמך</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
