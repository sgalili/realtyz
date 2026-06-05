import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - vite worker import
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = PdfWorker;

const HEBREW_RE = /[\u0590-\u05FF]/;
const ROW_CLUSTER_GAP = 13;
const LINE_CLUSTER_GAP = 3;

const KNOWN_HEBREW_HEADERS = new Set([
  'סדורי', 'מספר', 'סוכן', 'שם', 'שם מלא', 'שם פרטי', 'משפחה', 'שם משפחה',
  'טלפון', 'טלפון נייד', 'נייד', 'מספר טלפון', 'אימייל', 'דואל', 'דוא״ל',
  'נכס', 'סוג נכס', 'חדר', 'חדרים', 'מחיר', 'עלות', 'מחיר מבוקש', 'עיר',
  'יישוב', 'ישוב', 'כתובת', 'רחוב', 'מס', 'קומה', 'שטח', 'גודל', 'מ״ר', 'מ"ר',
  'תיאור', 'כותרת', 'עדכון', 'פתיחה', 'תז', 'ת.ז', 'תעודת זהות',
]);

interface PdfTextItem {
  x: number;
  y: number;
  width: number;
  str: string;
}

interface HeaderCell {
  header: string;
  x: number;
}

function cleanText(s: string): string {
  return String(s ?? '')
    .replace(/[\u200e\u200f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(s: string): string {
  return cleanText(s)
    .replace(/["'`״]/g, '')
    .replace(/^[\d\s]+|[\d\s]+$/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function reverseHebrewPhrase(s: string): string {
  return s
    .split(/(\s+)/)
    .map((part) => (HEBREW_RE.test(part) ? part.split('').reverse().join('') : part))
    .reverse()
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function fixHeaderText(s: string): string {
  const cleaned = cleanText(s);
  const normalized = normalizeHeader(cleaned);
  if (KNOWN_HEBREW_HEADERS.has(normalized)) return normalized;

  const reversed = reverseHebrewPhrase(cleaned);
  const reversedNormalized = normalizeHeader(reversed);
  if (KNOWN_HEBREW_HEADERS.has(reversedNormalized)) return reversedNormalized;

  return cleaned;
}

function headerScore(headers: string[]): number {
  return headers.reduce((score, header) => {
    const normalized = normalizeHeader(header);
    if (KNOWN_HEBREW_HEADERS.has(normalized)) return score + 2;
    if (/^(phone|mobile|name|full name|city|price|rooms|address|title|description)$/i.test(normalized)) return score + 2;
    return score;
  }, 0);
}

function combineCellParts(parts: PdfTextItem[]): string {
  const hasHebrew = parts.some((part) => HEBREW_RE.test(part.str));
  const ordered = [...parts].sort((a, b) => {
    if (Math.abs(a.y - b.y) > LINE_CLUSTER_GAP) return b.y - a.y;
    return hasHebrew ? b.x - a.x : a.x - b.x;
  });
  return ordered.reduce((value, item) => {
    const next = cleanText(item.str);
    if (!next) return value;
    if (!value) return next;
    if (/[-/]$/.test(value) || /^[,./-]/.test(next)) return `${value}${next}`;
    if (/^[\d₪,.-]+$/.test(value) && /^[\d₪,.-]+$/.test(next)) return `${value}${next}`;
    return `${value} ${next}`;
  }, '');
}

function groupLineIntoCells(items: PdfTextItem[]): HeaderCell[] {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const groups: PdfTextItem[][] = [];
  for (const item of sorted) {
    const prevGroup = groups[groups.length - 1];
    const prev = prevGroup?.[prevGroup.length - 1];
    const prevRight = prev ? prev.x + prev.width : 0;
    if (prev && item.x - prevRight <= 4) {
      prevGroup.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups
    .map((group) => {
      const left = Math.min(...group.map((item) => item.x));
      const right = Math.max(...group.map((item) => item.x + item.width));
      return { header: fixHeaderText(combineCellParts(group)), x: (left + right) / 2 };
    })
    .filter((cell) => cell.header);
}

function groupItemsByLine(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const lines: PdfTextItem[][] = [];
  for (const item of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= LINE_CLUSTER_GAP);
    if (line) line.push(item);
    else lines.push([item]);
  }
  return lines;
}

function groupItemsByRow(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows: PdfTextItem[][] = [];
  for (const item of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= ROW_CLUSTER_GAP);
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows;
}

function nearestHeader(headers: HeaderCell[], item: PdfTextItem): HeaderCell | null {
  const center = item.x + item.width / 2;
  let best: HeaderCell | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const header of headers) {
    const distance = Math.abs(header.x - center);
    if (distance < bestDistance) {
      best = header;
      bestDistance = distance;
    }
  }
  return best;
}

function withSynthesizedFields(headers: string[], rows: Record<string, string>[]): PdfTableResult {
  const nameHeader = headers.find((header) => normalizeHeader(header) === 'שם');
  const familyHeader = headers.find((header) => normalizeHeader(header) === 'משפחה' || normalizeHeader(header) === 'שם משפחה');
  const hasFullName = headers.some((header) => normalizeHeader(header) === 'שם מלא');
  if (!nameHeader || !familyHeader || hasFullName) return { headers, rows };

  const finalHeaders = ['שם מלא', ...headers];
  const finalRows = rows.map((row) => ({
    'שם מלא': [row[nameHeader], row[familyHeader]].filter(Boolean).join(' ').trim(),
    ...row,
  }));
  return { headers: finalHeaders, rows: finalRows };
}

export interface PdfTableResult {
  headers: string[];
  rows: Record<string, string>[];
}

export async function parsePdfToRows(file: File): Promise<PdfTableResult> {
  const buf = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;

  let headers: string[] = [];
  const rows: Record<string, string>[] = [];
  const maxPages = Math.min(pdf.numPages, 50);

  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const it of content.items as any[]) {
      const str = cleanText(it.str || '');
      if (!str) continue;
      const tx = it.transform;
      items.push({ x: tx[4], y: tx[5], width: Number(it.width || 0), str });
    }
    if (!items.length) continue;

    const lines = groupItemsByLine(items)
      .map((line) => ({ items: line, cells: groupLineIntoCells(line) }))
      .filter((line) => line.cells.length >= 2);
    const scoredLines = lines
      .map((line) => ({ ...line, score: headerScore(line.cells.map((cell) => cell.header)) }))
      .sort((a, b) => b.score - a.score || b.items[0].y - a.items[0].y);
    const headerLine = scoredLines.find((line) => line.score >= 4) ?? scoredLines[0];
    if (!headerLine) continue;

    const headerCells = headerLine.cells;
    if (!headers.length || headerScore(headerCells.map((cell) => cell.header)) > headerScore(headers)) {
      headers = headerCells.map((cell) => cell.header || `col_${headers.length}`);
    }

    const dataItems = items.filter((item) => item.y < headerLine.items[0].y - LINE_CLUSTER_GAP);
    for (const rowItems of groupItemsByRow(dataItems)) {
      const cells = new Map<string, PdfTextItem[]>();
      for (const item of rowItems) {
        const header = nearestHeader(headerCells, item);
        if (!header) continue;
        if (!cells.has(header.header)) cells.set(header.header, []);
        cells.get(header.header)!.push(item);
      }

      const row: Record<string, string> = {};
      for (const header of headerCells) {
        row[header.header] = combineCellParts(cells.get(header.header) ?? []);
      }
      if (Object.values(row).some(Boolean)) rows.push(row);
    }
  }

  return withSynthesizedFields(headers, rows);
}
