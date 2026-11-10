import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { InventoryComingSoonHost, InventoryToolSoftLock } from './InventoryCollection';
import { FacebookCloudConnectGate } from './social/FacebookCloudConnectGate';
import { Button } from './ui/button';

afterEach(cleanup);
it('stops Facebook pointer actions before external handlers run', () => {
  const external = vi.fn();
  render(<><InventoryComingSoonHost /><InventoryToolSoftLock tool="facebook"><Button onClick={external}>Connect</Button></InventoryToolSoftLock></>);
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect(external).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'הבנתי' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('stops keyboard edits to GoLogin settings', () => {
  const edit = vi.fn();
  render(<><InventoryComingSoonHost /><InventoryToolSoftLock tool="gologin"><input aria-label="token" onKeyDown={edit} /></InventoryToolSoftLock></>);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'a' });
  expect(edit).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
it('allows draft actions without preparation prompts', () => {
  const edit = vi.fn();
  render(<><InventoryComingSoonHost /><InventoryToolSoftLock tool="drafts"><Button onClick={edit}>Edit draft</Button></InventoryToolSoftLock></>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
  expect(edit).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('cloud connection remains clickable without mounting remote session logic', () => {
  render(<><InventoryComingSoonHost /><FacebookCloudConnectGate alwaysVisible /></>);
  fireEvent.click(screen.getByRole('button', { name: /חיבור באמצעות פייסבוק/ }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});