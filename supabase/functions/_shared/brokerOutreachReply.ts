export function outreachReply(text: string): 'positive' | 'opt_out' | 'unknown' {
  const value=text.trim().replace(/[.!?]+$/g,'').trim();
  if(/^(הסר|הסרה|לא מעוניין|לא מעוניינת|אל תשלחו|stop|unsubscribe)$/i.test(value))return 'opt_out';
  if(/^(כן|מעוניין|מעוניינת|אשמח לשמוע|שלחי פרטים|שלחו פרטים|נשמע מעניין)$/i.test(value))return 'positive';
  return 'unknown';
}