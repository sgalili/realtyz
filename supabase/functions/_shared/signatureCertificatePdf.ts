// ============================================================
// signatureCertificatePdf
// ------------------------------------------------------------
// אישור חתימה דיגיטלית — the Hebrew, right-to-left certificate page appended
// to a signed document. Drawn with jsPDF because pdf-lib's built-in fonts
// cannot encode Hebrew characters.
// ============================================================
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import { HE_FONT, useHebrewFont, rtl, rtlLines, heDate } from "./hebrewPdf.ts";

export interface CertificateOptions {
  title: string;
  signerName: string;
  signedAt: Date;
  token: string;
  signatureDataUrl: string;
}

export async function buildSignatureCertificate(opts: CertificateOptions): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  await useHebrewFont(doc);

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const RIGHT = W - M;
  let y = M + 20;

  // Realtyz digital-signature seal
  doc.setDrawColor(20, 110, 90).setLineWidth(1.2).circle(M + 32, M + 14, 28);
  doc.setDrawColor(20, 110, 90).setLineWidth(0.5).circle(M + 32, M + 14, 23);
  doc.setTextColor(20, 110, 90).setFont(HE_FONT, "bold").setFontSize(10);
  doc.text(rtl("Realtyz"), M + 32, M + 11, { align: "center" });
  doc.setFont(HE_FONT, "normal").setFontSize(6);
  doc.text(rtl("החתמה דיגיטלית"), M + 32, M + 24, { align: "center" });
  doc.setTextColor(0);

  doc.setFont(HE_FONT, "bold").setFontSize(18);
  doc.text(rtl("אישור חתימה דיגיטלית"), RIGHT, y, { align: "right" });
  y += 24;
  doc.setDrawColor(215).setLineWidth(0.7).line(M, y, RIGHT, y);
  y += 26;

  const row = (label: string, value: string) => {
    doc.setFont(HE_FONT, "bold").setFontSize(10);
    doc.text(rtl(`${label}:`), RIGHT, y, { align: "right" });
    doc.setFont(HE_FONT, "normal").setFontSize(10);
    const lines = rtlLines(doc, value, W - M * 2 - 110);
    lines.forEach((line, i) => doc.text(line, RIGHT - 110, y + i * 13, { align: "right" }));
    y += Math.max(18, lines.length * 13 + 5);
  };

  row("מסמך", opts.title);
  row("שם החותם", opts.signerName);
  row("תאריך חתימה", `${heDate(opts.signedAt)} ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(opts.signedAt)}`);
  row("מזהה קישור חתימה", `${opts.token.slice(0, 12)}…${opts.token.slice(-6)}`);
  y += 16;

  doc.setFont(HE_FONT, "bold").setFontSize(11);
  doc.text(rtl("חתימת הלקוח"), RIGHT, y, { align: "right" });
  y += 12;

  const base64 = opts.signatureDataUrl.split(",")[1];
  const sigW = 300, sigH = 110;
  try {
    if (!base64) throw new Error("empty signature");
    const format = /^data:image\/jpe?g/i.test(opts.signatureDataUrl) ? "JPEG" : "PNG";
    doc.addImage(opts.signatureDataUrl, format, RIGHT - sigW, y, sigW, sigH);
  } catch {
    doc.setFont(HE_FONT, "normal").setFontSize(9);
    doc.text(rtl("[לא ניתן היה לשבץ את תמונת החתימה]"), RIGHT, y + 20, { align: "right" });
  }
  y += sigH + 6;
  doc.setDrawColor(60).setLineWidth(0.8).line(RIGHT - sigW, y, RIGHT, y);
  y += 14;
  doc.setFont(HE_FONT, "normal").setFontSize(9);
  doc.text(rtl(opts.signerName), RIGHT, y, { align: "right" });
  y += 24;
  doc.setTextColor(120).setFontSize(8.5);
  const legal = rtlLines(
    doc,
    'החתימה נאספה באמצעות קישור אישי ומאובטח. מסמך זה מהווה אישור לכך שהחותם עיין במסמך המקורי המצורף לעיל ואישר אותו בחתימה אלקטרונית.',
    W - M * 2,
  );
  legal.forEach((line, i) => doc.text(line, RIGHT, y + i * 12, { align: "right" }));

  doc.setDrawColor(225).setLineWidth(0.5).line(M, H - 44, RIGHT, H - 44);
  doc.setTextColor(130).setFontSize(7.5);
  doc.text(rtl("מסמך זה הופק על ידי מערכת ההחתמות הדיגיטליות של Realtyz"), RIGHT, H - 30, { align: "right" });

  return new Uint8Array(doc.output("arraybuffer"));
}
