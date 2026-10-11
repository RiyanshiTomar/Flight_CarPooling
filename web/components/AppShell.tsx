"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";

const NAV: { href: string; label: string; icon: IconName; match: string }[] = [
  { href: "/trip/new", label: "Find ride", icon: "search", match: "/trip" },
  { href: "/trips", label: "My trips", icon: "car", match: "/trips" },
  { href: "/safety", label: "Safety", icon: "shield", match: "/safety" },
  { href: "/profile", label: "Profile", icon: "user", match: "/profile" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // group and matches pages belong to the "My trips" tab
  const active = (m: string) => path.startsWith(m) || (m === "/trips" && (path.startsWith("/group") || path.startsWith("/matches")));

  return (
    <div className="flex min-h-dvh flex-col">
      {/* top bar (desktop shows nav links) */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.match) ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                  active(n.match) ? "bg-sky-soft text-brand2" : "text-muted hover:text-ink"
                }`}
              >
                <Icon name={n.icon} size={16} />
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="chip chip-green">
            <Icon name="pin" size={14} /> Delhi IGI
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:pb-10">{children}</main>

      {/* bottom tab bar (mobile) */}
      <nav
        aria-label="Main"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map((n) => {
            const on = active(n.match);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                    on ? "text-brand2" : "text-muted"
                  }`}
                >
                  <Icon name={n.icon} size={22} />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
