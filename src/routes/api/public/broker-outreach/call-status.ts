import { createFileRoute } from '@tanstack/react-router';
import { handleBrokerOutreachCallStatus } from '@/lib/brokerOutreach.functions';

export const Route=createFileRoute('/api/public/broker-outreach/call-status')({server:{handlers:{POST:async({request})=>{
  // Untrusted webhook content is never stored: read current call state back from Vapi with the private key.
  if(Number(request.headers.get('content-length')??0)>100000)return new Response('Too large',{status:413});
  const body=await request.json().catch(()=>null) as {message?:{call?:{id?:string}}}|null;
  const id=body?.message?.call?.id;
  if(!id||!/^[0-9a-f-]{36}$/i.test(id))return new Response('Invalid call',{status:400});
  await handleBrokerOutreachCallStatus(id);
  return Response.json({received:true});
}}}});