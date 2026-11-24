import { Link, useLocation, type NavLinkProps } from "@/lib/router-compat";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
  /** Match only the exact path, like react-router's NavLink end. */
  end?: boolean;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName: _pendingClassName, end, to, ...props }, ref) => {
    const { pathname } = useLocation();
    const target = to.split(/[?#]/)[0] || "/";
    const isActive = pathname === target || (!end && target !== "/" && pathname.startsWith(`${target}/`));
    return <Link ref={ref} to={to} className={cn(className, isActive && activeClassName)} {...props} />;
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
