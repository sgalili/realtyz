export type ScrapingFeature = { feature: string; operation: string; attempts: number; in_flight: number; successes: number; errors: number; cache_hits: number; bytes: number; avg_ms: number | null };
export type ScrapingReport = {
  from: string; to: string; checked_at: string; tracking_started_at: string | null;
  features: ScrapingFeature[];
  daily: { day: string; attempts: number; cache_hits: number; errors: number }[];
  credits: { feature: string; charges: number; credits: number }[];
  runs: { source: string; slot: string; status: string; claimed_at: string; scraped_count: number; new_count: number }[];
  last_hour: { attempts: number; errors: number; credits: number };
  alerts: { provider_denials: number; errors_today: number; stalled_calls: number; empty_runs: number; last_scheduled_run: string | null };
};
export function scrapingAlerts(report: ScrapingReport) {
  const alerts: string[] = [];
  if (report.alerts.provider_denials) alerts.push(`Bright Data דחה ${report.alerts.provider_denials} בקשות ב־24 השעות האחרונות`);
  if (report.alerts.stalled_calls) alerts.push(`${report.alerts.stalled_calls} פעולות לא דיווחו סיום`);
  if (report.alerts.errors_today) alerts.push(`${report.alerts.errors_today} שגיאות ב־24 השעות האחרונות`);
  if (report.alerts.empty_runs) alerts.push(`${report.alerts.empty_runs} ריצות מתוזמנות הסתיימו ללא נכסים בתקופה הנבחרת`);
  if (report.alerts.last_scheduled_run && Date.now() - Date.parse(report.alerts.last_scheduled_run) > 26 * 3600000) alerts.push('לא התקבלה ריצה מתוזמנת ביותר מ־26 שעות');
  return alerts;
}
export const scrapingFeatureName = (key: string) => ({ yad2_extraction: 'חילוץ מודעות יד2', yad2_search: 'חיפוש במאגר יד2', yad2_sections: 'פרטי סביבה ומוסדות חינוך', yad2_status: 'בדיקת זמינות מודעה', developer_import: 'ייבוא פרויקטים של יזם', provider_usage: 'דוח ספק', legacy_yad2: 'סריקת יד2 מתוזמנת' }[key] ?? (key.startsWith('sections_') ? 'פרטי סביבה מהמטמון' : key));