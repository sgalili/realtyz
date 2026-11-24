/**
 * Router-compat shim — bridges @/lib/router-compat v6 call sites to
 * @tanstack/react-router without hand-rewriting every component.
 * This is the same load-bearing pattern used in Klar's dev-copy migration.
 */
import {
  useNavigate as tsNavigate,
  useLocation as tsLocation,
  useParams as tsParams,
  useSearch as tsSearch,
  useRouter,
  Link as TSLink,
  Navigate as TSNavigate,
  Outlet as TSOutlet,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import {
  Children,
  createContext,
  useEffect,
  isValidElement,
  useContext,
  useMemo,
  useCallback,
  forwardRef,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";

// ---------- shared URL parsing ----------

function parseTo(to: string): { pathname: string; search?: Record<string, string>; hash?: string } {
  const [beforeHash, hashStr] = (to ?? "").split("#");
  const [pathname, searchStr] = beforeHash.split("?");
  return {
    // react-router keeps the current path for search-only ("?a=1") and
    // hash-only ("#section") targets; TanStack's "." means current route.
    pathname: pathname || ".",
    search: searchStr ? Object.fromEntries(new URLSearchParams(searchStr)) : undefined,
    hash: hashStr || undefined,
  };
}

// ---------- useNavigate ----------

type NavigateOptions = { replace?: boolean; state?: unknown };

type PathObject = { pathname?: string; search?: string; hash?: string };
type To = string | PathObject;

function toHref(to: To): string {
  if (typeof to === "string") return to;
  const search = to.search ? (to.search.startsWith("?") ? to.search : `?${to.search}`) : "";
  const hash = to.hash ? (to.hash.startsWith("#") ? to.hash : `#${to.hash}`) : "";
  return `${to.pathname ?? ""}${search}${hash}`;
}

type NavigateFn = {
  (to: To | number, options?: NavigateOptions): void;
  (delta: number): void;
};

export function useNavigate(): NavigateFn {
  const tsNav = tsNavigate();
  const router = useRouter();
  return useCallback((to: To | number, options?: NavigateOptions) => {
    if (typeof to === "number") {
      router.history.go(to);
      return;
    }
    const { pathname, search, hash } = parseTo(toHref(to));
    tsNav({
      to: pathname,
      search: search as never,
      hash,
      state: options?.state as never,
      replace: options?.replace,
    });
  }, [tsNav, router]) as NavigateFn;
}

// ---------- useLocation ----------

export function useLocation() {
  const loc = tsLocation();
  return useMemo(
    () => ({
      pathname: loc.pathname,
      search: loc.searchStr ?? "",
      hash: loc.hash ?? "",
      // react-router types location.state as any; call sites read their own shapes.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state: (loc.state ?? null) as any,
      // Unique per history entry, like react-router's location.key.
      key: String((loc.state as { __TSR_key?: string; key?: string } | undefined)?.__TSR_key ?? (loc.state as { key?: string } | undefined)?.key ?? loc.pathname + (loc.searchStr ?? "")),
    }),
    [loc.pathname, loc.searchStr, loc.hash, loc.state],
  );
}

// ---------- useParams ----------

const LocalParamsContext = createContext<Record<string, string> | null>(null);

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  const local = useContext(LocalParamsContext);
  const params = tsParams({ strict: false } as never) as T;
  return (local ?? params) as T;
}


// ---------- useSearchParams (@/lib/router-compat compat) ----------

export function useSearchParams(): [URLSearchParams, (init: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams), opts?: { replace?: boolean }) => void] {
  const loc = tsLocation();
  const nav = tsNavigate();
  const router = useRouter();
  const params = useMemo(() => new URLSearchParams(loc.searchStr ?? ""), [loc.searchStr]);
  const setParams = useCallback(
    (
      init: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams),
      opts?: { replace?: boolean },
    ) => {
      // Functional updaters read the router's live location, not the render
      // snapshot — react-router passes call-time params, and chained updates
      // within one tick must see each other's writes.
      const live = router.state.location;
      const current = new URLSearchParams(live.searchStr ?? "");
      const next =
        typeof init === "function"
          ? init(current)
          : init instanceof URLSearchParams
            ? init
            : new URLSearchParams(init);
      const searchObj: Record<string, string> = {};
      next.forEach((v, k) => { searchObj[k] = v; });
      nav({ to: live.pathname, search: searchObj as never, replace: opts?.replace });
    },
    [nav, router],
  );
  return [params, setParams];
}

// ---------- Link ----------

type LinkProps = Omit<ComponentProps<typeof TSLink>, "to" | "state" | "replace" | "search" | "hash"> & {
  to: string;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, state, children, ...rest },
  ref,
) {
  const { pathname, search, hash } = parseTo(to);
  return (
    <TSLink
      ref={ref as never}
      to={pathname as never}
      search={search as never}
      hash={hash}
      replace={replace}
      state={state as never}
      {...((rest ?? {}) as Record<string, unknown>)}
    >
      {children}
    </TSLink>
  );
});


// ---------- Navigate ----------

export function Navigate({ to, replace, state }: { to: string; replace?: boolean; state?: unknown }) {
  const { pathname, search, hash } = parseTo(to);
  return <TSNavigate to={pathname as never} search={search as never} hash={hash} state={state as never} replace={replace} />;
}

// ---------- Outlet ----------

export const Outlet = TSOutlet;

// ---------- NavLink (minimal) ----------

export type NavLinkProps = LinkProps;
export const NavLink = Link;

// ---------- Test-only helpers (react-router calling convention) ----------

const parseSearch = (searchStr: string) => Object.fromEntries(new URLSearchParams(searchStr));
const stringifySearch = (search: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
};

/** Renders children inside an in-memory router, like react-router's MemoryRouter. */
export function MemoryRouter({
  initialEntries = ["/"],
  initialIndex,
  children,
}: {
  initialEntries?: string[];
  initialIndex?: number;
  children?: ReactNode;
}) {
  const router = useMemo(() => {
    const rootRoute = createRootRoute();
    const index = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => null });
    const splat = createRoute({ getParentRoute: () => rootRoute, path: "$", component: () => null });
    return createRouter({
      routeTree: rootRoute.addChildren([index, splat]),
      history: createMemoryHistory({ initialEntries, ...(initialIndex === undefined ? {} : { initialIndex }) }),
      parseSearch,
      stringifySearch,
    });
    // The router is created once per mount, like MemoryRouter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Children render immediately (like react-router), while navigations still
  // update the router location.
  useEffect(() => router.history.subscribe(() => { void router.load(); }), [router]);
  return <RouterContextProvider router={router as never}>{children}</RouterContextProvider>;
}

type RouteElementProps = { path?: string; element?: ReactNode };

/** Declarative route element, read by <Routes>. */
export function Route(_props: RouteElementProps): null {
  return null;
}

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  if (pattern === "*") return {};
  const names: string[] = [];
  const source = pattern
    .replace(/\/+$/, "")
    .split("/")
    .map((segment) => {
      if (segment === "*") { names.push("*"); return "(.*)"; }
      if (segment.startsWith(":")) { names.push(segment.slice(1)); return "([^/]+)"; }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  const match = new RegExp(`^${source || ""}/?$`).exec(pathname);
  if (!match) return null;
  return Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(match[i + 1] ?? "")]));
}

/** Renders the first matching <Route> child, like react-router's <Routes>. */
export function Routes({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const { path, element } = (child as ReactElement<RouteElementProps>).props;
    const params = matchPath(path ?? "/", pathname);
    if (params) return <LocalParamsContext.Provider value={params}>{element}</LocalParamsContext.Provider>;
  }
  return null;
}
