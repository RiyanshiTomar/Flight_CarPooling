"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHasSession } from "@/lib/hooks";
import { LiveProvider } from "./Live";
import { Loading } from "./States";

/**
 * Client-side guard: shows children only when logged in, otherwise sends the user to /login
 * and brings them back to the same page (with its query string) afterwards.
 * The API checks every request too; this is only for a smooth experience.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const ok = useHasSession();

  useEffect(() => {
    if (ok !== false) return;
    const next = path + window.location.search;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [ok, router, path]);

  if (!ok) return <Loading text="Checking your session..." />;
  return <LiveProvider>{children}</LiveProvider>;
}
