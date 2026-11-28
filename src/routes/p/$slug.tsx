import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageLoader, PublicListingPage } from "@/app/AppRoutes";

export const Route = createFileRoute("/p/$slug")({
  head: ({ params }) => ({ meta: [
    { title: `TORAFF | פרטי נכס ${params.slug}` },
    { name: 'description', content: 'פרטי הנכס, תמונות ופנייה למפרסם דרך TORAFF.' },
    { property: 'og:title', content: `TORAFF | נכס ${params.slug}` },
    { property: 'og:description', content: 'צפייה בפרטי הנכס ופנייה דרך TORAFF.' },
    { property: 'og:type', content: 'article' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => (
    <Suspense fallback={<PageLoader />}><PublicListingPage /></Suspense>
  ),
});
