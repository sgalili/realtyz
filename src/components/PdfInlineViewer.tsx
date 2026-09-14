/**
 * Renders a PDF's pages as images directly inside the frame, so the document is
 * visible without an external viewer or a download tile (mobile browsers refuse
 * to render PDFs in an iframe).
 */
import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - vite url import for the worker bundle
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Loader2 } from 'lucide-react';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = PdfWorker;

export default function PdfInlineViewer({
  url,
  className = '',
}: {
  url: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';
    setLoading(true);
    setFailed(false);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;
        const targetWidth = Math.min(host.clientWidth || 720, 1000);

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = (targetWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.className = 'rounded-md border border-slate-200 bg-white shadow-sm';
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          host.appendChild(canvas);
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoading(false);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className={`relative overflow-y-auto bg-muted/40 ${className}`}>
      <div ref={hostRef} className="space-y-3 p-3" />
      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-background/70">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">
          לא ניתן להציג את המסמך כאן.
        </div>
      )}
    </div>
  );
}
