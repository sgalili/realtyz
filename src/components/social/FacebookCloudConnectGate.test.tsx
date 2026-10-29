import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ owner: 'workspace-a', state: vi.fn(), invoke: vi.fn(), sync: vi.fn(), navigate: vi.fn() }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => mocks.owner }));
vi.mock('@/hooks/useMetaPageBinding', () => ({ useMetaPageBinding: () => ({ data: null }) }));
vi.mock('@/lib/cloudSession', () => ({ getCloudSessionState: mocks.state }));
vi.mock('@/lib/cloudGroupDiscovery', () => ({ fetchGroupsViaCloud: mocks.sync }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/i18n/personalLanguage', () => ({ usePersonalLanguage: () => ({ gender: 'male', command: (v: string) => v, text: (forms: { male: string }) => forms.male }), localizeControlNode: (v: unknown) => v }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
import { FacebookCloudConnectGate } from './FacebookCloudConnectGate';

describe('Facebook cloud connection', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.owner = 'workspace-a'; mocks.state.mockResolvedValue({ active: false }); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('does not request or open a cloud browser before the guidance confirmation', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<FacebookCloudConnectGate alwaysVisible />);
    fireEvent.click(await screen.findByRole('button', { name: 'חיבור באמצעות פייסבוק' }));
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'פתח חיבור לפייסבוק בלשונית חדשה' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('fb-session-vault', { body: { action: 'remote_login' } }));
  });

  it('manual checking never imports before the server confirms a session', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    mocks.invoke.mockImplementation((_name, { body }) => Promise.resolve({ data: body.action === 'remote_login' ? { url: 'https://gologin.example/session' } : { active: false } }));
    render(<FacebookCloudConnectGate alwaysVisible />);
    fireEvent.click(await screen.findByRole('button', { name: 'חיבור באמצעות פייסבוק' }));
    fireEvent.click(screen.getByRole('button', { name: 'פתח חיבור לפייסבוק בלשונית חדשה' }));
    fireEvent.click(await screen.findByRole('button', { name: 'בדיקת החיבור' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('fb-session-vault', { body: { action: 'remote_check' } }));
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('connect later stays ready when the earlier connection check finishes', async () => {
    let resolveState: (state: { active: boolean }) => void = () => {};
    mocks.state.mockImplementationOnce(() => new Promise(resolve => { resolveState = resolve; }));
    const onStatusChange = vi.fn();
    render(<FacebookCloudConnectGate alwaysVisible onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'אתחבר יותר מאוחר' }));
    await act(async () => { resolveState({ active: false }); });
    expect(onStatusChange.mock.calls).toEqual([[true]]);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('imports confirmed memberships using the cloud job, not a keyword search', async () => {
    mocks.state.mockResolvedValue({ active: true });
    mocks.sync.mockResolvedValue([{ group_id: '123' }]);
    const onSynced = vi.fn();
    render(<FacebookCloudConnectGate alwaysVisible onSynced={onSynced} />);
    fireEvent.click(await screen.findByRole('button', { name: 'ייבוא הקבוצות שלי' }));
    await waitFor(() => expect(onSynced).toHaveBeenCalledOnce());
    expect(mocks.sync).toHaveBeenCalledWith('', { syncMemberships: true, signal: expect.any(AbortSignal) });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('does not import memberships when remote login fails', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ opener: null, close: vi.fn(), location: { href: '' } } as unknown as Window);
    mocks.invoke.mockResolvedValue({ data: { error: 'worker_unavailable', message: 'החיבור אינו זמין' } });
    render(<FacebookCloudConnectGate alwaysVisible />);
    fireEvent.click(await screen.findByRole('button', { name: 'חיבור באמצעות פייסבוק' }));
    fireEvent.click(screen.getByRole('button', { name: 'פתח חיבור לפייסבוק בלשונית חדשה' }));
    await screen.findByRole('alert');
    expect(mocks.invoke).toHaveBeenCalledWith('fb-session-vault', { body: { action: 'remote_login' } });
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('offers a manual connection link when every new tab is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    mocks.invoke.mockResolvedValue({ data: { url: 'https://gologin.example/session' } });
    render(<FacebookCloudConnectGate alwaysVisible />);
    fireEvent.click(await screen.findByRole('button', { name: 'חיבור באמצעות פייסבוק' }));
    fireEvent.click(screen.getByRole('button', { name: 'פתח חיבור לפייסבוק בלשונית חדשה' }));
    const link = await screen.findByRole('link', { name: 'פתיחת חיבור לפייסבוק' });
    expect(link).toHaveAttribute('href', 'https://gologin.example/session');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('waits for server-confirmed login before importing', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ opener: null, close: vi.fn(), location: { href: '' } } as unknown as Window);
    mocks.invoke.mockResolvedValue({ data: { url: 'https://example.com/login' } });
    mocks.sync.mockResolvedValue([]);
    render(<FacebookCloudConnectGate alwaysVisible />);
    const connect = await screen.findByRole('button', { name: 'חיבור באמצעות פייסבוק' });
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(connect); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'פתח חיבור לפייסבוק בלשונית חדשה' })); });
    expect(mocks.sync).not.toHaveBeenCalled();
    mocks.state.mockResolvedValue({ active: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.sync).toHaveBeenCalledOnce();
  });

  it('aborts an in-flight import on workspace switch and does not signal completion', async () => {
    mocks.state.mockResolvedValue({ active: true });
    let resolveSync: (groups: unknown[]) => void = () => {};
    mocks.sync.mockImplementation(() => new Promise(resolve => { resolveSync = resolve; }));
    const onSynced = vi.fn();
    const { rerender } = render(<FacebookCloudConnectGate alwaysVisible onSynced={onSynced} />);
    fireEvent.click(await screen.findByRole('button', { name: 'ייבוא הקבוצות שלי' }));
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());
    const signal = mocks.sync.mock.calls[0][1].signal as AbortSignal;
    mocks.owner = 'workspace-b';
    rerender(<FacebookCloudConnectGate alwaysVisible onSynced={onSynced} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { resolveSync([]); });
    expect(onSynced).not.toHaveBeenCalled();
  });
});