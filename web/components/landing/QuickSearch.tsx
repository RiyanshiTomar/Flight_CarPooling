"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { flightPattern, normalizeFlight, todayIst } from "@/lib/format";
import { useHydrated } from "@/lib/hooks";
import { service, type Airport, type Place } from "@/lib/services";

const FALLBACK: Airport[] = [
  { code: "DEL", name: "Indira Gandhi International Airport", city: "Delhi" },
  { code: "BLR", name: "Kempegowda International Airport", city: "Bengaluru" },
];

/** The "Book your ride" band on the landing page. Pre-fills the trip form; login happens there if needed. */
export function QuickSearch() {
  const router = useRouter();
  const [airports, setAirports] = useState<Airport[]>(FALLBACK);
  const [airport, setAirport] = useState("DEL");
  const [places, setPlaces] = useState<Place[]>([]);
  const [flight, setFlight] = useState("");
  const [pickedDate, setDate] = useState<string | null>(null);
  const hydrated = useHydrated();
  const date = pickedDate ?? (hydrated ? todayIst() : "");
  const [placeId, setPlaceId] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    service.catalog.airports().then((a) => a.length && setAirports(a)).catch(() => {});
  }, []);
  useEffect(() => {
    service.catalog.places(airport).then(setPlaces).catch(() => setPlaces([]));
  }, [airport]);

  const flightOk = flightPattern.test(flight.trim());

  function go(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!flightOk) return;
    const q = new URLSearchParams({ airport, flight: normalizeFlight(flight), date });
    if (placeId) q.set("place", placeId);
    router.push(`/trip/new?${q}`);
  }

  return (
    <form onSubmit={go} className="relative overflow-hidden rounded-[1.75rem] bg-band p-5 text-white shadow-[var(--shadow-lg)] md:p-7" aria-labelledby="qs-title">
      <svg className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 opacity-20" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="48" fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="3 5" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="#fff" strokeWidth="1" />
      </svg>
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <h2 id="qs-title" className="text-lg font-bold md:text-xl">Find your ride share</h2>
        <div className="flex gap-1 rounded-full bg-white/12 p-1" role="radiogroup" aria-label="Arriving at">
          {airports.map((a) => (
            <button
              key={a.code}
              type="button"
              role="radio"
              aria-checked={airport === a.code}
              onClick={() => {
                setAirport(a.code);
                setPlaceId("");
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${airport === a.code ? "bg-white text-[#1f2a5e]" : "text-white/85 hover:bg-white/10"}`}
            >
              {a.city} <span className="opacity-60">{a.code}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-white/80">Flight number</span>
          <input
            className="input !border-white/20 uppercase"
            placeholder="6E 2041"
            value={flight}
            onChange={(e) => setFlight(e.target.value)}
            aria-invalid={touched && !flightOk}
            aria-describedby="qs-flight-err"
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-white/80">Arrival date</span>
          <input type="date" className="input !border-white/20" value={date} min={hydrated ? todayIst() : undefined} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-white/80">Going to</span>
          <select className="input !border-white/20" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            <option value="">Choose drop area (optional)</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button className="btn btn-dark btn-block !min-h-12 !bg-[#1f2a5e] !text-white md:w-auto">
            <Icon name="search" size={18} /> Find my group
          </button>
        </div>
      </div>
      <p id="qs-flight-err" className="relative mt-2 min-h-5 text-sm font-semibold text-[#ffd9b8]" role={touched && !flightOk ? "alert" : undefined}>
        {touched && !flightOk ? "Enter a flight number like 6E 2041 or AI 805" : ""}
      </p>
    </form>
  );
}
