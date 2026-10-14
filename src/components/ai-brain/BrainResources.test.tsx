import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrainTabs, BrainDocumentCard, BrainUploadZone } from './BrainResources';

describe('shared brain resources', () => {
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