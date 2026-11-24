import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { handleBrokerOutreachReply } from '@/lib/brokerOutreach.functions';

export const Route=createFileRoute('/api/public/broker-outreach/reply')({server:{handlers:{POST:async({request})=>{
  // Existing Meta receiver validates Meta signatures first, then hands off with its service credential.
  const secret=process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!secret||!token||!timingSafeEqual(createHash('sha256').update(secret).digest(),createHash('sha256').update(token).digest()))return new Response('Unauthorized',{status:401});
  if(Number(request.headers.get('content-length')??0)>20000)return new Response('Too large',{status:413});
  const input=z.object({phone:z.string().regex(/^9725\d{8}$/),messageId:z.string().min(1).max(300),replyTo:z.string().max(300).nullable(),text:z.string().max(4000)}).safeParse(await request.json());
  if(!input.success)return new Response('Invalid input',{status:400});
  return Response.json(await handleBrokerOutreachReply(input.data));
}}}});