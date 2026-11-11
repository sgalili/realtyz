export type Yad2Status = 'live' | 'gone' | 'unknown';

/** Only positive listing evidence proves liveness; challenges never prove removal. */
export function classifyYad2Status(finalUrl: string, status: number, title: string, html: string): Yad2Status {
  if (status === 404 || status === 410) return 'gone';
  if (status < 200 || status >= 400 || !html.trim()) return 'unknown';
  if (/captcha|radware|bot manager|access denied|verify you are human/i.test(`${title} ${html.slice(0, 12000)}`)) return 'unknown';
  if (/המודעה (?:שחיפשת )?(?:אינה קיימת|הוסרה)|ה(?:דף|עמוד) (?:שחיפשת )?לא נמצא|"notfound"\s*:\s*true|page not found/i.test(html)) return 'gone';
  if (!/\/item\//i.test(finalUrl) || !title.trim()) return 'unknown';
  return /"(?:itemId|adId|ad_id|price|askingPrice)"\s*:|data-testid=["'][^"']*(?:item|asset|property)|<h1[\s>]/i.test(html) ? 'live' : 'unknown';
}