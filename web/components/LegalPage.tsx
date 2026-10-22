import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-brand">{title}</h1>
        <p className="mt-1 text-sm text-muted">Last updated {updated}</p>
        <p className="mt-6 rounded-2xl bg-sun-soft p-4 text-sm text-sun">
          Draft for the pilot. Have a lawyer review this page before public launch.
        </p>
        <div className="mt-8 space-y-6 leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted [&_li]:text-muted">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
