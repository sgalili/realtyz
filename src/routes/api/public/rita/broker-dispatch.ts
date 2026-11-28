import { createFileRoute } from '@tanstack/react-router';
import { handleRitaBrokerDispatchRequest } from '@/lib/ritaVoice.functions';

export const Route = createFileRoute('/api/public/rita/broker-dispatch')({
  server: { handlers: { POST: ({ request }) => handleRitaBrokerDispatchRequest(request) } },
});