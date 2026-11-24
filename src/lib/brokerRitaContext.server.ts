import { buildRitaOutreachPrompt, RITA_OFFICIAL_WA } from '../../supabase/functions/_shared/masterAgentPromptText';
import type { Database } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { brokerVoiceIntro } from './brokerOutreachPolicy';
import { createOpenAI } from '@ai-sdk/openai';
import { Output, streamText } from 'ai';
import { z } from 'zod';
import { createLovableAiGatewayRunIdFetch } from './ritaGatewayRunId.server';

type Admin = SupabaseClient<Database>;
export async function loadBrokerRitaContext(admin: Admin, brokerId: string) {
  // No active-workspace resolution, private KB or another broker's persona: this is platform Rita.
  const [profile, property, inventory, brain] = await Promise.all([
    admin.from('profiles').select('full_name,gender').eq('id',brokerId).single(),
    admin.from('listings').select('address,city,property_title').eq('workspace_owner_id',brokerId).eq('is_published',false).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    admin.from('listings').select('id',{count:'exact',head:true}).eq('workspace_owner_id',brokerId).eq('is_published',false),
    admin.from('global_ai_documents').select('raw_text').order('created_at',{ascending:true}).limit(40),
  ]);
  for(const result of [profile,property,inventory,brain])if(result.error)throw result.error;
  if(!profile.data)throw new Error('פרופיל המתווך אינו זמין');
  const firstName=profile.data.full_name?.trim().split(/\s+/)[0]??'';
  const gender=profile.data.gender;
  const street=property.data?.address?.replace(/\d+/g,'').replace(/\s+/g,' ').trim()??'';
  const city=property.data?.city?.trim()??'';
  const propertyContext=[street,city].filter(Boolean).join(', ');
  const globalBrain=(brain.data??[]).map(row=>row.raw_text.slice(0,4000)).join('\n\n').slice(0,20000);
  const system=buildRitaOutreachPrompt(globalBrain);
  const facts=JSON.stringify({firstName,gender:gender==='male'?'גבר':gender==='female'?'אישה':'לא ידוע, ניסוח ניטרלי',propertyContext,draftCount:inventory.count??0,summary:'TORAFF מרכזת נכסים, פניות, משימות, חתימות וקמפיינים',support:`תמיכה ישירה מריטה בוואטסאפ הרשמי ${RITA_OFFICIAL_WA}`,publication:'נכסים אינם מתפרסמים ללא אישור'});
  return {firstName,gender,propertyContext,draftCount:inventory.count??0,system,facts};
}

/** ElevenLabs narrates text; Rita's brain/persona must shape that text before TTS. */
export async function generateBrokerRitaScript(context: Awaited<ReturnType<typeof loadBrokerRitaContext>>, key: string) {
  const run=createLovableAiGatewayRunIdFetch();
  const provider=createOpenAI({baseURL:'https://ai.gateway.lovable.dev/v1',apiKey:key,headers:{'Lovable-API-Key':key,'X-Lovable-AIG-SDK':'vercel-ai-sdk'},fetch:run.fetch});
  const result=streamText({model:provider.responses('openai/gpt-6-astra'),
    instructions:context.system+'\nכתבי הקלטת היכרות חד כיוונית בלבד, עד 100 מילים בעברית. בלי שאלות, כותרות, סימני עיצוב, קישורים, מספרי טלפון, מספר בית או מקפים. התחילי בשם הפרטי ובזיהוי ריטה. הזכירי רק את הקשר הנכס שסופק ואת סיכום TORAFF, טיוטות רק כשיש טיוטות, ואת האפשרות לכתוב לריטה ישירות בוואטסאפ לתמיכה. אין אזכור שיחת טלפון עתידית. אין הבטחות חינם, מחירים או ביצוע פעולות.',
    messages:[{role:'user',content:`עובדות מאומתות בלבד:\n${context.facts}\nבסיס להקלטה:\n${brokerVoiceIntro(context.firstName,context.gender,context.draftCount,context.propertyContext)}`}],
    output:Output.object({schema:z.object({text:z.string()}).strict()}),maxRetries:0,
    providerOptions:{openai:{forceReasoning:true,reasoningEffort:'low',reasoningSummary:'auto',store:false,include:['reasoning.encrypted_content']}},
  });
  const parsed=await result.output;
  if(typeof parsed.text!=='string'||!parsed.text.trim()||parsed.text.length>1600||parsed.text.trim().split(/\s+/).length>110||/https?:|\d|[—–]|--|```/.test(parsed.text))throw new Error('נוסח ההקלטה אינו מתאים לקריינות; נדרשת בדיקה');
  return parsed.text.trim();
}