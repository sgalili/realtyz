import { expect, it, vi } from 'vitest';
import { runRegistryBatchStep } from '../../supabase/functions/_shared/brokerRegistryBatchRunner';
function setup() {
 const items=[{id:'one',broker_id:'broker-one',license_number:'123'},{id:'two',broker_id:'broker-two',license_number:'456'}];const state={status:'running',lease_token:'token'};
 const rpc=vi.fn(async(name:string,args:any)=>{if(name==='claim_broker_registry_batch')return{data:[{...state,created_by:'admin'}]};if(name==='finish_broker_registry_item'){items.shift();return{data:state.status==='running'};}return{};});
 const admin={rpc,from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,lte:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==='broker_registry_batches'?state:items[0]})};return q;}};
 return{admin,rpc,state};
}
it('continues serial checks and persists each outcome without a user session or mounted screen',async()=>{
 const s=setup();let active=0;const check=vi.fn(async(_a,id,license)=>{expect(++active).toBe(1);await Promise.resolve();active--;return{profile:{id,broker_license_number:license}} as any;});
 await runRegistryBatchStep(s.admin,'batch',check);
 expect(check).toHaveBeenCalledTimes(2);expect(s.rpc.mock.calls.filter(([name])=>name==='finish_broker_registry_item').map(([,args])=>args._status)).toEqual(['verified','verified']);expect(s.rpc).toHaveBeenLastCalledWith('release_broker_registry_batch',{_id:'batch',_token:'token'});
});
it('stops launching the next check after explicit cancellation without cancelling saved results',async()=>{
 const s=setup();const check=vi.fn(async(_a,id,license)=>{s.state.status='cancelled';return{profile:{id,broker_license_number:license}} as any;});
 await runRegistryBatchStep(s.admin,'batch',check);expect(check).toHaveBeenCalledTimes(1);
});
it('never marks an unrelated response verified',async()=>{
 const s=setup();await runRegistryBatchStep(s.admin,'batch',vi.fn(async()=>({profile:{id:'unrelated',broker_license_number:'123'}}) as any));
 expect(s.rpc.mock.calls.filter(([name])=>name==='finish_broker_registry_item').every(([,args])=>args._status==='failed')).toBe(true);
});
it('defers temporary registry failures through the persisted retry state',async()=>{
 const s=setup();await runRegistryBatchStep(s.admin,'batch',vi.fn(async()=>{throw Object.assign(new Error('unavailable'),{status:503});}));
 expect(s.rpc).toHaveBeenCalledWith('finish_broker_registry_item',expect.objectContaining({_status:'failed',_retry:true}));
});
it('records a definitive registry no-match as missing, never as a transient failure',async()=>{
 const s=setup();await runRegistryBatchStep(s.admin,'batch',vi.fn(async()=>{throw Object.assign(new Error('no match'),{code:'license_not_found',status:404});}));
 expect(s.rpc).toHaveBeenCalledWith('finish_broker_registry_item',expect.objectContaining({_status:'missing',_retry:false}));
});
