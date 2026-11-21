import * as cheerio from 'npm:cheerio@1.0.0';
import { adminClient } from './authz.ts';
import { collectBrokers } from './brokerImportQueue.ts';
import { parseAgencyProfile, agencyUrl } from './yad2Agencies.ts';
import { developerImportUrl, developerProjectImportRow, detailedUnitCount } from './yad2DeveloperImport.ts';
import { normalizeDeveloperName } from './developerIdentity.ts';
import { readAllRows } from './readAllRows.ts';

type Admin = ReturnType<typeof adminClient>;
export async function internalImportCall(name: string, body: unknown) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(140000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw Object.assign(new Error(typeof data.error === 'string' ? data.error : data.detail ?? `internal_import_http_${response.status}`), { status: response.status });
  return data;
}

export async function knownExternalEntity(admin: Admin, kind: string, url: string, license?: string) {
  if (kind === 'developer') {
    const { data, error } = await admin.from('developers').select('id').eq('source_url', url).limit(1);
    if (error) throw error;
    return Boolean(data?.length);
  }
  if (license) {
    const [{ data: profiles, error: pe }, { data: approved, error: ae }, { data: imported, error: ie }] = await Promise.all([
      admin.from('profiles').select('id').eq('broker_license_number', license).limit(1),
      admin.from('admin_approved_broker_licenses').select('user_id').eq('license_number', license).limit(1),
      admin.from('admin_broker_onboarding').select('user_id').eq('imported_license_number', license).limit(1),
    ]);
    if (pe || ae || ie) throw pe ?? ae ?? ie;
    if (profiles?.length || approved?.length || imported?.length) return true;
  }
  // One indexed JSON containment lookup instead of reading every historical job.
  const { data: jobs, error: je } = await admin.from('broker_import_jobs').select('id').contains('checkpoint', { brokerResults: [{ source_url: url }] }).limit(1);
  if (je) throw je;
  return Boolean(jobs?.length);
}

export async function commitExternalEntity(admin: Admin, job: any, body: any) {
  const c = job.checkpoint ?? {};
  if (body.action === 'known') {
    const url = body.kind === 'developer' ? developerImportUrl(body.url) : agencyUrl(body.url);
    if (!url) throw new Error('invalid_source_url');
    const own=(c.externalPendingDeveloper?.source_url===url?c.externalPendingDeveloper:null)||(c.developerResults??[]).find((r:any)=>r.source_url===url)||(c.brokerResults??[]).find((r:any)=>r.source_url===url);
    return { ok: true, known: own ? false : await knownExternalEntity(admin, body.kind, url, body.license) };
  }
  if (body.action === 'broker') {
    const url = agencyUrl(body.url);
    if (!url) throw new Error('invalid_source_url');
    // Yad2 office feeds show five ads per page: ask the Worker for the next pages until the per-broker maximum is reachable.
    const first = parseAgencyProfile(cheerio.load(body.html), url, job.max_listings);
    const extra = Array.isArray(body.more_html) ? body.more_html.filter((h: unknown) => typeof h === 'string').slice(0, 9) : [];
    if (first.results[0]?.publisher?.broker_license_number && !Array.isArray(body.more_html) && (first.results[0]?.listing_urls?.length ?? 0) < job.max_listings && Number(first.total_pages) > 1) {
      const pages = Math.min(Number(first.total_pages), 10, Math.ceil(job.max_listings / 5));
      if (pages > 1) return { ok: true, need_pages: Array.from({ length: pages - 1 }, (_, i) => { const u = new URL(url); u.searchParams.set('page', String(i + 2)); return u.href; }) };
    }
    const rows = first.results.map((r: any, i: number) => i ? r : { ...r, listing_urls: [...new Set([...(r.listing_urls ?? []), ...extra.flatMap((h: string) => parseAgencyProfile(cheerio.load(h), url, job.max_listings).results[0]?.listing_urls ?? [])])] });
    const brokers = collectBrokers(rows, job.min_listings, job.max_listings);
    const b = brokers[0];
    if (!b) return { ok: true, skipped: true, reason: 'missing_identity_or_below_minimum' };
    const prior = (c.brokerResults ?? []).find((r: any) => r.source_url === url);
    if (prior) return { ok: true, broker: { ...b, broker_id: prior.broker_id }, replay: true };
    if (await knownExternalEntity(admin, 'broker', url, b.license_number)) return { ok: true, skipped: true, reason: 'already_imported' };
    const created = await internalImportCall('super-admin-create-user', { full_name: b.full_name, ...(b.phone ? { phone_e164: b.phone } : {}), broker_license_number: b.license_number, approve_broker: false, import_job_id: job.id, import_source_url: url, user_type: 'broker', initial_balance_agorot: 2500 });
    if (!created.user_id) throw new Error('account_not_saved');
    const brokerId = created.user_id;
    if (b.office_name) {
      const { error } = await admin.from('white_label_settings').upsert({ user_id: brokerId, agency_name: b.office_name, brokerage_name: b.office_name, ...(b.agency_description ? { agency_description: b.agency_description } : {}) }, { onConflict: 'user_id' });
      if (error) throw error;
    }
    const results = [...(c.brokerResults ?? []), { broker_id: brokerId, full_name: b.full_name, office_name: b.office_name, source_url: url, license_number: b.license_number, listing_urls:b.listing_urls }];
    const { error } = await admin.from('broker_import_jobs').update({ checkpoint: { ...c, brokerResults: results, brokerId }, updated_at: new Date().toISOString() }).eq('id', job.id).eq('lease_token', job.lease_token);
    if (error) throw error;
    return { ok: true, broker: { ...b, broker_id: brokerId }, brokerResults: results };
  }
  if (body.action === 'listing') {
    if (!(c.brokerResults ?? []).some((r: any) => r.broker_id === body.broker_id)) throw new Error('workspace_not_in_job');
    if (!/^https:\/\/www\.yad2\.co\.il\/realestate\/item\/[a-zA-Z0-9]+(?:\?.*)?$/.test(body.url)) throw new Error('invalid_source_url');
    return internalImportCall('yad2-unlocker', { owner_id: body.broker_id, url: body.url, import_item: true, residential_only: true, external_html: body.html, admin_import_job_id: job.id, admin_import_lease_token: job.lease_token });
  }
  const url = developerImportUrl(body.url);
  const company = String(body.developer?.company_name ?? '').trim();
  if (!url || !company || !Array.isArray(body.projects)) throw new Error('invalid_developer');
  const existing = await readAllRows((from, to) => admin.from('developers').select('id,company_name,source_url,workspace_owner_id').order('id').range(from, to));
  const prior = (c.developerResults ?? []).find((r: any) => r.source_url === url);
  const pending = c.externalPendingDeveloper?.source_url===url ? c.externalPendingDeveloper : null;
  if (prior) return { ok: true, replay: true, result: prior };
  if (!pending && existing.some(d => d.source_url === url || normalizeDeveloperName(d.company_name) === normalizeDeveloperName(company))) return { ok: true, skipped: true, reason: 'already_imported' };
  const identityKey = normalizeDeveloperName(company);
  // Reuse the lease token across partial page reads of the same developer; a new token per page made our own lease look busy.
  const identityToken = pending?.identity_token ?? crypto.randomUUID();
  const { data: identity, error: claimError } = await admin.rpc('claim_developer_import_identity', { _key: identityKey, _token: identityToken });
  if (claimError) throw claimError;
  if (identity?.busy) { const e: any = new Error('developer_identity_busy'); e.status = 409; throw e; }
  let owner = pending?.owner;
  let developerId = pending?.developer_id;
  if (!owner || !developerId) {
    const created = await internalImportCall('super-admin-create-user', { full_name: company, user_type: 'developer', import_job_id: job.id, import_source_url: url, initial_balance_agorot: 2500 });
    owner = created.user_id;
    if (!owner) throw new Error('account_not_saved');
    const { data: developer, error: de } = await admin.from('developers').insert({ workspace_owner_id: owner, owner_user_id: owner, company_name: company, source_url: url, logo_url: body.developer.logo_url ?? null, phone: body.developer.phone ?? null }).select('id').single();
    if (de) throw de;
    if (!developer?.id) throw new Error('developer_not_saved');
    developerId = developer.id;
    c.externalPendingDeveloper={source_url:url,owner,developer_id:developerId,identity_token:identityToken};
    const {error:pe}=await admin.from('broker_import_jobs').update({checkpoint:c}).eq('id',job.id).eq('lease_token',job.lease_token);if(pe)throw pe;
  }
  const savedProjects=await readAllRows((from,to)=>admin.from('developer_projects').select('*').eq('developer_id',developerId).order('id').range(from,to));
  const projects = body.projects.slice(0, c.maxProjects ?? body.projects.length).map((p: any) => developerProjectImportRow(savedProjects.find((old:any)=>old.source_url===p.source_url), p, developerId, owner));
  if (projects.length) { const { error } = await admin.from('developer_projects').upsert(projects, { onConflict: 'developer_id,source_project_id' }); if (error) throw error; }
  const { error: finishError } = await admin.rpc('finish_developer_import_identity', { _key: identityKey, _token: identityToken, _developer: developerId, _workspace: owner });
  if (finishError) throw finishError;
  const result = { developer_id: developerId, company_name: company, source_url: url, projects: projects.length, units: projects.reduce((n:number,p:any)=>n+detailedUnitCount(p),0), status: 'completed' };
  // Preserve the original developer and saved private hierarchy between recursive page reads.
  if(body.partial) return {ok:true,partial:true,pending:c.externalPendingDeveloper,result:{...result,status:'running'}};
  const results = [...(c.developerResults ?? []), result];
  delete c.externalPendingDeveloper;
  const { error } = await admin.from('broker_import_jobs').update({ checkpoint: { ...c, developerResults: results }, updated_at: new Date().toISOString() }).eq('id', job.id).eq('lease_token', job.lease_token);
  if (error) throw error;
  return { ok: true, result, developerResults: results };
}