// ============================================================
// brokerageAgreementPdf
// ------------------------------------------------------------
// טופס הזמנת שירותי תיווך (שכירות / רכישה) — the real Hebrew brokerage
// services order form, rendered fully right-to-left with an embedded Unicode
// font, the Homely digital-signature seal in the header, and live broker /
// client / property details.
// ============================================================
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import { HE_FONT, useHebrewFont, rtl, rtlLines, heDate, hePhone, heShekel } from "./hebrewPdf.ts";

export interface AgreementBroker {
  name: string;
  license: string;
  phone: string;
  email: string;
  office: string;
  agentId?: string | null;
}

export interface AgreementClient {
  name: string;
  identityNumber: string;
  phone: string;
  address: string;
  email: string;
}

export interface AgreementProperty {
  ownerName: string;
  address: string;
  kind: string;
  block: string;
  parcel: string;
  apartment: string;
  floor: string;
  rooms: string;
  price: number | null;
}

export interface AgreementOptions {
  dealType: "rent" | "sale";
  documentId: string;
  formNumber: string;
  broker: AgreementBroker;
  client: AgreementClient;
  properties: AgreementProperty[];
  /** Free-text addition ("תוספת/הערה"). */
  note?: string;
  /** Brokerage fee wording, e.g. "חודש שכירות אחד" or "2% ממחיר העסקה". */
  feeText: string;
  /** Optional agency logo (PNG/JPEG bytes) drawn at the top-right. */
  logo?: { data: Uint8Array; format: "PNG" | "JPEG" } | null;
}

const CLAUSES_COMMON = (dealType: "rent" | "sale", feeText: string): string[] => {
  const verb = dealType === "rent" ? "שכירות" : "רכישה";
  const contract = dealType === "rent" ? "הסכם השכירות" : "הסכם המכר";
  return [
    `אני החתום/ה מטה, מבקש/ת כי המתווך יפעל בשמי ועבורי למציאת נכס מקרקעין למטרת ${verb}.`,
    'אני מצהיר/ה כי המתווך הציג בפני את הנכסים המפורטים בהסכם זה (להלן: "הנכסים") לראשונה, ובמידה שיתבצע משא ומתן בקשר לאחד או יותר מהנכסים, באמצעותי או על ידי מי מטעמי, אני מתחייב/ת לדווח על כך מיד למתווך.',
    'הנני מתחייב/ת שלא למסור כל מידע שקיבלתי מהמתווך ביחס לנכסים לצד ג\' כלשהו, אלא לשם קיום העסקה ותוך התחייבות לתשלום דמי תיווך. הנני מתחייב/ת לפצות את המתווך בגין כל נזק, הפסד או הוצאה שייגרמו לו עקב הפרת התחייבות זו, וזאת בנוסף לתשלום דמי התיווך.',
    `הנני מצהיר/ה ומאשר/ת כי המתווך הוא הגורם היעיל והמרכזי לכל התקשרות ל${verb} של נכס אחד או יותר מהנכסים המפורטים בהסכם זה. למען הסר ספק, כל עסקה שאבצע או התחייבות לבצע עסקה בקשר לאחד או יותר מהנכסים המפורטים בהסכם זה, תחייב אותי בדמי תיווך כמפורט בסעיף 6 להלן.`,
    `מיד עם חתימת ${contract} ביני ו/או מי מטעמי לבין בעל נכס מהנכסים המפורטים בהסכם זה, או התחייבות לביצוע עסקה כאמור (לפי המוקדם מביניהם), אדווח על כך למתווך ואשלם את דמי התיווך בסך המפורט בסעיף 6 להלן.`,
    `דמי התיווך שאני מתחייב/ת לשלם למתווך הם בסך ${feeText}, בתוספת מס ערך מוסף כדין.`,
    "הנני מתחייב/ת כי במידה ואחתום על הסכם מחייב ביחס לנכס מהנכסים המפורטים בהסכם זה, אזי חובת תשלום דמי התיווך כמפורט בהסכם זה תחול עליי גם אם מכל סיבה שהיא יבוטל אותו הסכם.",
    `אני מאשר/ת כי אין מניעה שהמתווך יגבה דמי תיווך גם מ${dealType === "rent" ? "משכיר" : "מוכר"} הנכס.`,
    `אני מאשר/ת כי המתווך יוכל לפרסם או להודיע לציבור בכל דרך שיימצא לנכון, על ${dealType === "rent" ? "השכרת" : "מכירת"} הנכס ועל ${verb} הנכס על ידי.`,
    "אני מצהיר/ה שהומלץ לי על ידי המתווך להיעזר בשירותים של בעלי מקצוע שונים, לרבות עורך דין ו/או מהנדס, וכן לבדוק בעצמי ברשויות השונות את הזכויות בנכס, לרבות מצבו המשפטי ו/או הפיזי ו/או התכנוני, במסגרת ביצוע העסקה.",
    "הסכם זה על כל הוראותיו יהיה תקף כל עוד לא שונה בכתב ובחתימת הצדדים.",
    "מקום בו הלקוח כולל מספר גורמים, כל אחד מיחידי הלקוח יהיה אחראי יחד ולחוד לקיום ההתחייבויות לפי הסכם זה.",
    "הריני מאשר/ת כי בטרם חתימתי על מסמך זה קיבלתי הסבר על הנקודות המרכזיות בטופס הנ\"ל.",
    "הריני מאשר/ת למתווך להציע לי הצעות נוספות בנוגע לנכסים אחרים.",
    "ידוע לי כי המתווך עשוי לייצג גם את הצד השני לעסקה, וכי במקרה כזה המתווך מחויב לפעול בהגינות כלפי שני הצדדים.",
    "כל האמור בהסכם זה בלשון זכר ו/או יחיד נעשה לצרכי נוחות בלבד, ומתייחס גם ללשון נקבה ולרבים.",
  ];
};

export async function buildBrokerageAgreementPdf(opts: AgreementOptions): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  await useHebrewFont(doc);

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const RIGHT = W - M;
  const contentW = W - M * 2;
  let y = M;

  const ensure = (needed: number) => {
    if (y + needed <= H - 56) return;
    doc.addPage();
    y = M;
  };

  // right-aligned Hebrew line
  const he = (text: string, size = 10, bold = false, x = RIGHT) => {
    doc.setFont(HE_FONT, bold ? "bold" : "normal").setFontSize(size);
    doc.text(rtl(text), x, y, { align: "right" });
  };
  const heAt = (text: string, x: number, yy: number, size = 9, bold = false, align: "right" | "left" | "center" = "right") => {
    doc.setFont(HE_FONT, bold ? "bold" : "normal").setFontSize(size);
    doc.text(rtl(text), x, yy, { align });
  };

  // ---------- Header: seal + agency logo + broker block ----------
  const headerTop = y;
  if (opts.logo) {
    try {
      doc.addImage(opts.logo.data, opts.logo.format, RIGHT - 90, headerTop, 90, 40);
    } catch { /* a bad logo must never break the document */ }
  } else {
    doc.setDrawColor(30, 64, 120).setLineWidth(1).roundedRect(RIGHT - 90, headerTop, 90, 40, 6, 6);
    heAt(opts.office(), RIGHT - 45, headerTop + 25, 12, true, "center");
  }

  // Homely digital-signature seal
  doc.setDrawColor(20, 110, 90).setLineWidth(1.2).circle(M + 32, headerTop + 22, 30);
  doc.setDrawColor(20, 110, 90).setLineWidth(0.5).circle(M + 32, headerTop + 22, 25);
  doc.setTextColor(20, 110, 90);
  heAt("הומלי", M + 32, headerTop + 18, 12, true, "center");
  heAt("החתמה דיגיטלית", M + 32, headerTop + 32, 6, false, "center");
  doc.setTextColor(0);

  y = headerTop + 18;
  he(opts.broker.name, 12, true, RIGHT - 100);
  y += 14;
  he(`${opts.broker.office} | רישיון תיווך: ${opts.broker.license}`, 9, false, RIGHT - 100);
  y += 12;
  he(`${hePhone(opts.broker.phone)} | ${opts.broker.email}`, 9, false, RIGHT - 100);
  y = headerTop + 62;
  doc.setDrawColor(210).setLineWidth(0.7).line(M, y, RIGHT, y);
  y += 26;

  // ---------- Title ----------
  const title = opts.dealType === "rent"
    ? 'הזמנת שירותי תיווך לשכירת נכס נדל"ן'
    : 'הזמנת שירותי תיווך לרכישת נכס נדל"ן';
  heAt(title, W / 2, y, 16, true, "center");
  y += 16;
  heAt(`טופס מספר ${opts.formNumber} | תאריך ${heDate()}`, W / 2, y, 9, false, "center");
  y += 8;
  doc.setTextColor(130);
  heAt(`מזהה מסמך: ${opts.documentId}`, W / 2, y + 8, 7, false, "center");
  doc.setTextColor(0);
  y += 30;

  // ---------- Parties table ----------
  const drawPartyRow = (label: string, lines: string[]) => {
    const labelW = 90;
    const bodyW = contentW - labelW;
    const wrapped = lines.flatMap((l) => rtlLines(doc, l, bodyW - 16));
    const rowH = Math.max(34, wrapped.length * 13 + 14);
    ensure(rowH);
    doc.setDrawColor(200).setLineWidth(0.6).rect(M, y, contentW, rowH);
    doc.line(RIGHT - labelW, y, RIGHT - labelW, y + rowH);
    doc.setFillColor(238, 243, 250);
    doc.rect(RIGHT - labelW, y, labelW, rowH, "F");
    doc.setDrawColor(200).rect(RIGHT - labelW, y, labelW, rowH);
    heAt(label, RIGHT - labelW / 2, y + rowH / 2 + 4, 10, true, "center");
    doc.setFont(HE_FONT, "normal").setFontSize(9);
    let ly = y + 17;
    for (const line of wrapped) {
      doc.text(line, RIGHT - labelW - 8, ly, { align: "right" });
      ly += 13;
    }
    y += rowH;
  };

  drawPartyRow("המתווך", [
    `שם מלא: ${opts.broker.name}   |   משרד: ${opts.broker.office}`,
    `רישיון תיווך: ${opts.broker.license}   |   טלפון: ${hePhone(opts.broker.phone)}   |   דוא"ל: ${opts.broker.email}`,
    '(להלן: "המתווך")',
  ]);
  drawPartyRow("הלקוח", [
    `שם מלא: ${opts.client.name}   |   ת.ז.: ${opts.client.identityNumber}`,
    `טלפון: ${hePhone(opts.client.phone)}   |   כתובת: ${opts.client.address}   |   דוא"ל: ${opts.client.email}`,
    '(להלן: "הלקוח")',
  ]);
  y += 24;

  // ---------- Clauses ----------
  he("הזמנת השירותים", 12, true);
  y += 16;
  const clauses = CLAUSES_COMMON(opts.dealType, opts.feeText);
  const numW = 20;
  clauses.forEach((clause, i) => {
    const lines = rtlLines(doc, clause, contentW - numW);
    ensure(lines.length * 12 + 10);
    doc.setFont(HE_FONT, "bold").setFontSize(9.5);
    doc.text(`.${i + 1}`, RIGHT, y, { align: "right" });
    doc.setFont(HE_FONT, "normal").setFontSize(9.5);
    lines.forEach((line, li) => {
      doc.text(line, RIGHT - numW, y + li * 12, { align: "right" });
    });
    y += lines.length * 12 + 7;
  });
  y += 10;

  // ---------- Note ----------
  ensure(50);
  he("תוספת / הערה", 11, true);
  y += 6;
  const noteLines = opts.note?.trim() ? rtlLines(doc, opts.note.trim(), contentW - 16) : [];
  const noteH = Math.max(36, noteLines.length * 12 + 16);
  ensure(noteH);
  doc.setDrawColor(210).setLineWidth(0.6).rect(M, y, contentW, noteH);
  doc.setFont(HE_FONT, "normal").setFontSize(9);
  noteLines.forEach((line, i) => doc.text(line, RIGHT - 8, y + 16 + i * 12, { align: "right" }));
  y += noteH + 24;

  // ---------- Properties table ----------
  ensure(70);
  he("פרטי הנכסים", 12, true);
  y += 14;
  const cols: Array<{ key: keyof AgreementProperty | "price"; label: string; w: number }> = [
    { key: "ownerName", label: "בעלים", w: 62 },
    { key: "address", label: "כתובת", w: 130 },
    { key: "kind", label: "סוג", w: 48 },
    { key: "block", label: "גוש", w: 45 },
    { key: "parcel", label: "חלקה", w: 45 },
    { key: "apartment", label: "דירה", w: 42 },
    { key: "floor", label: "קומה", w: 42 },
    { key: "rooms", label: "חדרים", w: 45 },
    { key: "price", label: "מחיר מבוקש", w: contentW - (62 + 130 + 48 + 45 + 45 + 42 + 42 + 45) },
  ];
  const headH = 20;
  ensure(headH + 26 * opts.properties.length);
  doc.setFillColor(238, 243, 250).rect(M, y, contentW, headH, "F");
  doc.setDrawColor(200).setLineWidth(0.6).rect(M, y, contentW, headH);
  let cx = RIGHT;
  for (const col of cols) {
    heAt(col.label, cx - col.w / 2, y + 14, 8.5, true, "center");
    cx -= col.w;
    if (cx > M + 1) doc.line(cx, y, cx, y + headH);
  }
  y += headH;
  for (const p of opts.properties) {
    const rowH = 26;
    ensure(rowH);
    doc.setDrawColor(200).rect(M, y, contentW, rowH);
    let x = RIGHT;
    for (const col of cols) {
      const raw = col.key === "price" ? heShekel(p.price) : String((p as any)[col.key] ?? "");
      const value = raw && raw !== "undefined" ? raw : "—";
      doc.setFont(HE_FONT, "normal").setFontSize(8.5);
      doc.text(rtl(value), x - col.w / 2, y + 17, { align: "center", maxWidth: col.w - 4 });
      x -= col.w;
      if (x > M + 1) doc.line(x, y, x, y + rowH);
    }
    y += rowH;
  }
  y += 30;

  // ---------- Signatures ----------
  ensure(110);
  const colW = (contentW - 30) / 2;
  const brokerX = RIGHT;
  const clientX = RIGHT - colW - 30;
  doc.setDrawColor(60).setLineWidth(0.8);
  doc.line(brokerX - colW, y + 34, brokerX, y + 34);
  doc.line(clientX - colW, y + 34, clientX, y + 34);
  heAt(opts.broker.name, brokerX, y + 48, 9.5, true);
  heAt(`ת.ז. סוכן ${opts.broker.agentId || opts.broker.license}`, brokerX, y + 60, 8);
  heAt("חתימת המתווך", brokerX, y + 72, 8);
  heAt(opts.client.name, clientX, y + 48, 9.5, true);
  heAt(`ת.ז. ${opts.client.identityNumber}`, clientX, y + 60, 8);
  heAt("חתימת הלקוח", clientX, y + 72, 8);
  y += 92;

  // ---------- Footer on every page ----------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(225).setLineWidth(0.5).line(M, H - 44, RIGHT, H - 44);
    doc.setTextColor(130);
    heAt("מסמך זה הופק על ידי מערכת ההחתמות הדיגיטליות של הומלי", RIGHT, H - 30, 7.5);
    doc.setFont(HE_FONT, "normal").setFontSize(7.5);
    doc.text(rtl(`עמוד ${p} מתוך ${pages}`), M, H - 30, { align: "left" });
    doc.setTextColor(0);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
