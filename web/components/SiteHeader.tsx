"use client";

import Link from "next/link";
import { useState } from "react";
import { useHasSession } from "@/lib/hooks";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#routes", label: "Routes" },
  { href: "/#safety", label: "Safety" },
  { href: "/#faq", label: "FAQ" },
];

/** Header for public pages (landing, legal, shared trip). Knows if you are logged in. */
export function SiteHeader() {
  const loggedIn = useHasSession() === true;
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-2 text-sm font-semibold text-muted hover:bg-sky-soft hover:text-primary">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {loggedIn ? (
            <Link href="/trips" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              My trips
            </Link>
          ) : (
            <Link href="/login" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              Log in
            </Link>
          )}
          <Link href="/trip/new" className="btn btn-primary btn-sm">
            Find a ride
          </Link>
          <button
            className="btn btn-ghost btn-icon !min-h-9 !w-9 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "x" : "more"} size={18} />
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-line bg-surface px-4 pb-4 md:hidden">
          <ul className="grid gap-1 pt-2">
            {[...LINKS, loggedIn ? { href: "/trips", label: "My trips" } : { href: "/login", label: "Log in" }].map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-xl px-3 py-3 font-semibold hover:bg-sky-soft">
                  {l.label} <Icon name="chevron" size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
