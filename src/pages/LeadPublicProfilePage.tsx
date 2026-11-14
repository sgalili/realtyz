import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import VoterAvatar from '@/components/VoterAvatar';
import { useLeadProfileAccess } from '@/hooks/useLeadProfileAccess';

/** Leads are not platform users: never reinterpret a lead UUID as an account UUID. */
export default function LeadPublicProfilePage() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const access = useLeadProfileAccess(leadId);
  const close = () => { if (window.history.state?.idx > 0) navigate(-1); else navigate(leadId ? `/lead-crm/${encodeURIComponent(leadId)}` : '/lead-crm'); };
  const p = access.data;
  return <main dir="rtl" className="mx-auto w-full max-w-2xl space-y-6 pb-6">
    <header className="flex items-center justify-between gap-2"><h1 className="text-xl font-bold">הפרופיל של {p?.full_name || 'הלקוח'}</h1><Button size="icon" variant="ghost" aria-label="סגירה וחזרה לפרטים המלאים" title="חזרה לפרטים המלאים" onClick={close}><X className="h-5 w-5" /></Button></header>
    {access.isLoading ? <p className="text-center text-muted-foreground">טוען פרופיל…</p> : !p ? <p role="alert" className="text-center text-muted-foreground">הפרופיל אינו זמין</p> : <section className="flex flex-col items-center gap-3 text-center"><VoterAvatar fullName={p.full_name} profilePictureUrl={p.avatar_url} className="h-28 w-28" /><h2 className="text-xl font-bold">{p.full_name || 'לקוח'}</h2>{p.city && <p className="text-muted-foreground">{p.city}</p>}<Button variant="outline" onClick={close}><ArrowRight className="h-4 w-4" />חזרה לפרטים המלאים</Button></section>}
  </main>;
}