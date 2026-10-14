import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrainTabs, BrainDocumentCard, BrainUploadZone, BrainTextEntry } from './BrainResources';

vi.mock('@/components/voice/VoiceInputButton', () => ({ VoiceInputButton: () => null }));

describe('shared brain resources', () => {
  it('adds title-free text and prevents empty or busy submissions', () => {
    const add = vi.fn(), change = vi.fn();
    const { rerender } = render(<BrainTextEntry value="" onChange={change} busy={false} onAdd={add} />);
    expect(screen.queryByPlaceholderText('כותרת')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'הוסף' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'הנחיות חדשות' } });
    expect(change).toHaveBeenCalledWith('הנחיות חדשות');
    rerender(<BrainTextEntry value="הנחיות חדשות" onChange={change} busy={false} onAdd={add} />);
    fireEvent.click(screen.getByRole('button', { name: 'הוסף' }));
    expect(add).toHaveBeenCalledOnce();
    rerender(<BrainTextEntry value="הנחיות חדשות" onChange={change} busy onAdd={add} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
  });
  it('renders identical four tabs and selects files', () => {
    const change = vi.fn();
    render(<BrainTabs value="ai" onChange={change} />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'קבצים' }));
    expect(change).toHaveBeenCalledWith('files');
  });
  it('opens each document independently without opening it on delete', () => {
    const open = vi.fn(), remove = vi.fn();
    render(<BrainDocumentCard document={{ id: '1', title: 'Training', source_type: 'text', raw_text: 'Facts', created_at: '2026-01-01', chunk_count: 1 }} onOpen={open} onDelete={remove} deleting={false} />);
    fireEvent.click(screen.getByText('Training'));
    expect(open).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'מחק Training' }));
    expect(remove).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledTimes(1);
  });
  it('blocks dropped files while ingestion is busy', () => {
    const upload = vi.fn();
    const { rerender } = render(<BrainUploadZone busy onFiles={upload} />);
    const files = [new File(['hello'], 'hello.txt')];
    fireEvent.drop(screen.getByRole('button', { name: 'העלאת קבצי אימון' }), { dataTransfer: { files } });
    expect(upload).not.toHaveBeenCalled();
    rerender(<BrainUploadZone busy={false} onFiles={upload} />);
    fireEvent.drop(screen.getByRole('button', { name: 'העלאת קבצי אימון' }), { dataTransfer: { files } });
    expect(upload).toHaveBeenCalledWith(files);
  });
});