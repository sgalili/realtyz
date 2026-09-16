/**
 * Public document signing page. No auth — identity is bound to the secret
 * token in the URL. Loads document metadata via the public sign edge fn,
 * shows the PDF in an iframe, captures a drawn signature, and submits.
 */
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Loader2, FileSignature, CheckCircle2, ShieldCheck, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import PdfInlineViewer from '@/components/PdfInlineViewer';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-closing-doc`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type Doc = {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'expired' | 'cancelled';
  signer_name: string | null;
  signed_at: string | null;
  pdf_url: string | null;
  property_address?: string | null;
  tour_date?: string | null;
};

/** "יום שני, 14/09/2026, 17:30" from an ISO / datetime-local tour date. */
function formatMeeting(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  const day = d.toLocaleDateString('he-IL', { weekday: 'long', timeZone: 'Asia/Jerusalem' });
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jerusalem' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
  return `${day}, ${date}, ${time}`;
}

export default function SignDocument() {
  const { token } = useParams<{ token: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, {
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'לא ניתן לטעון את המסמך');
        setDoc(json);
        const parts = String(json.signer_name || '').trim().split(/\s+/).filter(Boolean);
        if (parts.length) {
          setFirstName(parts[0]);
          setLastName(parts.slice(1).join(' '));
        }
      } catch (e: any) {
        setError(e?.message || 'לא ניתן לטעון את המסמך');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);


  function setupCanvas(c: HTMLCanvasElement) {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }

  useEffect(() => {
    if (canvasRef.current) setupCanvas(canvasRef.current);
  }, [doc]);

  function pointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    c.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = pointer(e);
    const ctx = c.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const c = canvasRef.current!;
    const { x, y } = pointer(e);
    const ctx = c.getContext('2d')!;
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInkRef.current = true;
    if (!hasInk) setHasInk(true);
  }
  function endDraw() {
    drawingRef.current = false;
  }
  function clearCanvas() {
    const c = canvasRef.current;
    if (c) {
      setupCanvas(c);
      hasInkRef.current = false;
      setHasInk(false);
    }
  }

  const idDigits = idNumber.replace(/\D/g, '');
  const canSubmit =
    !!firstName.trim() && !!lastName.trim() && idDigits.length >= 5 && hasInk;

  async function submit() {
    if (!doc || !canvasRef.current) return;
    if (!firstName.trim()) {
      toast.error('יש להקליד שם פרטי');
      return;
    }
    if (!lastName.trim()) {
      toast.error('יש להקליד שם משפחה');
      return;
    }
    if (idDigits.length < 5) {
      toast.error('יש להקליד מספר תעודת זהות תקין');
      return;
    }
    if (!hasInkRef.current) {
      toast.error('יש לצייר את החתימה');
      return;
    }
    setSubmitting(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          token,
          signature_data: dataUrl,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          identity_number: idDigits,
          signer_name: `${firstName.trim()} ${lastName.trim()}`,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'החתימה נכשלה');
      setSuccess(true);
    } catch (e: any) {
      toast.error('החתימה נכשלה', { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (error || !doc) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-background">
        <Card className="p-8 max-w-md text-center">
          <h1 className="text-lg font-semibold">המסמך אינו זמין</h1>
          <p className="text-sm text-muted-foreground mt-2">{error || 'הקישור אינו תקף או שפג תוקפו.'}</p>
        </Card>
      </main>
    );
  }

  if (success || doc.status === 'signed') {
    const meeting = formatMeeting(doc.tour_date);
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-background" dir="rtl">
        <Card className="p-8 max-w-md text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
          <h1 className="text-xl font-semibold">
            {doc.property_address && meeting
              ? `תודה, נתראה ב-${doc.property_address} ב-${meeting}`
              : doc.property_address
                ? `תודה, נתראה ב-${doc.property_address}`
                : 'תודה, החתימה נרשמה'}
          </h1>
          <p className="text-sm text-muted-foreground">
            החתימה שלך על <strong>{doc.title}</strong> נרשמה והמתווך/ת קיבל/ה עדכון.
          </p>
          <Button variant="outline" onClick={() => window.close()}>
            סגור
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30" dir="rtl">
      <header className="bg-card border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <FileSignature className="h-6 w-6 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{doc.title}</h1>
            <p className="text-xs text-muted-foreground">חתימה מאובטחת — חדר סגירה דיגיטלי של Realtyz</p>
          </div>
          <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> קישור מוצפן
          </span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 pb-4 space-y-4">
        <Card className="overflow-hidden">
          {doc.pdf_url ? (
            <PdfInlineViewer url={doc.pdf_url} className="h-[70vh]" />
          ) : (
            <div className="h-[40vh] grid place-items-center text-sm text-muted-foreground">
              תצוגה מקדימה לא זמינה
            </div>
          )}
        </Card>

        {/* Signature block stays pinned to the bottom of the viewport so the
            client always sees it while scrolling the document. */}
        <Card className="sticky bottom-2 z-20 p-4 space-y-3 shadow-lg border-primary/20">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">
                שם פרטי <span className="text-destructive">*</span>
              </label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="שם פרטי"
                className="mt-1"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                שם משפחה <span className="text-destructive">*</span>
              </label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="שם משפחה"
                className="mt-1"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                תעודת זהות <span className="text-destructive">*</span>
              </label>
              <Input
                value={idNumber}
                inputMode="numeric"
                onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="9 ספרות"
                className="mt-1"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">
                ציירו את החתימה <span className="text-destructive">*</span>
              </label>
              <button
                type="button"
                onClick={clearCanvas}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <Eraser className="h-3 w-3" /> ניקוי
              </button>
            </div>
            <div className="border rounded-lg bg-background overflow-hidden">
              <canvas
                ref={canvasRef}
                width={600}
                height={180}
                className="w-full h-32 sm:h-40 touch-none cursor-crosshair"
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
                onPointerCancel={endDraw}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              בחתימה זו אני מאשר/ת שהחתימה האלקטרונית שווה מבחינה משפטית לחתימה ידנית על מסמך זה.
            </p>
          </div>

          <Button className="w-full h-12 text-base" onClick={submit} disabled={submitting || !canSubmit}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 ml-2 animate-spin" />חותם…</>
            ) : (
              <><FileSignature className="h-4 w-4 ml-2" />חתימה ושליחה</>
            )}
          </Button>
          {!canSubmit && (
            <p className="text-[11px] text-muted-foreground text-center">
              יש למלא שם פרטי, שם משפחה, תעודת זהות ולצייר חתימה.
            </p>
          )}
        </Card>
      </div>

      </div>
    </main>
  );
}
