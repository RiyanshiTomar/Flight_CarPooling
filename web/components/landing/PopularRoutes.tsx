"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/States";
import { rupee } from "@/lib/format";
import { service, type Place } from "@/lib/services";

const AIRPORTS = [
  { code: "DEL", label: "Delhi IGI" },
  { code: "BLR", label: "Bengaluru" },
];

/** Route cards with a fare tag, like a cab-booking site, but the tag is the shared price. */
export function PopularRoutes() {
  const [airport, setAirport] = useState("DEL");
  const [loaded, setLoaded] = useState<{ airport: string; list: Place[] } | null>(null);
  const places = loaded?.airport === airport ? loaded.list : null;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    service.catalog
      .places(airport)
      .then((p) => live && setLoaded({ airport, list: [...p].sort((a, b) => b.estSoloFare - a.estSoloFare).slice(0, 8) }))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [airport]);

  return (
    <div>
      <div className="seg w-full max-w-xs" role="tablist" aria-label="Airport">
        {AIRPORTS.map((a) => (
          <button key={a.code} role="tab" aria-selected={airport === a.code} onClick={() => setAirport(a.code)}>
            {a.label}
          </button>
        ))}
      </div>

      {failed && <p className="mt-6 text-sm text-muted">Routes will show here once the server is reachable.</p>}

      <ul className="no-scrollbar -mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {(places ?? Array.from({ length: 4 }, () => null)).map((p, i) => (
          <li key={p?.id ?? i} className="card relative flex w-[78%] shrink-0 snap-start flex-col overflow-hidden p-5 pt-6 sm:w-auto">
            {p ? (
              <>
                <span className="fare-tag" aria-label={`Shared from about ${rupee(p.estSharedFare)} per person`}>
                  ~{rupee(p.estSharedFare)}
                </span>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-soft text-primary">
                  <Icon name="route" size={22} />
                </span>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{airport === "DEL" ? "IGI Airport" : "BLR Airport"} to</p>
                <h3 className="mt-0.5 font-bold leading-snug">{p.label}</h3>
                <p className="mt-2 text-sm text-muted">
                  Alone <s className="opacity-70">~{rupee(p.estSoloFare)}</s> &middot; shared{" "}
                  <b className="text-accent">~{rupee(p.estSharedFare)}</b>
                </p>
                <Link
                  href={`/trip/new?airport=${airport}&place=${encodeURIComponent(p.id)}`}
                  className="btn btn-soft btn-sm mt-4 self-start"
                  aria-label={`Share a ride to ${p.label}`}
                >
                  Share this ride <Icon name="arrow" size={14} />
                </Link>
              </>
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-12 w-12" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-28" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
