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

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-closing-doc`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type Doc = {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'expired' | 'cancelled';
  signer_name: string | null;
  signed_at: string | null;
  pdf_url: string | null;
};

export default function SignDocument() {
  const { token } = useParams<{ token: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, {
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Could not load document');
        setDoc(json);
        setSignerName(json.signer_name || '');
      } catch (e: any) {
        setError(e?.message || 'Could not load document');
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
  }
  function endDraw() {
    drawingRef.current = false;
  }
  function clearCanvas() {
    const c = canvasRef.current;
    if (c) {
      setupCanvas(c);
      hasInkRef.current = false;
    }
  }

  async function submit() {
    if (!doc || !canvasRef.current) return;
    if (!hasInkRef.current) {
      toast.error('Please draw your signature');
      return;
    }
    if (!signerName.trim()) {
      toast.error('Please type your full name');
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
          signer_name: signerName.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Signing failed');
      setSuccess(true);
    } catch (e: any) {
      toast.error('Could not sign', { description: e?.message });
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
          <h1 className="text-lg font-semibold">Document unavailable</h1>
          <p className="text-sm text-muted-foreground mt-2">{error || 'This link is invalid or has expired.'}</p>
        </Card>
      </main>
    );
  }

  if (success || doc.status === 'signed') {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-background">
        <Card className="p-8 max-w-md text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
          <h1 className="text-xl font-semibold">All signed!</h1>
          <p className="text-sm text-muted-foreground">
            Thanks {doc.signer_name || signerName}. Your signature on <strong>{doc.title}</strong> has been recorded. Your agent has been notified.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30" dir="ltr">
      <header className="bg-card border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <FileSignature className="h-6 w-6 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{doc.title}</h1>
            <p className="text-xs text-muted-foreground">Secure signing — Realtyz Digital Closing Room</p>
          </div>
          <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Encrypted link
          </span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <Card className="overflow-hidden">
          <div className="aspect-[8.5/11] sm:aspect-auto sm:h-[70vh] bg-muted">
            {doc.pdf_url ? (
              <iframe
                src={doc.pdf_url}
                title="Document preview"
                className="w-full h-full"
              />
            ) : (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">
                Preview unavailable
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div>
            <label className="text-sm font-medium">Full legal name</label>
            <Input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="As it appears on your ID"
              className="mt-1"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Draw your signature</label>
              <button
                type="button"
                onClick={clearCanvas}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <Eraser className="h-3 w-3" /> Clear
              </button>
            </div>
            <div className="border rounded-lg bg-background overflow-hidden">
              <canvas
                ref={canvasRef}
                width={600}
                height={180}
                className="w-full h-44 touch-none cursor-crosshair"
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
                onPointerCancel={endDraw}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              By signing, you agree this electronic signature is the legal equivalent of your handwritten signature on this document.
            </p>
          </div>

          <Button className="w-full h-12 text-base" onClick={submit} disabled={submitting}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing…</>
            ) : (
              <><FileSignature className="h-4 w-4 mr-2" />Sign & submit</>
            )}
          </Button>
        </Card>
      </div>
    </main>
  );
}
