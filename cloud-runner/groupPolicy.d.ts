export const ACTIVE_CAP: number;
export const RESERVE_CAP: number;
export function membershipOutcome(text: string): 'requested' | 'joined' | null;
export function approvedAnswers(
  requirements: string[],
  answers: Record<string, unknown> | null | undefined,
  rulesAccepted: boolean,
): Record<string, string> | null;
