import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { publicWorkspaceRoute } from "@/components/demo/PublicWorkspaceProvider";

// Plain query strings, exactly like the previous router: "?id=123" stays a string
// and is never JSON-quoted.
const parseSearch = (searchStr: string) => Object.fromEntries(new URLSearchParams(searchStr));
const stringifySearch = (search: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue;
    params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
        staleTime: 5 * 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
      // Mutations handle their own errors with context-specific messages.
    },
  });

  // View-only demo prefix (/demo or /demo/<role>) of the address the router last read.
  let demoBase: string | undefined;

  const router = createRouter({
    routeTree,
    context: { queryClient },
    // RouteScrollRestoration owns per-entry scroll positions.
    scrollRestoration: false,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
    parseSearch,
    stringifySearch,
    // The view-only demo space serves the same registered pages under
    // /demo/<role>, as the former router basename did.
    rewrite: {
      input: ({ url }) => {
        const demo = publicWorkspaceRoute(url.pathname);
        demoBase = demo?.base;
        if (!demo) return undefined;
        url.pathname = url.pathname.slice(demo.base.length) || "/";
        return url;
      },
      output: ({ url }) => {
        if (!demoBase) return undefined;
        url.pathname = url.pathname === "/" ? demoBase : `${demoBase}${url.pathname}`;
        return url;
      },
    },
  });

  return router;
};
