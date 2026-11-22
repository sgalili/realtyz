import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAdminBrokerRegistry, adminRegistryCreationRefusal } from '../../supabase/functions/_shared/adminBrokerRegistry';
import { BROKER_REGISTRY_RESOURCE } from '../../supabase/functions/_shared/brokerRegistry';
afterEach(()=>vi.unstubAllGlobals());
function registry(name:string){vi.stubGlobal('AbortSignal', {timeout:()=>undefined});vi.stubGlobal('fetch',vi.fn(async(url:URL)=>({ok:true,json:async()=>({success:true,result:url.pathname.endsWith('package_show')?{organization:{name:'ministry_of_justice'},resources:[{id:BROKER_REGISTRY_RESOURCE,last_modified:new Date().toISOString()}]}:{records:[{'מס רשיון':31927721,'שם המתווך':name,'עיר מגורים':'הרצליה'}]}})})));}
describe('admin official verification',()=>{
  it('refuses unmatched creation without a request error or created account',()=>{
    const refusal=adminRegistryCreationRefusal('not_found');
    expect(refusal.status).toBe(200);
    expect(refusal.body).toMatchObject({ok:false,code:'not_found'});
    expect('user_id' in refusal.body).toBe(false);
  });
  it('keeps mismatched identities unapproved and does not hide provider/input failures',()=>{
    expect(adminRegistryCreationRefusal('name_mismatch')).toMatchObject({status:200,body:{ok:false}});
    expect(adminRegistryCreationRefusal('unavailable').status).toBe(400);
    expect(adminRegistryCreationRefusal().status).toBe(400);
  });
  it('matches exact license and name and displays first name first',async()=>{registry('אידלסון דולי');expect(await checkAdminBrokerRegistry('31927721','דולי אידלסון')).toMatchObject({valid:true,holderName:'דולי אידלסון'});});
  it('does not verify a different person using the same license',async()=>{registry('אידלסון דולי');expect(await checkAdminBrokerRegistry('31927721','טל זנו')).toMatchObject({valid:false,reason:'name_mismatch'});});
  it('returns manual review state when the registry has no exact match',async()=>{registry('אידלסון דולי');expect(await checkAdminBrokerRegistry('12345','דולי אידלסון')).toEqual({valid:false,reason:'not_found'});});
});