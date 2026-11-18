export function normalizeDeveloperName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('he-IL')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/["'׳״“”‘’`]/g, '')
    .replace(/בעמ\s*$/u, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function matchingDevelopers<T extends { company_name: string }>(rows: T[], name: string): T[] {
  const key = normalizeDeveloperName(name);
  return key ? rows.filter(row => normalizeDeveloperName(row.company_name) === key) : [];
}