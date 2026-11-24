import { beforeEach, expect, it, vi } from 'vitest';
import { refreshAdminRegistryName } from '../../supabase/functions/_shared/adminRegistryRefresh';
import { RegistryNameError } from '../../supabase/functions/_shared/brokerRegistryNameLookup';
const lookup = vi.hoisted(() => vi.fn());
vi.mock('../../supabase/functions/_shared/brokerRegistryNameLookup.ts', async importOriginal => ({ ...await importOriginal<object>(), fetchRegistryName: lookup }));
function fixture() {
 const matches = new Set<string>();
 const profile={id:'broker',full_name:'שם שמור',broker_license_number:null,locked_broker_name:null,gender:'female'};
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  if(name==='save_admin_registry_no_match'){matches.add(`${args['_user']}:${args['_license']}`);return{data:true,error:null};}
  return{data:{...profile,full_name:'שם רשמי',broker_license_number:'123'},error:null};
 });
 const admin={rpc,from:(table:string)=>{
  const filters:Record<string,string>={};
  const q={select:()=>q,eq:(k:string,v:string)=>{filters[k]=v;return q;},neq:()=>q,limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:table==='profiles'?profile:table==='admin_broker_onboarding'?{imported_license_number:'123'}:matches.has(`${filters['broker_id']}:${filters['license_number']}`)?{license_number:'123'}:null,error:null})};
  return q;
 }};
 return{admin,rpc,matches,profile};
}
beforeEach(()=>{lookup.mockReset();});
it('persists only a definitive no-match for the exact saved broker and license and skips later requests',async()=>{
 const s=fixture();lookup.mockRejectedValue(new RegistryNameError('license_not_found','not found',404));
 await expect(refreshAdminRegistryName(s.admin,'broker','123','admin')).rejects.toMatchObject({code:'license_not_found'});
 expect(s.rpc).toHaveBeenCalledWith('save_admin_registry_no_match',{_actor:'admin',_user:'broker',_license:'123',_batch:null,_token:null});
 await expect(refreshAdminRegistryName(s.admin,'broker','123','admin')).rejects.toMatchObject({code:'license_not_found'});
 expect(lookup).toHaveBeenCalledTimes(1);expect(s.profile.gender).toBe('female');expect(s.profile.full_name).toBe('שם שמור');
});
it('does not persist network outages as permanent no-match',async()=>{
 const s=fixture();lookup.mockRejectedValue(new RegistryNameError('registry_unavailable','outage',503));
 await expect(refreshAdminRegistryName(s.admin,'broker','123','admin')).rejects.toMatchObject({code:'registry_unavailable'});
 expect(s.rpc).not.toHaveBeenCalled();expect(s.matches.size).toBe(0);
});
it('keeps cancellation fencing when saving a batch no-match',async()=>{
 const s=fixture();lookup.mockRejectedValue(new RegistryNameError('license_not_found','not found',404));
 s.rpc.mockResolvedValue({data:null,error:{code:'40001'}} as never);
 await expect(refreshAdminRegistryName(s.admin,'broker','123','admin',{id:'batch',token:'lease'})).rejects.toMatchObject({code:'save_failed'});
 expect(s.rpc).toHaveBeenCalledWith('save_admin_registry_no_match',expect.objectContaining({_batch:'batch',_token:'lease'}));
});
