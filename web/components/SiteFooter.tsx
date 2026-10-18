import Link from "next/link";
import { Logo } from "./Logo";

const COLS = [
  { title: "Ride", links: [["Find a ride", "/trip/new"], ["My trips", "/trips"], ["How it works", "/#how"], ["Popular routes", "/#routes"]] },
  { title: "Safety", links: [["Safety centre", "/safety"], ["Women-only groups", "/#safety"], ["Share your trip", "/#safety"], ["FAQ", "/#faq"]] },
  { title: "Legal", links: [["Terms of use", "/terms"], ["Privacy policy", "/privacy"]] },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">
            Land, match and share one cab with travellers heading your way. Launching at Delhi IGI, then Bengaluru.
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h2 className="text-sm font-bold text-brand">{c.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-muted hover:text-primary">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted">
          FlyPool only connects travellers. We do not operate or book cabs and we do not collect fares. Amounts shown are rough
          estimates. &copy; FlyPool
        </p>
      </div>
    </footer>
  );
}
