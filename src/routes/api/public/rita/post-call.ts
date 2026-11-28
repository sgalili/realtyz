import { createFileRoute } from '@tanstack/react-router';
import { handleRitaPostCallRequest } from '@/lib/ritaVoice.functions';

export const Route = createFileRoute('/api/public/rita/post-call')({
  server: { handlers: { POST: async ({ request }) => {
    if (Number(request.headers.get('content-length') ?? 0) > 2000000) return new Response('Too large', { status: 413 });
    return handleRitaPostCallRequest(request);
  } } },
});
