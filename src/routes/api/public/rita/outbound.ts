import { createFileRoute } from '@tanstack/react-router';
import { handleRitaOutboundRequest } from '@/lib/ritaVoice.functions';

export const Route = createFileRoute('/api/public/rita/outbound')({
  server: { handlers: { POST: async ({ request }) => {
    if (Number(request.headers.get('content-length') ?? 0) > 20000) return new Response('Too large', { status: 413 });
    return handleRitaOutboundRequest(request);
  } } },
});
