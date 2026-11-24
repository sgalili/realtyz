import { expect, it } from 'vitest';
import { sortDiscoveryPriority } from './brokerDiscoveryPriority';
it('orders active/queued first, saved WhatsApp second, and untouched/not-found last',()=>{
  const rows=[{user_id:'pending'},{user_id:'saved',whatsapp_phone:'972501234567'},{user_id:'not-found'},{user_id:'queued'},{user_id:'reply'},{user_id:'completed-no-number'}];
  const states=[{broker_id:'queued',source_status:'pending'},{broker_id:'reply',scanner_status:'awaiting_reply'},{broker_id:'not-found',source_status:'not_found'},{broker_id:'completed-no-number',source_status:'completed'}];
  expect(sortDiscoveryPriority(rows,states).map(r=>r.user_id)).toEqual(['queued','reply','saved','pending','not-found','completed-no-number']);
  expect(rows[0].user_id).toBe('pending');
});
it('uses live server readback for a number found while the card was away',()=>{
  expect(sortDiscoveryPriority([{user_id:'pending'},{user_id:'found'}],[{broker_id:'found',has_whatsapp:true}]).map(r=>r.user_id)).toEqual(['found','pending']);
});