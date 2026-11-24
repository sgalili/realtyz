import { supabase } from '@/integrations/supabase/client';
import { createPublicWorkspaceData, type DemoRow, type PublicWorkspaceData } from './publicWorkspaceData';
import type { DemoType } from '@/pages/demo/demoData';
import type { PlatformMode } from '@/hooks/usePlatformMode';
import { notifyDemoReadOnly, DEMO_READ_ONLY } from './demoReadOnly';
import { isDemoWindowUrl } from './brokerDemoPolicy';

const denied = (notify = false) => { if (notify) notifyDemoReadOnly(); return { data: null, error: { message: DEMO_READ_ONLY, code: 'simulation_only' }, status: 403 }; };
const result = (data: unknown, count?: number) => ({ data, error: null, count: count ?? null, status: 200 });
export function simulationQuery(store: PublicWorkspaceData, table: string) {
  let rows = [...(store.tables[table] ?? [])]; let single = false; let head = false;
  let mutation: { kind: string; value?: DemoRow | DemoRow[] } | null = null;
  const target: Record<string, any> = {};
  const chain = new Proxy(target, { get(_t, key) {
    if (key === 'then') return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      if (mutation) {
        return Promise.resolve(denied(true)).then(resolve, reject);
      }
      return Promise.resolve(result(head ? null : single ? rows[0] ?? null : rows, rows.length)).then(resolve, reject);
    };
    return (...args: any[]) => {
      if (key === 'select') head = !!args[1]?.head;
      if (key === 'single' || key === 'maybeSingle') single = true;
      if (key === 'eq') rows = rows.filter(r => r[args[0]] === args[1]);
      if (key === 'neq') rows = rows.filter(r => r[args[0]] !== args[1]);
      if (key === 'in') rows = rows.filter(r => args[1].includes(r[args[0]]));
      if (key === 'is') rows = rows.filter(r => args[1] === null ? r[args[0]] == null : r[args[0]] === args[1]);
      if (key === 'not' && args[1] === 'is') rows = rows.filter(r => args[2] === null ? r[args[0]] != null : r[args[0]] !== args[2]);
      if (key === 'not' && args[1] === 'in') { const values = String(args[2]).replace(/^\(|\)$/g, '').split(','); rows = rows.filter(r => !values.includes(String(r[args[0]]))); }
      if (['gt','gte','lt','lte'].includes(String(key))) rows = rows.filter(r => { const value = r[args[0]]; if (value == null) return false; return key === 'gt' ? value > args[1] : key === 'gte' ? value >= args[1] : key === 'lt' ? value < args[1] : value <= args[1]; });
      if (key === 'ilike') rows = rows.filter(r => String(r[args[0]] ?? '').toLowerCase().includes(String(args[1]).split('%').join('').toLowerCase()));
      if (key === 'range') rows = rows.slice(args[0], args[1] + 1);
      if (key === 'limit') rows = rows.slice(0, args[0]);
      if (key === 'order') rows.sort((a, b) => String(a[args[0]] ?? '').localeCompare(String(b[args[0]] ?? '')) * (args[1]?.ascending === false ? -1 : 1));
      if (['insert', 'upsert', 'update', 'delete'].includes(String(key))) mutation = { kind: String(key), value: args[0] };
      return chain;
    };
  }});
  return chain;
}

export function simulationRpc(store: PublicWorkspaceData, name: string, args: DemoRow = {}) {
  const rpc: Record<string, unknown> = {
    get_public_platform_settings: [{ platform_mode: store.platformMode, monthly_free_credits: 20 }],
    get_my_wallet: { balance_ils: 310, locked_at: null, frozen: false }, get_my_wallet_ledger: store.ledger,
    get_my_subscription_status: { status: 'active', plan_name: 'free', is_active: true }, get_my_workspaces: store.workspaces,
    my_demo_view_type: null, get_verified_user_roles: [], get_workspace_owner_roles: [],
    get_my_primary_user_type: store.role === 'marketing' ? 'marketing_company' : store.role,
    get_my_profile: store.profile, get_account_integrations: { facebook: { page_id: 'demo-page', page_name: 'עמוד הדגמה', page_avatar_url: null, has_token: true }, wa_phone: null, green_phone: null, green_connected: false, yad2_connected: false },
    get_developer_subscription_status: { active: store.role === 'developer', expires_at: null, plan_code: 'free', workspace_owner_id: store.owner },
    get_broker_license_state: { license_number: store.role === 'broker' ? '123456' : null, status: store.role === 'broker' ? 'verified' : 'none', active: store.role === 'broker' },
    get_transparency_summary: { advertiser: { active_listings: 6, promoted_listings: 4, leads_30d: 8 }, partner: { approved: 5, disputed: 0, rejected: 0 }, wallet: { balance: 310, frozen: false }, pending_disputes_value: 0, banned: false, trust_score: 85 },
    get_my_ads_stats_for: store.listings.map(l => ({ ...l, listing_id: l.id, relation: 'owned', views: 3450, clicks: 284, contacts: 18 })),
    get_my_ad_details: store.listings.find(l => l.id === args._listing_id) ?? null,
    marketing_my_clients: { company: 'חברת שיווק · הדגמה', clients: store.developers }, marketing_client_projects: { projects: store.projects.filter(p => !args._developer || p.developer_id === args._developer) }, demo_developer_projects: store.projects,
    community_directory: store.leads.map(l => ({ id: l.id, full_name: l.full_name, avatar_url: l.avatar_url, category: 'broker', office_name: null, office_logo_url: null })),
    community_joined_groups: store.groups, community_group_roster: store.leads.map(l => ({ user_id: l.id, full_name: l.full_name, avatar_url: l.avatar_url })),
    is_community_chat_member: true, community_chat_contacts: store.leads.map(l => ({ id: l.id, full_name: l.full_name, avatar_url: l.avatar_url, category: 'broker' })), community_chat_threads: store.tables.community_chat_messages,
    community_profile_cards: store.leads.map(l => ({ id: l.id, full_name: l.full_name, avatar_url: l.avatar_url, category: 'broker' })),
    get_my_ads_stats: store.listings.map(l => ({ listing_id: l.id, relation: 'owned', listings_count: 6, views: 3450, clicks: 284, contacts: 18 })), get_my_favorites: store.listings.slice(0, 2), get_my_listing_favorites: store.listings.slice(0, 2),
    get_market_pool_info: { count: 6, total: 6, cities: ['הרצליה', 'רמת גן'] }, get_workspace_inventory_counts: store.workspaces.map(w => ({ workspace_owner_id: w.workspace_owner_id, inventory_count: 6 })),
    partner_terms_status: true, has_partner_consent: true, get_partner_consent: true,
    partner_can_view_closing: store.role === 'broker', can_view_closing_prices: store.role === 'broker',
    get_broker_entitlement: { eligible: store.role === 'broker', verified: store.role === 'broker', license_verified: store.role === 'broker', is_eligible: store.role === 'broker', can_view_closing: store.role === 'broker', status: 'verified' },
  };
  if (Object.prototype.hasOwnProperty.call(rpc, name)) return result(rpc[name]);
  if (/(^|_)(send|save|update|insert|delete|create|publish|approve|charge|cancel|set|add|accept|join|remove)(_|$)/.test(name)) return denied(true);
  if (/^(get_|my_|list_|search_|community_|marketing_|partner_)/.test(name)) return result(null);
  return denied(/^(approve|save|update|insert|delete|create|send|publish|subscribe|charge|cancel|advance|set|generate)_/.test(name));
}

export function simulationFunction(store: PublicWorkspaceData, name: string, options?: DemoRow) {
  const endpoint = name.split('?')[0];
  if (endpoint === 'public-listings-board') return result({ properties: store.listings, listings: store.listings, total: store.listings.length, has_more: false, price_range: { min: 6500, max: 3075000 } });
  if (endpoint === 'ai-agent') { const text = String(options?.body?.message ?? options?.body?.prompt ?? ''); return result({ reply: /תקציב|מחיר/.test(text) ? 'בדוגמה יש דירות בטווח 2.4 עד 3 מיליון שקלים. באיזו עיר מחפשים וכמה חדרים נדרשים?' : 'אני ריטה. אפשר להדגים התאמת נכסים, הכנת פוסט וסינון פנייה. באיזו עיר מחפשים ומה התקציב?', message: 'אני ריטה. אשמח לעזור עם הנכסים והפניות בהדגמה.', actions: [] }); }
  if (endpoint === 'executive-summary') return result({ summary: 'ריטה סיננה פניות חדשות, תואמו ביקורים ונוספו שיתופי פעולה בהדגמה.', new_leads: 8, active_listings: 6 });
  if (endpoint === 'neighborhood-perks') return result({ ok: true, area_perks: null });
  if (endpoint === 'get-action-pricing') return result([]);
  return denied(/^(send|publish|generate|save|update|delete|create|upload|admin)-/.test(endpoint) || /^(send|publish|save|update|delete|create|upload|approve)$/.test(String(options?.body?.action ?? '')));
}

/** Installed before workspace providers mount. Every transport is local/fail-closed. */
export function installPublicWorkspaceTransport(role: DemoType, platformMode: PlatformMode = 'full_marketplace') {
  const store = createPublicWorkspaceData(role, platformMode);
  const client = supabase as any;
  const saved = { from: client.from, rpc: client.rpc, invoke: client.functions.invoke, channel: client.channel, removeChannel: client.removeChannel, removeAllChannels: client.removeAllChannels, storageFrom: client.storage.from, fetch: window.fetch, open: window.open, share: navigator.share, getItem: Storage.prototype.getItem, setItem: Storage.prototype.setItem, removeItem: Storage.prototype.removeItem, clear: Storage.prototype.clear };
  // Preferences, caches and existing auth storage stay outside the synthetic workspace.
  const local = new Map<string, string>();
  Storage.prototype.getItem = function(key) { return this === window.localStorage ? local.get(String(key)) ?? null : saved.getItem.call(this, key); };
  Storage.prototype.setItem = function(key, value) { if (this === window.localStorage) local.set(String(key), String(value)); else saved.setItem.call(this, key, value); };
  Storage.prototype.removeItem = function(key) { if (this === window.localStorage) local.delete(String(key)); else saved.removeItem.call(this, key); };
  Storage.prototype.clear = function() { if (this === window.localStorage) local.clear(); else saved.clear.call(this); };
  client.from = (name: string) => simulationQuery(store, name);
  client.rpc = (name: string, args?: DemoRow) => Promise.resolve(simulationRpc(store, name, args));
  client.functions.invoke = (name: string, opts?: DemoRow) => Promise.resolve(simulationFunction(store, name, opts));
  client.storage.from = () => new Proxy({}, { get: (_target, method) => (..._args: unknown[]) => method === 'getPublicUrl' ? { data: { publicUrl: '' } } : Promise.resolve(denied(true)) });
  const idleChannel: any = { on: () => idleChannel, subscribe: () => idleChannel, teardown: () => {}, unsubscribe: async () => 'ok', send: async () => { notifyDemoReadOnly(); return 'error'; }, track: async () => 'error', presenceState: () => ({}) };
  client.channel = () => idleChannel; client.removeChannel = async () => 'ok'; client.removeAllChannels = async () => [];
  const authSaved = new Map<string, unknown>();
  for (const name of ['getSession', 'getUser', 'signInWithOAuth', 'signInWithOtp', 'signInWithPassword', 'signUp', 'updateUser', 'verifyOtp', 'setSession', 'signOut', 'resetPasswordForEmail', 'refreshSession']) {
    authSaved.set(name, client.auth[name]);
    client.auth[name] = async () => name === 'getSession' ? result({ session: null }) : name === 'getUser' ? result({ user: store.user }) : denied();
  }
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (url.origin === location.origin && /^(GET|HEAD)$/i.test(method) && !url.pathname.includes('/functions/') && !url.pathname.includes('/rest/')) return saved.fetch(input, init);
    const fn = url.pathname.match(/\/functions\/v1\/(.+)/)?.[1];
    const answer = fn ? simulationFunction(store, fn) : denied(!/^(GET|HEAD)$/i.test(method));
    return new Response(JSON.stringify(answer.data ?? answer), { status: answer.error ? 403 : 200, headers: { 'content-type': 'application/json' } });
  };
  window.open = (url, target, features) => { if (url && isDemoWindowUrl(String(url), location.origin)) return saved.open(url, target, features); notifyDemoReadOnly(); return null; };
  if (typeof saved.share === 'function') navigator.share = async () => { notifyDemoReadOnly(); throw new DOMException('Demo is read-only', 'AbortError'); };
  const preventExternal = (event: MouseEvent) => { const link = (event.target as Element)?.closest?.('a'); if (link && /^(https?:|tel:|mailto:)/.test(link.getAttribute('href') ?? '') && new URL(link.href, location.origin).origin !== location.origin) { event.preventDefault(); notifyDemoReadOnly(); } };
  document.addEventListener('click', preventExternal, true);
  let restored = false;
  return { store, restore: () => { if (restored) return; restored = true; client.from = saved.from; client.rpc = saved.rpc; client.functions.invoke = saved.invoke; client.channel = saved.channel; client.removeChannel = saved.removeChannel; client.removeAllChannels = saved.removeAllChannels; client.storage.from = saved.storageFrom; window.fetch = saved.fetch; window.open = saved.open; navigator.share = saved.share; Storage.prototype.getItem = saved.getItem; Storage.prototype.setItem = saved.setItem; Storage.prototype.removeItem = saved.removeItem; Storage.prototype.clear = saved.clear; authSaved.forEach((value, name) => { client.auth[name] = value; }); document.removeEventListener('click', preventExternal, true); } };
}