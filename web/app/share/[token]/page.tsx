import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Loading } from "@/components/States";
import { SharedTripView } from "./SharedTripView";

export const metadata: Metadata = {
  title: "Shared trip",
  robots: { index: false, follow: false }, // private links must never show up in search
};

export default function SharedTripPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <Suspense fallback={<Loading />}>
          <SharedTripView />
        </Suspense>
      </main>
    </div>
  );
}
