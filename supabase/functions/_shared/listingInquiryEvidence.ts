export function capturedInquiryName(history: Array<{ role: string; content: string }>): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== 'user') continue;
    const explicit = turn.content.match(/(?:קוראים לי|השם שלי(?: הוא)?|שמי|אני נקרא(?:ת)?)\s+([א-תA-Za-z]+(?:\s+[א-תA-Za-z]+){0,2})/);
    if (explicit?.[1]) return explicit[1].trim();
    const previous = history[i - 1];
    const text = turn.content.trim();
    if (previous?.role === 'assistant' && /(?:מה|איך).{0,25}(?:שם|שמ[ךכם]|קוראים לך)|שם מלא/.test(previous.content) && /^[א-תA-Za-z]+(?:\s+[א-תA-Za-z]+){0,2}$/.test(text) && !/^(כן|לא|תודה|שלום|בסדר|אולי)$/.test(text)) return text;
  }
  return null;
}

export function validScreeningEvidence(questions: string[], answers: unknown, visitorText: string): answers is Array<{ answer: string; satisfactory: boolean }> {
  return Array.isArray(answers) && answers.length === questions.length && questions.length >= 3 && answers.every((item) => item && typeof item.answer === 'string' && typeof item.satisfactory === 'boolean' && (item.answer.trim() ? visitorText.includes(item.answer.trim()) : item.satisfactory === false));
}