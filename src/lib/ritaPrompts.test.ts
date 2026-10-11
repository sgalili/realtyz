import { describe, expect, it } from 'vitest';
import { RITA_PROMPTS, ritaWorkflow } from './ritaPrompts';
import { ritaWorkflowDirective } from '../../supabase/functions/_shared/ritaWorkflow';

describe('role-aware Rita prompts', () => {
  it('requires authorized affiliate membership for partner mode', () => {
    expect(ritaWorkflow(['developer'], true)).toBe('developer');
    expect(ritaWorkflow(['developer', 'affiliate'], true)).toBe('partner');
    expect(ritaWorkflow(['developer', 'affiliate'], false)).toBe('developer');
  });
  it('covers all identities with five focused prompts', () => {
    expect(ritaWorkflow(['managing_broker'])).toBe('broker');
    expect(ritaWorkflow(['property_owner'])).toBe('private');
    expect(ritaWorkflow(['affiliate'])).toBe('partner');
    for (const prompts of Object.values(RITA_PROMPTS)) {
      expect(prompts).toHaveLength(5);
      expect(new Set(prompts.map(p => p.label)).size).toBe(5);
      expect(prompts.every(p => p.prompt.length > 0)).toBe(true);
    }
  });
  it('preserves role limits and rejects a forged partner preference', () => {
    expect(ritaWorkflowDirective(['developer'], 'partner', false)).toContain('מצב יזם');
    expect(ritaWorkflowDirective(['agent', 'affiliate'], 'partner', false)).toContain('מצב שותף');
    expect(ritaWorkflowDirective(['affiliate'], 'partner', false)).toContain('אין להציג סכומי עמלות סגירה');
    expect(ritaWorkflowDirective(['agent'], 'core', true)).not.toContain('אין להציג סכומי עמלות סגירה');
  });
});