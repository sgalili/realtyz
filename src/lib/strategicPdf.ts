import { jsPDF } from 'jspdf';

type StrategicPdfData = {
  name: string;
  supporters: number;
  mandateTarget: number;
  progressPct: number;
  sentiment: { positive: number; neutral: number; negative: number };
  topics: string[];
  advice: string[];
};

const navy = '#1a1a2e';
const blue = '#2563eb';
const blueLight = '#dbeafe';
const silver = '#e5e7eb';
const darkSilver = '#6b7280';
const success = '#16a34a';
const warning = '#d97706';
const danger = '#dc2626';

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

export async function createStrategicPdf(data: StrategicPdfData) {
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const date = new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date());
  const font = 'Assistant, Heebo, Arial, sans-serif';

  const rtl = (text: string, x: number, y: number, size = 30, color = navy, weight = 700) => {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillText(text, x, y);
    ctx.restore();
  };
  const rtlLeft = (text: string, x: number, y: number, size = 26, color = navy, weight = 600) => {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillText(text, x, y);
    ctx.restore();
  };
  const ltr = (text: string, x: number, y: number, size = 26, color = navy, weight = 600, align: CanvasTextAlign = 'left') => {
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  // Background
  ctx.fillStyle = '#f7f8fa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Watermark
  ctx.save();
  ctx.translate(620, 880);
  ctx.rotate(-Math.PI / 5.5);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = navy;
  ctx.font = `900 150px ${font}`;
  ctx.textAlign = 'center';
  ctx.fillText('KALPIZ AI', 0, 0);
  ctx.restore();

  // ===== HEADER =====
  ctx.fillStyle = navy;
  ctx.fillRect(0, 0, 1240, 200);
  // Right side (primary, RTL)
  rtl('דוח אסטרטגי חסוי', 1160, 88, 42, '#ffffff', 900);
  rtl(data.name ? `הוכן עבור ${data.name}` : 'מסמך ייעוץ אסטרטגי', 1160, 138, 26, silver, 700);
  rtl(date, 1160, 172, 20, '#94a3b8', 600);
  // Left side - Kalpiz brand (LTR)
  ltr('KALPIZ', 80, 92, 38, '#ffffff', 900);
  ltr('AI Strategy Engine', 80, 132, 18, '#94a3b8', 600);

  // Accent line
  ctx.strokeStyle = blue;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(80, 230);
  ctx.lineTo(1160, 230);
  ctx.stroke();

  // ===== KPI SECTION =====
  rtl('תמונת מצב', 1160, 290, 36, navy, 900);
  rtl('· נתוני קמפיין בזמן אמת', 1010, 290, 18, darkSilver, 600);

  const kpis = [
    { label: 'תומכים פעילים', value: data.supporters.toLocaleString('he-IL'), trend: '+8.2%', color: success },
    { label: 'יעד מנדטים', value: String(data.mandateTarget), trend: 'יעד פעיל', color: blue },
    { label: 'התקדמות', value: `${data.progressPct}%`, trend: 'מסלול תקין', color: success },
  ];
  kpis.forEach((k, i) => {
    const x = 80 + i * 370;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = silver;
    ctx.lineWidth = 2;
    roundedRect(ctx, x, 320, 320, 160, 16);
    ctx.fill();
    ctx.stroke();
    // top accent bar
    ctx.fillStyle = k.color;
    roundedRect(ctx, x, 320, 320, 5, 16);
    ctx.fill();
    rtl(k.value, x + 290, 395, 44, navy, 900);
    rtl(k.label, x + 290, 432, 20, darkSilver, 700);
    rtl(k.trend, x + 290, 462, 16, k.color, 800);
  });

  // ===== SENTIMENT =====
  rtl('ניתוח סנטימנט ונושאים חמים', 1160, 540, 32, navy, 900);
  const totalSentiment = Math.max(1, data.sentiment.positive + data.sentiment.neutral + data.sentiment.negative);
  const bars = [
    ['חיובי', data.sentiment.positive, success],
    ['ניטרלי', data.sentiment.neutral, darkSilver],
    ['שלילי', data.sentiment.negative, danger],
  ] as const;
  bars.forEach(([label, value, color], i) => {
    const y = 590 + i * 50;
    rtl(label, 1160, y + 16, 20, navy, 700);
    ctx.fillStyle = silver;
    roundedRect(ctx, 240, y, 820, 20, 10);
    ctx.fill();
    ctx.fillStyle = color;
    roundedRect(ctx, 240, y, Math.max(24, (value / totalSentiment) * 820), 20, 10);
    ctx.fill();
    const pct = Math.round((value / totalSentiment) * 100);
    rtl(`${pct}% (${value.toLocaleString('he-IL')})`, 220, y + 16, 18, darkSilver, 700);
  });

  // Hot topics chips
  rtl('נושאים חמים השבוע:', 1160, 770, 20, navy, 800);
  const topics = data.topics.slice(0, 5);
  let chipX = 1080;
  topics.forEach((topic) => {
    ctx.font = `700 18px ${font}`;
    const textWidth = ctx.measureText(topic).width;
    const chipW = textWidth + 28;
    ctx.fillStyle = blueLight;
    roundedRect(ctx, chipX - chipW, 752, chipW, 32, 16);
    ctx.fill();
    rtl(topic, chipX - 14, 774, 18, blue, 800);
    chipX -= chipW + 10;
  });

  // ===== INSIGHT BANNER =====
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = blue;
  ctx.lineWidth = 3;
  roundedRect(ctx, 80, 815, 1080, 80, 14);
  ctx.fill();
  ctx.stroke();
  // Right accent stripe
  ctx.fillStyle = blue;
  roundedRect(ctx, 1090, 815, 70, 80, 14);
  ctx.fill();
  rtl('💡', 1140, 868, 32, '#ffffff', 800);
  rtl('זוהתה מגמת עליה בשיח סביב יוקר המחיה — חיזוק מסרים חברתיים יכול להניב +2.4 מנדטים פוטנציאליים.', 1070, 862, 22, navy, 800);

  // ===== AI STRATEGY =====
  rtl('המלצות אסטרטגיות מבוססות AI', 1160, 955, 32, navy, 900);
  data.advice.slice(0, 3).forEach((item, i) => {
    const y = 990 + i * 75;
    // Number circle
    ctx.fillStyle = blue;
    ctx.beginPath();
    ctx.arc(1140, y + 18, 18, 0, Math.PI * 2);
    ctx.fill();
    ltr(String(i + 1), 1140, y + 26, 22, '#ffffff', 900, 'center');
    rtl(item, 1110, y + 25, 22, navy, 700);
  });

  // ===== FORECAST =====
  rtl('תחזית 14 ימים — מסלול לעמידה ביעד', 1160, 1255, 28, navy, 900);
  // Forecast box
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = silver;
  ctx.lineWidth = 2;
  roundedRect(ctx, 80, 1280, 1080, 200, 14);
  ctx.fill();
  ctx.stroke();

  // Mini chart - projected growth line
  const chartX = 110;
  const chartY = 1310;
  const chartW = 480;
  const chartH = 150;
  // grid
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(chartX, gy);
    ctx.lineTo(chartX + chartW, gy);
    ctx.stroke();
  }
  // Projected curve
  const points: [number, number][] = [];
  for (let i = 0; i <= 14; i++) {
    const px = chartX + (chartW / 14) * i;
    const progress = data.progressPct + (100 - data.progressPct) * (i / 14) * 0.85;
    const py = chartY + chartH - (progress / 100) * chartH;
    points.push([px, py]);
  }
  // Area
  ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
  ctx.beginPath();
  ctx.moveTo(points[0][0], chartY + chartH);
  points.forEach(([px, py]) => ctx.lineTo(px, py));
  ctx.lineTo(points[points.length - 1][0], chartY + chartH);
  ctx.closePath();
  ctx.fill();
  // Line
  ctx.strokeStyle = blue;
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.stroke();
  // End marker
  const last = points[points.length - 1];
  ctx.fillStyle = blue;
  ctx.beginPath();
  ctx.arc(last[0], last[1], 6, 0, Math.PI * 2);
  ctx.fill();
  // Chart label
  rtl('יום 0', 175, 1480, 14, darkSilver, 600);
  rtl('יום 14', 575, 1480, 14, darkSilver, 600);

  // Forecast metrics (right side of box)
  const metrics = [
    { label: 'תומכים צפויים', value: Math.round(data.supporters * 1.18).toLocaleString('he-IL'), color: success },
    { label: 'התקדמות צפויה', value: `${Math.min(100, data.progressPct + 38)}%`, color: blue },
    { label: 'פער ליעד', value: `${Math.max(0, 100 - (data.progressPct + 38))}%`, color: warning },
  ];
  metrics.forEach((m, i) => {
    const my = 1310 + i * 55;
    rtl(m.value, 1130, my + 24, 28, m.color, 900);
    rtl(m.label, 1130, my + 50, 16, darkSilver, 700);
  });

  // ===== ACTION CHECKLIST =====
  rtl('פעולות מיידיות (72 שעות)', 1160, 1530, 24, navy, 900);
  const actions = [
    'שיגור מסר ב-WhatsApp לקהל המתלבטים בערים מובילות',
    'הפעלת קמפיין ממוקד מסביב לציר יוקר המחיה',
    'הכנת תשובות AI מאושרות לכל נושא חם',
  ];
  actions.forEach((a, i) => {
    const y = 1555 + i * 30;
    // checkbox
    ctx.strokeStyle = blue;
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, 1135, y - 14, 18, 18, 4);
    ctx.fill();
    ctx.stroke();
    rtl(a, 1115, y, 17, navy, 600);
  });

  // ===== FOOTER =====
  ctx.fillStyle = navy;
  ctx.fillRect(0, 1660, 1240, 94);
  ltr('CONFIDENTIAL · STRATEGIC BRIEF', 80, 1718, 18, silver, 800);
  rtl('הופק ע״י Kalpiz AI · מערכת לניהול קמפיינים חכמים', 1160, 1718, 20, '#ffffff', 800);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 595.28, 841.89);
  return pdf;
}

export async function getStrategicPdfBlob(data: StrategicPdfData) {
  const pdf = await createStrategicPdf(data);
  return pdf.output('blob');
}

export async function downloadStrategicPdf(data: StrategicPdfData) {
  const pdf = await createStrategicPdf(data);
  pdf.save(`kalpiz-strategic-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
