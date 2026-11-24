import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqual,createHash } from 'node:crypto';
import { z } from 'zod';
import { handleBrokerOutreachEmailReply } from '@/lib/brokerOutreach.functions';
export const Route=createFileRoute('/api/public/broker-outreach/email-reply')({server:{handlers:{POST:async({request})=>{
  const secret=process.env['SUPABASE_SERVICE_ROLE_KEY'];const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!secret||!token||!timingSafeEqual(createHash('sha256').update(secret).digest(),createHash('sha256').update(token).digest()))return new Response('Unauthorized',{status:401});
  const input=z.object({email:z.string().email().max(300),messageId:z.string().min(1).max(300),text:z.string().max(4000)}).safeParse(await request.json());
  if(!input.success)return new Response('Invalid input',{status:400});
  return Response.json(await handleBrokerOutreachEmailReply(input.data));
}}}});