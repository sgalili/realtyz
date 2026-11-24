import { createFileRoute } from "@tanstack/react-router";
import { DemoEntry } from "@/app/AppRoutes";

export const Route = createFileRoute("/demo/")({
  head: () => ({ meta: [{ title: 'מרחב הדגמה | TORAFF' }, { name: 'description', content: 'היכרות עם כלי TORAFF במרחב הדגמה לקריאה בלבד, ללא שמירה או שליחה אמיתית.' }, { property: 'og:title', content: 'מרחב הדגמה | TORAFF' }, { property: 'og:description', content: 'היכרות עם כלי TORAFF במרחב הדגמה לקריאה בלבד, ללא שמירה או שליחה אמיתית.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => <DemoEntry />,
});
