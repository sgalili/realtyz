export function authEntrySignup(input: { brokersOnly: boolean; invitedBroker: boolean; search: string; signupState?: boolean }) {
  if (input.invitedBroker) return false;
  const mode = new URLSearchParams(input.search).get('mode');
  if (mode === 'signup') return true;
  if (mode === 'login') return false;
  if (typeof input.signupState === 'boolean') return input.signupState;
  return !input.brokersOnly;
}