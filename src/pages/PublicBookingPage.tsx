import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Calendar } from 'lucide-react';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/book-meeting`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type SlotInfo = {
  ok: boolean;
  status: string;
  lead_name: string | null;
  proposed_slots: { start: string; end: string }[];
  duration_minutes: number;
  agent_name: string;
  booked_meeting_id?: string | null;
};

export default function PublicBookingPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<SlotInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmed, setConfirmed] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?token=${token}`, { headers: { apikey: ANON } });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Invalid link');
        setInfo(json);
        setName(json.lead_name || '');
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function confirm() {
    if (!chosen) return;
    setSubmitting(true);
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ token, slot_start: chosen, lead_name: name, lead_email: email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Booking failed');
      setConfirmed(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center"><Card className="p-6 max-w-md text-center"><p className="text-sm text-destructive">{error}</p></Card></div>;
  if (!info) return null;

  if (confirmed || info.status === 'booked') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="ltr">
        <Card className="p-6 max-w-md text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
          <h1 className="text-lg font-semibold">Meeting confirmed</h1>
          <p className="text-sm text-muted-foreground">A calendar invite has been sent. We'll also send a WhatsApp reminder 1 hour before.</p>
          {confirmed?.conference_link && (
            <a href={confirmed.conference_link} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Open Google Meet link</a>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="ltr">
      <Card className="p-6 max-w-md w-full space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Book a meeting</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {info.agent_name} has offered these times ({info.duration_minutes} min). Pick what works best:
        </p>
        <div className="space-y-2">
          {info.proposed_slots.map((s) => {
            const d = new Date(s.start);
            const label = d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const active = chosen === s.start;
            return (
              <button
                key={s.start}
                onClick={() => setChosen(s.start)}
                className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${active ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Your name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Email (for the calendar invite)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <Button className="w-full" disabled={!chosen || !name || submitting} onClick={confirm}>
          {submitting ? 'Booking…' : 'Confirm meeting'}
        </Button>
      </Card>
    </div>
  );
}
