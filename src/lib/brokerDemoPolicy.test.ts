import { expect, it } from 'vitest';
import { brokerDemoRedirect, demoPersona } from './brokerDemoPolicy';
import { createPublicWorkspaceData } from './publicWorkspaceData';

it('defaults broker-only demo to My Properties', () => { expect(brokerDemoRedirect('/', 'brokers_only')).toBe('/properties'); expect(brokerDemoRedirect('/index', 'brokers_only')).toBe('/properties'); });
it.each(['/commission-mechanism', '/pricing'])('allows broker pricing information at %s without marketplace access', path => { expect(brokerDemoRedirect(path, 'brokers_only')).toBeNull(); });
it.each(['/properties', '/dashboard', '/command-center', '/signatures', '/campaigns'])('retains the actual broker page %s', path => { expect(brokerDemoRedirect(path,'brokers_only')).toBeNull(); });
it.each(['/public-listings','/sharing-pool','/partner/chats','/posts','/affiliate','/referral','/my-ads','/p/test','/developer-dashboard'])('blocks %s before rendering in broker-only demo', path => { expect(brokerDemoRedirect(path,'brokers_only')).toBe('/properties'); });
it('retains all personas and marketplace routes in full-marketplace mode', () => { expect(demoPersona('affiliate','full_marketplace')).toBe('affiliate'); expect(brokerDemoRedirect('/sharing-pool','full_marketplace')).toBeNull(); });
it('provides only a broker workspace and sample signed documents in broker-only mode', () => { const store=createPublicWorkspaceData('affiliate','brokers_only'); expect(store.role).toBe('broker'); expect(store.roles).not.toContain('affiliate'); expect(store.workspaces).toHaveLength(1); expect(store.tables.closing_documents.map(d=>d.status)).toEqual(['sent','signed','signed']); });