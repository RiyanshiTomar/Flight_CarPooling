"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";
import { useLiveStatus } from "./Live";
import { Logo } from "./Logo";

const NAV: { href: string; label: string; icon: IconName; match: string[] }[] = [
  { href: "/trip/new", label: "Find ride", icon: "search", match: ["/trip/"] },
  { href: "/trips", label: "My trips", icon: "car", match: ["/trips", "/group", "/matches"] },
  { href: "/safety", label: "Safety", icon: "shield", match: ["/safety"] },
  { href: "/profile", label: "Profile", icon: "user", match: ["/profile"] },
];

function LiveDot() {
  const status = useLiveStatus();
  const label = status === "live" ? "Live updates on" : status === "connecting" ? "Connecting..." : "Offline, retrying";
  return (
    <span className="chip chip-muted !gap-1.5" title={label}>
      <span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-accent" : status === "connecting" ? "bg-sun" : "bg-danger"}`} aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Offline"}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (m: string[]) => m.some((p) => path.startsWith(p));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Logo href="/trips" />
          <nav className="hidden gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.match) ? "page" : undefined}
                className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                  active(n.match) ? "bg-sky-soft text-primary" : "text-muted hover:text-ink"
                }`}
              >
                <Icon name={n.icon} size={16} />
                {n.label}
              </Link>
            ))}
          </nav>
          <LiveDot />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:pb-12 md:pt-8">
        {children}
      </main>

      {/* bottom tab bar (phones) */}
      <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map((n) => {
            const on = active(n.match);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-15 flex-col items-center justify-center gap-1 pt-1.5 text-[11px] font-semibold ${on ? "text-primary" : "text-muted"}`}
                >
                  <span className={`grid h-7 w-12 place-items-center rounded-full transition ${on ? "bg-sky-soft" : ""}`}>
                    <Icon name={n.icon} size={20} />
                  </span>
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
