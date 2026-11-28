import { describe, expect, it } from 'vitest';
import { conciseRitaText, parseRitaCallSummary, ritaSummaryBullets } from './ritaCallSummary';
describe('compact Rita call facts',()=>{
  it('keeps at most three supplied facts and never fabricates bullets',()=>{
    expect(ritaSummaryBullets(['תקציב עד מיליון','עוברת בחודש הבא','פתוחה להרצליה','חזרה מחר'],null)).toEqual(['תקציב עד מיליון','עוברת בחודש הבא','פתוחה להרצליה']);
    expect(ritaSummaryBullets(null,null)).toEqual([]);
  });
  it('limits facts to 240 characters',()=>{expect(conciseRitaText('א'.repeat(500))?.length).toBe(240);});
  it('accepts the timestamp format PostgreSQL returns',()=>{
    expect(parseRitaCallSummary({conversation_id:'call-a',started_at:'2026-11-28T09:00:00+00:00',direction:'inbound',duration_seconds:72,call_role:'property_lead',bullets:['תקציב מוגדר','חזרה מחר'],qualification:{budget_financing:null,timeline_urgency:null,area_flexibility:null,viewing_availability:null,next_step:null,requested_callback:false},matched_property_ids:[]})?.duration_seconds).toBe(72);
  });
});