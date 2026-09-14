// ============================================================
// hebrewPdf
// ------------------------------------------------------------
// jsPDF ships only with Latin core fonts and no bidi engine, so Hebrew text
// came out as mojibake and left-to-right. This module gives every PDF surface
// two things:
//   1. A real Unicode TTF (DejaVu Sans — full Hebrew block, ₪, smart quotes)
//      fetched once per isolate and registered in the jsPDF virtual FS.
//   2. A light bidi pass that converts LOGICAL Hebrew text into the VISUAL
//      order jsPDF draws, while keeping Latin/number/email runs intact.
// ============================================================

const FONT_URLS = {
  normal: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf",
  bold: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf",
};

export const HE_FONT = "DejaVuSans";

let cache: { normal: string; bold: string } | null = null;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFonts(): Promise<{ normal: string; bold: string }> {
  if (cache) return cache;
  const [n, b] = await Promise.all(
    [FONT_URLS.normal, FONT_URLS.bold].map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`font fetch failed (${res.status}) ${url}`);
      return toBase64(new Uint8Array(await res.arrayBuffer()));
    }),
  );
  cache = { normal: n, bold: b };
  return cache;
}

/** Registers the Hebrew-capable font on a jsPDF document and selects it. */
export async function useHebrewFont(doc: any): Promise<void> {
  const fonts = await loadFonts();
  doc.addFileToVFS("DejaVuSans.ttf", fonts.normal);
  doc.addFont("DejaVuSans.ttf", HE_FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans-Bold.ttf", HE_FONT, "bold");
  doc.setFont(HE_FONT, "normal");
  doc.setLanguage?.("he");

  // jsPDF runs its own bidi pass on every text() call, which re-orders the
  // strings we already laid out visually (digit runs came out mirrored:
  // 3251767 -> 7671523). Forcing isOutputVisual tells jsPDF the string is
  // already in visual order, so it draws our glyphs untouched.
  if (!doc.__heTextPatched) {
    const nativeText = doc.text.bind(doc);
    doc.text = (text: any, x: any, y: any, options: any = {}, ...rest: any[]) =>
      nativeText(text, x, y, { ...options, isOutputVisual: true }, ...rest);
    doc.__heTextPatched = true;
  }
}

const MIRROR: Record<string, string> = {
  "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{",
  "<": ">", ">": "<", "«": "»", "»": "«",
};

/**
 * Logical → visual reordering for a single line of mixed Hebrew/Latin text.
 * Latin words, numbers, emails, phone numbers and URLs stay left-to-right;
 * everything else is reversed so the line reads correctly right-to-left.
 */
export function rtl(input: string): string {
  const text = String(input ?? "");
  if (!text) return "";
  const tokens = text.match(/[0-9A-Za-z@._+\-/:%&'#]+|[\s\S]/g) ?? [];
  return tokens
    .reverse()
    .map((t) => (t.length === 1 && MIRROR[t] ? MIRROR[t] : t))
    .join("");
}

/** Wraps LOGICAL text to `width`, returning VISUAL lines ready to draw. */
export function rtlLines(doc: any, text: string, width: number): string[] {
  const logical = doc.splitTextToSize(String(text ?? ""), width) as string[];
  return logical.map((line) => rtl(line));
}

/** Hebrew number formatting: 8000 -> "8,000". */
export function heNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n));
}

/** Shekel amount, written so it reads correctly in a right-to-left line. */
export function heShekel(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${heNumber(n)} ₪`;
}

/** Israeli phone display: 0522973500 -> 052-2973500. */
export function hePhone(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const local = digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
  if (/^05\d{8}$/.test(local)) return `${local.slice(0, 3)}-${local.slice(3)}`;
  if (/^0\d{8}$/.test(local)) return `${local.slice(0, 2)}-${local.slice(2)}`;
  return local || "—";
}

/** dd/mm/yyyy in Israel time. */
export function heDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
