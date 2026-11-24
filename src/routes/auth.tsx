import { createFileRoute } from "@tanstack/react-router";
import { AuthRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: 'התחברות והרשמה | TORAFF' }, { name: 'description', content: 'כניסה לחשבון TORAFF באמצעות קוד אימות לנייד.' }, { property: 'og:title', content: 'התחברות והרשמה | TORAFF' }, { property: 'og:description', content: 'כניסה לחשבון TORAFF באמצעות קוד אימות לנייד.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => <AuthRoute />,
});
