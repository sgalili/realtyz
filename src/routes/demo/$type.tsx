import { createFileRoute } from "@tanstack/react-router";
import { DemoEntry } from "@/app/AppRoutes";

export const Route = createFileRoute("/demo/$type")({
  head: () => ({ meta: [{ title: 'סביבת עבודה לדוגמה | TORAFF' }, { name: 'description', content: 'הכירו את סביבת העבודה של TORAFF עם נתונים לדוגמה בלבד, ללא שינוי בחשבון אמיתי.' }, { property: 'og:title', content: 'סביבת עבודה לדוגמה | TORAFF' }, { property: 'og:description', content: 'הכירו את סביבת העבודה של TORAFF עם נתונים לדוגמה בלבד, ללא שינוי בחשבון אמיתי.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => <DemoEntry />,
});
