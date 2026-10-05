import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { useExclusiveExpansion } from '@/hooks/useExclusiveExpansion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';

function Peer({ name }: { name: string }) {
  const [open, setOpen] = useExclusiveExpansion('test-peers', name);
  return <button onClick={() => setOpen(v => !v)} aria-expanded={open}>{name}</button>;
}
function Controlled() {
  const [open, setOpen] = useState(false);
  return <Collapsible open={open} onOpenChange={setOpen}><CollapsibleTrigger>controlled</CollapsibleTrigger><CollapsibleContent>controlled body</CollapsibleContent></Collapsible>;
}
describe('exclusive expansion', () => {
  it('opens only one peer and closes on repeated click', () => {
    render(<><Peer name="first" /><Peer name="second" /></>);
    fireEvent.click(screen.getByText('first'));
    expect(screen.getByText('first').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByText('second'));
    expect(screen.getByText('first').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByText('second'));
    expect(screen.getByText('second').getAttribute('aria-expanded')).toBe('false');
  });
  it('keeps nested expansion open without closing its parent', async () => {
    render(<Collapsible><CollapsibleTrigger>parent</CollapsibleTrigger><CollapsibleContent><Collapsible><CollapsibleTrigger>child</CollapsibleTrigger><CollapsibleContent>nested body</CollapsibleContent></Collapsible></CollapsibleContent></Collapsible>);
    fireEvent.click(screen.getByText('parent'));
    fireEvent.click(screen.getByText('child'));
    await waitFor(() => expect(screen.getByText('parent').getAttribute('aria-expanded')).toBe('true'));
    expect(screen.getByText('child').getAttribute('aria-expanded')).toBe('true');
  });
  it('honors controlled changes and closes controlled peers', async () => {
    render(<><Controlled /><Collapsible><CollapsibleTrigger>other</CollapsibleTrigger><CollapsibleContent>other body</CollapsibleContent></Collapsible></>);
    fireEvent.click(screen.getByText('controlled'));
    expect(screen.getByText('controlled').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByText('other'));
    await waitFor(() => expect(screen.getByText('controlled').getAttribute('aria-expanded')).toBe('false'));
  });
});