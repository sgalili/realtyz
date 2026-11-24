import { describe, it, expect } from 'vitest';
import { canUseWaTemplate, RITA_TEMPLATE_OWNER } from '../../supabase/functions/_shared/waTemplateAccess';
import { templateParamDefault } from '../lib/waTemplatePersonalization';

describe('Rita invitation workspace restriction', () => {
  it('allows the invitation only in Rita workspace', () => {
    expect(canUseWaTemplate('invitation_to_realestate_brokers', 'dc819834-1aa9-4aca-bb27-ec2c8cebde69')).toBe(true);
    expect(RITA_TEMPLATE_OWNER).toBe('dc819834-1aa9-4aca-bb27-ec2c8cebde69');
  });
  it('denies it in other or unresolved workspaces, regardless of viewer role', () => {
    expect(canUseWaTemplate('invitation_to_realestate_brokers', '2916ced8-de4d-4d22-a009-5f0c511fb47c')).toBe(false);
    expect(canUseWaTemplate('invitation_to_realestate_brokers', null)).toBe(false);
  });
  it('preserves other templates', () => {
    expect(canUseWaTemplate('reengagement', 'other-owner')).toBe(true);
  });
});
describe('hidden automatic template personalization', () => {
  it('resolves recipient first name without requiring variable input', () => {
    expect(templateParamDefault('first_name')).toBe('[שם_פרטי]');
  });
  it('keeps unknown required parameters editable', () => {
    expect(templateParamDefault('1')).toBe('');
  });
});