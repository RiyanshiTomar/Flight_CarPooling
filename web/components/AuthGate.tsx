"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { service } from "@/lib/services";

/** Client-side guard: shows children only when logged in, otherwise sends the user to /login. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (service.auth.current()) setOk(true);
    else router.replace("/login");
  }, [router]);

  if (!ok) return <p className="py-16 text-center text-muted">Loading...</p>;
  return <>{children}</>;
}
