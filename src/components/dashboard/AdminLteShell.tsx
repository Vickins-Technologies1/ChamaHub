"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BrandLogo from "../BrandLogo";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Menu, Moon, Sun, LogOut, ChevronDown, ArrowUpRight } from "lucide-react";
import { useTheme } from "../ThemePreloaderProvider";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type DashboardNavSection = {
  label?: string;
  items: DashboardNavItem[];
};

type QuickAction = {
  href: string;
  label: string;
};

type DashboardUser = {
  primary: string;
  secondary?: string;
};

type Props = {
  appName: string;
  appHref?: string;
  headerKicker: string;
  navSections: DashboardNavSection[];
  quickActions?: QuickAction[];
  user: DashboardUser;
  onSignOut: () => void | Promise<void>;
  children: React.ReactNode;
};

function isActivePath(pathname: string, href: string) {
  if (!href) return false;
  if (pathname === href) return true;
  if (href === "/") return pathname === "/";
  return pathname.startsWith(`${href}/`);
}

function pickActiveItem(pathname: string, sections: DashboardNavSection[]) {
  const allItems = sections.flatMap((section) => section.items);
  const candidates = allItems.filter((item) => isActivePath(pathname, item.href));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.href.length - a.href.length)[0];
}

export default function AdminLteShell({
  appName,
  appHref = "/",
  headerKicker,
  navSections,
  quickActions,
  user,
  onSignOut,
  children,
}: Props) {
  const pathname = usePathname() || "/";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();

  const activeItem = useMemo(() => pickActiveItem(pathname, navSections), [pathname, navSections]);

  useEffect(() => {
    let wasMobile: boolean | null = null;
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile !== wasMobile) {
        if (mobile) {
          setSidebarOpen(false);
        } else {
          setSidebarOpen(window.localStorage.getItem("chamapulse-sidebar") !== "collapsed");
        }
        wasMobile = mobile;
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen((previous) => {
      const next = !previous;
      if (!isMobile) window.localStorage.setItem("chamapulse-sidebar", next ? "expanded" : "collapsed");
      return next;
    });
  };

  return (
    <div
      className="min-h-screen flex dashboard-shell dash-canvas text-[var(--foreground)] antialiased"
      data-density="compact"
    >
      {isMobile && sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={[
          "dash-sidebar",
          "flex flex-col",
          isMobile ? "fixed left-0 top-0 z-40 h-screen" : "sticky top-0 h-screen",
          sidebarOpen ? "w-[270px]" : "w-[78px]",
          isMobile ? (sidebarOpen ? "translate-x-0" : "-translate-x-full") : "translate-x-0",
          "transition-all duration-300 ease-in-out overflow-hidden",
        ].join(" ")}
      >
        <div className="dash-sidebar__header">
          <Link href={appHref} className="flex items-center gap-3 min-w-0">
            <span className="dash-brand-mark">
              <BrandLogo size={28} />
            </span>
            <div className={sidebarOpen ? "min-w-0" : "hidden"}>
              <p className="text-xs uppercase tracking-[0.26em] dash-muted">Vickins</p>
              <p className="font-semibold truncate">{appName}</p>
            </div>
          </Link>

          <button
            type="button"
            aria-label="Toggle sidebar"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="dash-icon-btn hidden lg:inline-flex"
            onClick={toggleSidebar}
          >
            {sidebarOpen ? <span className="dash-collapse" /> : <span className="dash-expand" />}
          </button>
        </div>

        <nav className="dash-nav">
          {navSections.map((section) => (
            <div key={section.label ?? "main"} className="dash-nav__section">
              {section.label && (
                <p className={sidebarOpen ? "dash-nav__label" : "dash-nav__label--collapsed"}>
                  {section.label}
                </p>
              )}
              <ul className="space-y-1.5">
                {section.items.map((item) => {
                  const active = activeItem?.href === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={sidebarOpen ? undefined : item.label}
                        aria-current={active ? "page" : undefined}
                        onClick={() => { if (isMobile) setSidebarOpen(false); }}
                        className={[
                          "dash-nav-link",
                          active ? "dash-nav-link--active" : "",
                          sidebarOpen ? "px-3" : "px-2 justify-center",
                        ].join(" ")}
                      >
                        <span className={active ? "dash-nav-dot dash-nav-dot--active" : "dash-nav-dot"} />
                        <Icon size={18} className="dash-nav-icon" />
                        <span className={sidebarOpen ? "truncate" : "hidden"}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {quickActions?.length ? (
            <div className={sidebarOpen ? "dash-quick" : "hidden"}>
              <p className="dash-nav__label">Shortcuts</p>
              <div className="space-y-2">
                {quickActions.map((action) => (
                  <Link key={action.href} href={action.href} className="dash-quick-link">
                    {action.label}
                    <span className="dash-quick-arrow" />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div className="dash-sidebar__footer">
          <button
            type="button"
            onClick={() => onSignOut()}
            aria-label="Sign out"
            title={sidebarOpen ? undefined : "Sign out"}
            className={["dash-signout", sidebarOpen ? "px-3" : "px-2 justify-center"].join(" ")}
          >
            <LogOut size={16} />
            <span className={sidebarOpen ? "" : "hidden"}>Sign out</span>
          </button>
          <p className={sidebarOpen ? "dash-footer-note" : "hidden"}>© 2026 ChamaPulse</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="dash-topbar">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="dash-icon-btn lg:hidden"
              aria-label="Toggle sidebar"
              onClick={toggleSidebar}
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="dash-topbar__kicker">{headerKicker}</p>
              <h1 className="dash-topbar__title truncate">{activeItem?.label ?? "Dashboard"}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {quickActions?.slice(0, 1).map((action) => (
              <Link key={action.href} href={action.href} className="dash-top-action hidden md:inline-flex">
                {action.label}
                <ArrowUpRight size={15} />
              </Link>
            ))}
            <button
              type="button"
              onClick={toggleTheme}
              className="dash-icon-btn"
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="relative">
              <button
                type="button"
                className="dash-user-button"
                onClick={() => setUserMenuOpen((open) => !open)}
                aria-expanded={userMenuOpen}
                aria-label="Open account menu"
              >
                <span className="dash-avatar" aria-hidden="true">{user.primary.slice(0, 1).toUpperCase()}</span>
                <span className="hidden sm:block max-w-40 text-left leading-tight">
                  <span className="block truncate text-sm font-semibold">{user.primary}</span>
                  {user.secondary ? <span className="block text-xs dash-muted">{user.secondary}</span> : null}
                </span>
                <ChevronDown size={15} className="hidden sm:block dash-muted" />
              </button>
              {userMenuOpen ? (
                <>
                  <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close account menu" onClick={() => setUserMenuOpen(false)} />
                  <div className="dash-user-menu">
                    <div className="dash-user-menu__identity">
                      <span className="block truncate text-sm font-semibold">{user.primary}</span>
                      {user.secondary ? <span className="mt-1 block text-xs dash-muted">{user.secondary}</span> : null}
                    </div>
                    <button type="button" className="dash-user-menu__action" onClick={() => { setUserMenuOpen(false); void onSignOut(); }}>
                      <LogOut size={16} /> Sign out
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-5 xl:p-7">
          <div className="mx-auto max-w-[1480px]">
            <div className="dash-content-header">
              <div className="min-w-0">
                <p className="dash-breadcrumb">
                  Home <span className="dash-breadcrumb__sep" /> {activeItem?.label ?? "Dashboard"}
                </p>
              </div>
              <div className="dash-badge hidden md:flex">{user.secondary ?? "Workspace"}</div>
            </div>

            <div className="mt-4">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
