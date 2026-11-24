import { createFileRoute } from "@tanstack/react-router";
import { RootRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: 'TORAFF | ניהול נדל״ן עם ריטה' }, { name: 'description', content: 'TORAFF וריטה: נכסים, פניות, משימות ותקשורת במקום אחד.' }, { property: 'og:title', content: 'TORAFF | ניהול נדל״ן עם ריטה' }, { property: 'og:description', content: 'TORAFF וריטה: נכסים, פניות, משימות ותקשורת במקום אחד.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => <RootRoute />,
});
