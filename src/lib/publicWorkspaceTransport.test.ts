import { describe, expect, it, vi } from 'vitest';
import { createPublicWorkspaceData, demoOwner } from './publicWorkspaceData';
import { simulationQuery, simulationRpc, simulationFunction, installPublicWorkspaceTransport } from './publicWorkspaceTransport';
import { publicWorkspaceRoute } from '@/components/demo/PublicWorkspaceProvider';
import { isDemoWindowUrl } from './brokerDemoPolicy';

describe('isolated registered-screen simulation', () => {
  it.each(['broker', 'developer', 'marketing', 'owner', 'buyer', 'affiliate'] as const)('uses an isolated synthetic %s workspace with no real contacts or credentials', role => {
    const store = createPublicWorkspaceData(role);
    expect(store.owner).toBe(demoOwner(role));
    expect(store.workspaces).toHaveLength(6);
    expect(store.roles).not.toContain('super_admin');
    expect(store.roles).not.toContain('admin');
    expect(store.leads.every(row => row.workspace_owner_id === store.owner && row.phone === null && row.email === null)).toBe(true);
    expect(store.profile.email).toBe('demo@example.invalid');
    expect(simulationRpc(store, 'get_verified_user_roles').data).toEqual([]);
  });
  it('scopes navigation to the same routes underneath the public role basename', () => {
    expect(publicWorkspaceRoute('/demo/developer/developer-dashboard')).toEqual({role:'developer',base:'/demo/developer',choose:false});
    expect(publicWorkspaceRoute('/demo')).toEqual({role:'broker',base:'/demo',choose:true});
    expect(publicWorkspaceRoute('/developer-dashboard')).toBeNull();
  });
  it('has exactly five simulated campaign records and consistent developer/project/unit identities', () => {
    const store=createPublicWorkspaceData('developer');
    expect(store.tables.campaigns).toHaveLength(5);
    expect(store.projects).toHaveLength(4);
    expect(store.projects.every(project=>store.developers.some(d=>d.id===project.developer_id)&&project.apartments.length===4)).toBe(true);
  });
  it('supplies five public-property snapshots and six to ten photos per property and campaign', () => {
    const store = createPublicWorkspaceData('broker');
    expect(store.listings).toHaveLength(5);
    expect(store.listings.every(row => row.photos.length >= 6 && row.photos.length <= 10)).toBe(true);
    expect(store.tables.campaign_logs?.every(row => row.media_urls.length >= 6 && row.media_urls.length <= 10)).toBe(true);
    expect(store.tables.platform_settings?.[0]?.enable_ai_autopilot).toBe(true);
  });
  it('uses distinct gender-matched contacts and preserves the persona profile gender', () => {
    const store = createPublicWorkspaceData('broker');
    expect(new Set(store.leads.map(l => l.avatar_url)).size).toBe(8);
    expect(store.leads.map(l => l.gender)).toEqual(['female','male','female','male','male','female','male','female']);
    expect(store.profile.gender).toBe('male');
    expect(createPublicWorkspaceData('marketing').profile.gender).toBe('female');
    expect(store.leads.some(l => l.avatar_url === store.profile.avatar_url)).toBe(false);
  });
  it('keeps sample deposits and completed campaign charges consistent with the displayed balance', () => {
    const store = createPublicWorkspaceData('broker', 'brokers_only');
    expect(store.ledger.filter(r => r.type === 'topup').map(r => r.amount_ils)).toEqual([100,200,50]);
    const campaign = store.ledger.find(r => r.campaign_breakdown);
    expect(campaign?.amount).toBe(-17);
    expect(campaign?.amount_ils).toBe(-4.25);
    expect(store.tables.credit_wallets?.[0]?.balance_ils).toBe(store.ledger.reduce((sum,r) => sum+r.amount_ils,0));
  });
  it('keeps sample tasks read-only and does not grant administrative or payment access', async () => {
    const store=createPublicWorkspaceData('broker');
    const id=store.tables.scheduled_items[0].id;
    const before = JSON.stringify(store.tables.scheduled_items);
    expect((await simulationQuery(store,'scheduled_items').update({title:'בדיקת נכס לדוגמה'}).eq('id',id)).status).toBe(403);
    expect((await simulationQuery(store,'scheduled_items').delete().eq('id',id)).status).toBe(403);
    expect((await simulationQuery(store,'scheduled_items').insert({title:'new sample'})).status).toBe(403);
    expect(JSON.stringify(store.tables.scheduled_items)).toBe(before);
    expect((await simulationQuery(store,'user_roles').insert({role:'super_admin'})).status).toBe(403);
    expect(simulationRpc(store,'publish_developer_project').status).toBe(403);
    expect(simulationRpc(store,'subscribe_to_plan').status).toBe(403);
    expect(simulationFunction(store,'admin-broker-invitation').status).toBe(403);
  });
  it('serves the configured broker-only mode without changing marketplace defaults', () => {
    expect(simulationRpc(createPublicWorkspaceData('broker','brokers_only'),'get_public_platform_settings').data).toEqual([{platform_mode:'brokers_only',monthly_free_credits:20}]);
    expect(simulationRpc(createPublicWorkspaceData('affiliate','full_marketplace'),'get_public_platform_settings').data).toEqual([{platform_mode:'full_marketplace',monthly_free_credits:20}]);
  });
  it('blocks approving a sample signature and keeps the original document unchanged', () => {
    const store=createPublicWorkspaceData('broker','brokers_only');const before=JSON.stringify(store.tables.closing_documents);
    expect(simulationRpc(store,'approve_signed_document',{_id:store.tables.closing_documents[1].id}).status).toBe(403);
    expect(JSON.stringify(store.tables.closing_documents)).toBe(before);
  });
  it('does not mistake prefixed partner or community writes for read-only queries', () => {
    const store=createPublicWorkspaceData('broker','brokers_only');
    expect(simulationRpc(store,'community_send_message',{content:'test'}).status).toBe(403);
    expect(simulationRpc(store,'partner_update_settings',{enabled:true}).status).toBe(403);
  });
  it('allows only isolated demo windows, never external publishing or public-board windows', () => {
    expect(isDemoWindowUrl('https://facebook.com','http://localhost')).toBe(false);
    expect(isDemoWindowUrl('/public-listings','http://localhost')).toBe(false);
    expect(isDemoWindowUrl('/demo/broker/properties','http://localhost')).toBe(true);
  });
  it('blocks raw RPC, storage, OAuth, AI provider and remote fetch traffic without changing a real session', async () => {
    const remote=vi.spyOn(window,'fetch').mockResolvedValue(new Response('{}'));
    window.localStorage.setItem('registered-account-preference','unchanged');
    const runtime=installPublicWorkspaceTransport('broker');
    try {
      expect((await window.fetch('https://example.com/rest/v1/leads')).status).toBe(403);
      expect((await window.fetch('https://example.com/storage/v1/object/photos/test',{method:'POST'})).status).toBe(403);
      expect((await window.fetch('https://example.com/functions/v1/admin-broker-invitation',{method:'POST'})).status).toBe(403);
      expect(remote).not.toHaveBeenCalled();
      const {supabase}=await import('@/integrations/supabase/client');
      expect((await supabase.auth.getSession()).data.session).toBeNull();
      expect((await supabase.auth.signInWithOAuth({provider:'google'})).error).toBeTruthy();
      expect((await supabase.functions.invoke('ai-agent',{body:{message:'מה התקציב?'}})).data.actions).toEqual([]);
      expect((await supabase.storage.from('photos').upload('test.png',new Blob(['test']))).error).toBeTruthy();
      expect(window.localStorage.getItem('registered-account-preference')).toBeNull();
      window.localStorage.setItem('registered-account-preference','demo-only');
      expect(remote).not.toHaveBeenCalled();
    } finally {runtime.restore();remote.mockRestore();}
    expect(window.localStorage.getItem('registered-account-preference')).toBe('unchanged');
    window.localStorage.removeItem('registered-account-preference');
  });
});