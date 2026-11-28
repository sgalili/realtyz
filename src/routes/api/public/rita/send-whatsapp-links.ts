import { createFileRoute } from '@tanstack/react-router';
import { handleRitaWhatsappLinksRequest } from '@/lib/ritaVoice.functions';

export const Route = createFileRoute('/api/public/rita/send-whatsapp-links')({
  server: { handlers: { POST: ({ request }) => handleRitaWhatsappLinksRequest(request) } },
});