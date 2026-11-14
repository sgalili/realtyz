import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useInboxFavorites } from './useInboxFavorites';

const db = vi.hoisted(() => ({ rows: [] as Array<Record<string,string>>, filters: [] as Array<[string,string]>, fail: false }));
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: { id: 'account' } }) }));
vi.mock('./useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'workspace' }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  let op = 'read'; let row: Record<string,string> = {}; const filters: Array<[string,string]> = [];
  const api = { select: () => api, order: () => api, eq: (k:string,v:string) => { filters.push([k,v]); return api; }, insert: (r:Record<string,string>) => { op='insert';row=r;return api; }, delete: () => { op='delete';return api; }, then: (resolve:(r:unknown)=>void) => {
    db.filters=filters;
    if(db.fail && op!=='read') { resolve({error:{message:'denied'}});return; }
    if(op==='insert')db.rows.push(row);
    if(op==='delete')db.rows=db.rows.filter(r=>!filters.every(([k,v])=>r[k]===v));
    resolve({data:op==='read'?db.rows.filter(r=>filters.every(([k,v])=>r[k]===v)):null,error:null});
  } };return api;
} } }));
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
const id='11111111-1111-4111-8111-111111111111';
afterEach(()=>{cleanup();client.clear();db.rows=[];db.fail=false;vi.clearAllMocks();});
it('persists exactly the current account/workspace chat and reads it back',async()=>{
 const {result}=renderHook(()=>useInboxFavorites(),{wrapper});await waitFor(()=>expect(result.current.isSuccess).toBe(true));
 await act(async()=>{await result.current.toggle('lead',id);});await waitFor(()=>expect(result.current.has('lead',id)).toBe(true));
 expect(db.rows).toEqual([{user_id:'account',workspace_owner_id:'workspace',target_kind:'lead',target_id:id}]);
 expect(db.filters).toEqual([['user_id','account'],['workspace_owner_id','workspace']]);
});
it('removes only the selected message favorite and preserves the chat favorite',async()=>{
 db.rows=[{user_id:'account',workspace_owner_id:'workspace',target_kind:'message',target_id:id},{user_id:'account',workspace_owner_id:'workspace',target_kind:'lead',target_id:id}];
 const {result}=renderHook(()=>useInboxFavorites(),{wrapper});await waitFor(()=>expect(result.current.has('message',id)).toBe(true));
 await act(async()=>{await result.current.toggle('message',id);});await waitFor(()=>expect(result.current.has('message',id)).toBe(false));expect(result.current.has('lead',id)).toBe(true);
});
it('does not display a saved favorite after a denied write',async()=>{
 const {result}=renderHook(()=>useInboxFavorites(),{wrapper});await waitFor(()=>expect(result.current.isSuccess).toBe(true));db.fail=true;
 await act(async()=>{await result.current.toggle('lead',id);});expect(result.current.has('lead',id)).toBe(false);expect(db.rows).toHaveLength(0);
});
it('saves a new community contact without requiring an existing conversation',async()=>{
 const {result}=renderHook(()=>useInboxFavorites(),{wrapper});await waitFor(()=>expect(result.current.isSuccess).toBe(true));
 await act(async()=>{await result.current.toggle('peer',id);});await waitFor(()=>expect(result.current.has('peer',id)).toBe(true));
 expect(db.rows).toEqual([{user_id:'account',workspace_owner_id:'workspace',target_kind:'peer',target_id:id}]);
});
it('saves the whole group in the current account/workspace rather than a message',async()=>{
 const {result}=renderHook(()=>useInboxFavorites(),{wrapper});await waitFor(()=>expect(result.current.isSuccess).toBe(true));
 await act(async()=>{await result.current.toggle('group',id);});await waitFor(()=>expect(result.current.has('group',id)).toBe(true));
 expect(db.rows).toEqual([{user_id:'account',workspace_owner_id:'workspace',target_kind:'group',target_id:id}]);
 expect(result.current.has('peer_message',id)).toBe(false);
});