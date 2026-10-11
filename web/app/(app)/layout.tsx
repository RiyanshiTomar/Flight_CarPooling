import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { Loading } from "@/components/States";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Suspense: AppShell reads the current URL (usePathname), which is only known per request on dynamic routes
  return (
    <Suspense fallback={<Loading />}>
      <AppShell>
        <AuthGate>{children}</AuthGate>
      </AppShell>
    </Suspense>
  );
}
