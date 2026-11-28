import { createFileRoute } from "@tanstack/react-router";
import { LeadCRM, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/lead-crm/$leadId")({
  head: () => ({ meta: [{ title: 'TORAFF | כרטיס ליד ותובנות ריטה' }, { name: 'description', content: 'פרטי הליד, היסטוריית שיחות ותובנות ריטה בהרשאות מרחב העבודה.' }, { property: 'og:title', content: 'TORAFF | כרטיס ליד ותובנות ריטה' }, { property: 'og:description', content: 'פרטי הליד, היסטוריית שיחות ותובנות ריטה בהרשאות מרחב העבודה.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => (
    <ProtectedRoute allowGuestDemo><LeadCRM /></ProtectedRoute>
  ),
});
