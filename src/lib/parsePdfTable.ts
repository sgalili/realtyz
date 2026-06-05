// Extract a tabular structure from a PDF using pdfjs-dist.
// Groups text items by Y position into rows, sorts each row by X.
// For RTL/Hebrew strings that come back in visual order, reverse them
// so downstream CSV/XLSX header matching works.

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - vite worker import
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = PdfWorker;

const HEBREW_RE = /[\u0590-\u05FF]/;

function fixHebrew(s: string): string {
  if (!s) return s;
  if (!HEBREW_RE.test(s)) return s;
  // Reverse character order while keeping ASCII digit/number tokens intact.
  // Split by whitespace, reverse each Hebrew-containing token character order,
  // then reverse token order (RTL visual -> logical).
  const tokens = s.split(/(\s+)/);
  const fixed = tokens.map((tok) => {
    if (/^\s+$/.test(tok)) return tok;
    if (HEBREW_RE.test(tok)) {
      // Reverse only if it looks reversed (heuristic: any Hebrew token in PDF visual order)
      return tok.split('').reverse().join('');
    }
    return tok;
  });
  // Also reverse token order for RTL flow
  return fixed.reverse().join('').replace(/\s+/g, ' ').trim();
}

export interface PdfTableResult {
  headers: string[];
  rows: Record<string, string>[];
}

export async function parsePdfToRows(file: File): Promise<PdfTableResult> {
  const buf = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;

  const allLines: { y: number; items: { x: number; str: string }[] }[] = [];
  const maxPages = Math.min(pdf.numPages, 50);

  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group by Y (rounded)
    const lineMap = new Map<number, { x: number; str: string }[]>();
    for (const it of content.items as any[]) {
      const str = (it.str || '').trim();
      if (!str) continue;
      const tx = it.transform; // [a,b,c,d,e,f] — e=x, f=y
      const x = tx[4];
      const y = Math.round(tx[5]); // round to merge near-rows
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x, str });
    }
    // Push lines sorted top-to-bottom (higher y first in PDF coords)
    const sorted = Array.from(lineMap.entries()).sort((a, b) => b[0] - a[0]);
    for (const [y, items] of sorted) allLines.push({ y, items });
  }

  if (allLines.length === 0) return { headers: [], rows: [] };

  // Convert each line to cells sorted by x (LTR cell order)
  const lines = allLines.map((l) =>
    l.items.sort((a, b) => a.x - b.x).map((i) => fixHebrew(i.str))
  );

  // Use first non-empty line with >=2 cells as headers
  const headerIdx = lines.findIndex((l) => l.length >= 2);
  if (headerIdx === -1) return { headers: [], rows: [] };
  const headers = lines[headerIdx];
  const dataLines = lines.slice(headerIdx + 1).filter((l) => l.length > 0);

  const rows = dataLines.map((cells) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i] || `col_${i}`] = cells[i] ?? '';
    }
    return obj;
  });

  return { headers, rows };
}
