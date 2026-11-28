import { createFileRoute } from '@tanstack/react-router';
import { handleRitaPropertySearchRequest } from '@/lib/ritaVoice.functions';

export const Route = createFileRoute('/api/public/rita/search-properties')({
  server: { handlers: { POST: async ({ request }) => {
    if (Number(request.headers.get('content-length') ?? 0) > 20000) return new Response('Too large', { status: 413 });
    return handleRitaPropertySearchRequest(request);
  } } },
});
