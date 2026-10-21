import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rows: [] as unknown[], notify: null as null | (() => void) }));
vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace-a' }));
vi.mock('@/hooks/useGroupQueueLive', () => ({ useGroupQueueLive: (_owner: string, callback: () => void) => { mocks.notify = callback; } }));
vi.mock('@/components/social/CloudGroupConnection', () => ({ CloudGroupConnection: () => null }));
vi.mock('@/components/social/GroupDiscoveryDialog', () => ({ GroupDiscoveryDialog: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: () => Promise.resolve({}), from: () => {
 const query: Record<string, unknown> = {}; query.select = () => query; query.eq = () => query; query.order = () => Promise.resolve({data:mocks.rows,error:null}); return query;
} } }));
import { FacebookTargetsCard } from './FacebookTargetsCard';
describe('cloud-confirmed membership', () => {
 beforeEach(() => { mocks.rows = [{id:'g',group_id:'fb:123',group_name:'בדיקה',join_status:'not_joined',pool_status:'waiting',is_selected:true,cloud_join_state:'processing'}]; });
 it('does not publish until cloud confirms joined and active', async () => {
  const view = render(<FacebookTargetsCard />);
  await waitFor(() => expect(screen.getByRole('tab', {name:'1 בהמתנה / 200'})).toBeInTheDocument());
  fireEvent.click(screen.getByRole('tab',{name:'1 בהמתנה / 200'}));
  expect(screen.getByLabelText('הצטרפות בתהליך')).toBeInTheDocument();
  mocks.rows = [{id:'g',group_id:'fb:123',group_name:'בדיקה',join_status:'joined',pool_status:'active',is_selected:true,cloud_join_state:'joined'}];
  await act(async () => mocks.notify?.());
  expect(screen.getByRole('tab',{name:'1 פעילות / 100'})).toBeInTheDocument();
  expect(screen.getByRole('tab',{name:'0 בהמתנה / 200'})).toBeInTheDocument();
  view.unmount();
 });
 it('approval pending remains outside active publishing', async () => {
  mocks.rows = [{id:'g',group_id:'fb:123',group_name:'בדיקה',join_status:'pending',pool_status:'waiting',is_selected:true,cloud_join_state:'requested'}];
  const view = render(<FacebookTargetsCard />);
  await waitFor(() => expect(screen.getByRole('tab',{name:'1 בהמתנה / 200'})).toBeInTheDocument());
  fireEvent.click(screen.getByRole('tab',{name:'1 בהמתנה / 200'}));
  expect(screen.getByLabelText('בקשה ממתינה לאישור')).toBeInTheDocument();
  expect(screen.getByRole('tab',{name:'0 פעילות / 100'})).toBeInTheDocument(); view.unmount();
 });
});
