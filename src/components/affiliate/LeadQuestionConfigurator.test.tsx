import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeadQuestionConfigurator } from './LeadQuestionConfigurator';
import type { LeadFormField } from '@/lib/leadTiers';

describe('lead question changes', () => {
  it('supports editing, adding and removing filtering questions without changing the other channel', () => {
    function Harness() {
      const [questions, setQuestions] = useState<string[] | undefined>();
      return <><LeadQuestionConfigurator tier="whatsapp" dealType="sale" questions={questions} onQuestionsChange={setQuestions} /><output>{JSON.stringify(questions)}</output></>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /שאלות סינון בוואטסאפ/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'שאלה 1' }), { target: { value: 'יש לכם נכס למכור?' } });
    expect(screen.getByRole('status').textContent).toContain('יש לכם נכס למכור?');
    fireEvent.click(screen.getByRole('button', { name: 'הוספת שאלה' }));
    expect(JSON.parse(screen.getByRole('status').textContent ?? '[]')).toHaveLength(4);
    fireEvent.click(screen.getAllByRole('button', { name: 'מחיקת שאלה' })[0]);
    expect(JSON.parse(screen.getByRole('status').textContent ?? '[]')).toHaveLength(3);
  });
  it('supports adding and removing a custom form field', () => {
    function Harness() {
      const [fields, setFields] = useState<LeadFormField[]>([]);
      return <><LeadQuestionConfigurator tier="form" fields={fields} onFieldsChange={setFields} /><output>{JSON.stringify(fields)}</output></>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /שדות טופס הפנייה/ }));
    fireEvent.click(screen.getByRole('button', { name: 'הוספת שדה' }));
    fireEvent.change(screen.getByPlaceholderText('נוסח השדה, למשל: מתי תרצו להיכנס?'), { target: { value: 'תקציב' } });
    expect(JSON.parse(screen.getByRole('status').textContent ?? '[]')[0]).toMatchObject({ label: 'תקציב', type: 'text', required: true });
    fireEvent.click(screen.getByRole('button', { name: 'מחיקת שדה' }));
    expect(screen.getByRole('status').textContent).toBe('[]');
  });
});