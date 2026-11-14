import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ChatHeaderActions } from './ChatHeaderActions';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from '@/components/ui/alert-dialog';
afterEach(cleanup);
it('card menu isolates row clicks and closes while retaining the confirmation', async () => {
  const select = vi.fn();
  function Example() {
    const [confirm, setConfirm] = useState(false);
    return <div onClick={select}><ChatHeaderActions label="פעולות כרטיס"><Button onClick={() => setConfirm(true)}>מחיקה</Button><AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent aria-describedby={undefined}><AlertDialogTitle>אישור מחיקה</AlertDialogTitle></AlertDialogContent></AlertDialog></ChatHeaderActions></div>;
  }
  render(<Example />);
  const trigger = screen.getByRole('button', { name: 'פעולות כרטיס' });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'מחיקה' }));
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  expect(select).not.toHaveBeenCalled();
});