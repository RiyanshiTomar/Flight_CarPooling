"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { ErrorBox, Skeleton, Spinner } from "@/components/States";
import { errorText, flightPattern, fmtDay, fmtTime, minutesFromNow, normalizeFlight, rupee, todayIst } from "@/lib/format";
import { service, type Airport, type FlightInfo, type Gender, type Luggage, type Place, type User } from "@/lib/services";

const LUGGAGE: { value: Luggage; label: string; icon: IconName }[] = [
  { value: "none", label: "Backpack", icon: "bag" },
  { value: "cabin", label: "Cabin bag", icon: "luggage" },
  { value: "check", label: "1-2 bags", icon: "luggage" },
  { value: "heavy", label: "3+ bags", icon: "luggage" },
];

const FALLBACK_AIRPORTS: Airport[] = [{ code: "DEL", name: "Indira Gandhi International Airport", city: "Delhi" }];

type Lookup = { state: "idle" } | { state: "loading" } | { state: "ok"; flight: FlightInfo } | { state: "error"; message: string };

export function NewTripForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [airports, setAirports] = useState<Airport[]>(FALLBACK_AIRPORTS);
  const [loadedPlaces, setLoadedPlaces] = useState<{ airport: string; list: Place[] } | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [airport, setAirport] = useState(params.get("airport") ?? "DEL");
  const [flight, setFlight] = useState(params.get("flight") ?? "");
  // client-only page (behind AuthGate), so "today" can be read during the first render
  const [date, setDate] = useState(() => {
    const d = params.get("date");
    return d && d >= todayIst() ? d : todayIst();
  });
  const [placeId, setPlaceId] = useState(params.get("place") ?? "");
  const [placeFilter, setPlaceFilter] = useState("");
  const [seats, setSeats] = useState(1);
  const [luggage, setLuggage] = useState<Luggage>("cabin");
  const [womenOnly, setWomenOnly] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [lookupResult, setLookup] = useState<{ key: string; value: Lookup } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    service.catalog.airports().then((a) => a.length && setAirports(a)).catch((e) => setError(errorText(e)));
    service.me
      .get()
      .then((u) => {
        setUser(u);
        setName(u.name ?? "");
        setGender(u.gender ?? "");
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    let live = true;
    service.catalog
      .places(airport)
      .then((p) => {
        if (!live) return;
        setLoadedPlaces({ airport, list: p });
        setPlaceId((cur) => (p.some((x) => x.id === cur) ? cur : ""));
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [airport]);

  // look the flight up as you type (debounced), so mistakes show up before you submit
  const flightOk = flightPattern.test(flight.trim());
  const lookupKey = flightOk && date ? `${normalizeFlight(flight)}|${date}|${airport}` : "";
  const lookup: Lookup = !lookupKey ? { state: "idle" } : lookupResult?.key === lookupKey ? lookupResult.value : { state: "loading" };
  useEffect(() => {
    if (!lookupKey) return;
    let live = true;
    const [no, d, ap] = lookupKey.split("|");
    const t = setTimeout(() => {
      service.flights
        .lookup(no, d, ap)
        .then((f) => live && setLookup({ key: lookupKey, value: { state: "ok", flight: f } }))
        .catch((e) => live && setLookup({ key: lookupKey, value: { state: "error", message: errorText(e) } }));
    }, 600);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [lookupKey]);

  const places = loadedPlaces?.airport === airport ? loadedPlaces.list : null;

  const place = places?.find((p) => p.id === placeId);
  const needsProfile = !!user && (!user.name || !user.gender);
  const profileOk = !needsProfile || (name.trim().length > 1 && gender !== "");
  const effectiveGender = user?.gender ?? (gender || null);
  const canWomenOnly = effectiveGender === "female";
  const wrongAirport = lookup.state === "ok" && lookup.flight.destination !== airport;
  const valid = flightOk && !!placeId && !!date && profileOk && !wrongAirport;

  const visiblePlaces = useMemo(() => {
    const f = placeFilter.trim().toLowerCase();
    return (places ?? []).filter((p) => !f || p.label.toLowerCase().includes(f));
  }, [places, placeFilter]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      if (needsProfile) await service.me.update({ name: name.trim(), gender: gender as Gender });
      const res = await service.rides.create({
        flightNo: normalizeFlight(flight),
        date,
        destPlaceId: placeId,
        seats,
        luggage,
        womenOnly: womenOnly && canWomenOnly,
        airport,
      });
      router.push(res.suggestions.length ? `/matches?request=${res.request.id}` : `/group/${res.groupId}?new=1`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative overflow-hidden rounded-3xl bg-band px-5 pb-10 pt-6 text-white md:px-7">
        <p className="text-sm font-semibold text-white/80">New ride share</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">Where are you headed?</h1>
        <p className="mt-1 text-white/80">Tell us your flight and drop area. We will find your group.</p>
        <svg className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 opacity-25" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeDasharray="3 5" />
        </svg>
      </div>

      <form onSubmit={submit} className="card relative mx-2 -mt-6 space-y-6 p-5 sm:mx-3 md:p-7" noValidate>
        {/* airport */}
        <fieldset>
          <legend className="label">Arriving at</legend>
          <div className="seg">
            {airports.map((a) => (
              <button key={a.code} type="button" aria-pressed={airport === a.code} onClick={() => setAirport(a.code)}>
                {a.city} <span className="opacity-60">{a.code}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* flight */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="flight">
              Flight number
            </label>
            <div className="relative">
              <Icon name="plane" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                id="flight"
                className="input !pl-10 uppercase"
                placeholder="6E 2041"
                value={flight}
                autoComplete="off"
                onChange={(e) => setFlight(e.target.value)}
                aria-invalid={(showErrors || flight.length > 2) && !flightOk}
                aria-describedby="flight-hint"
              />
            </div>
            <p id="flight-hint" className={`hint ${(showErrors || flight.length > 2) && !flightOk ? "!text-danger" : ""}`}>
              {(showErrors || flight.length > 2) && !flightOk ? "Use a format like 6E 2041 or AI 805" : "Airline code + number, from your ticket"}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="date">
              Arrival date
            </label>
            <input id="date" type="date" className="input" value={date} min={todayIst()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {/* flight preview */}
        <div aria-live="polite">
          {lookup.state === "loading" && (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-sm text-muted">
              <Spinner className="text-primary" /> Looking up {normalizeFlight(flight)}...
            </div>
          )}
          {lookup.state === "error" && (
            <div className="flex items-start gap-3 rounded-2xl bg-sun-soft p-4 text-sm text-sun">
              <Icon name="info" size={18} /> {lookup.message}. Check the number and date.
            </div>
          )}
          {lookup.state === "ok" && (
            <div className={`rounded-2xl border p-4 ${wrongAirport ? "border-danger/40 bg-danger-soft" : "border-line bg-surface-2"}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white">
                  <Icon name="landing" size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {lookup.flight.flightNo} &middot; {lookup.flight.origin ?? "?"} <Icon name="arrow" size={13} className="inline" /> {lookup.flight.destination}
                    {lookup.flight.terminal ? ` ${lookup.flight.terminal}` : ""}
                  </p>
                  <p className="text-sm text-muted">
                    Lands {fmtDay(lookup.flight.estimatedArrival)}, {fmtTime(lookup.flight.estimatedArrival)}
                    {lookup.flight.estimatedArrival !== lookup.flight.scheduledArrival && (
                      <span className="text-sun"> (scheduled {fmtTime(lookup.flight.scheduledArrival)})</span>
                    )}
                  </p>
                </div>
                <span className={`chip ${lookup.flight.status === "delayed" ? "chip-sun" : lookup.flight.status === "cancelled" ? "chip-red" : "chip-green"} capitalize`}>
                  {lookup.flight.status}
                </span>
              </div>
              {wrongAirport && (
                <p className="mt-3 text-sm font-semibold text-danger">
                  This flight lands at {lookup.flight.destination}, not {airport}.{" "}
                  {airports.some((a) => a.code === lookup.flight.destination) ? (
                    <button type="button" className="underline" onClick={() => setAirport(lookup.flight.destination)}>
                      Switch to {lookup.flight.destination}
                    </button>
                  ) : (
                    "FlyPool is not live there yet."
                  )}
                </p>
              )}
              {!wrongAirport && minutesFromNow(lookup.flight.estimatedArrival) < -120 && (
                <p className="mt-3 text-sm font-semibold text-sun">This flight seems to have landed already.</p>
              )}
            </div>
          )}
        </div>

        {/* destination */}
        <fieldset>
          <legend className="label">Drop area</legend>
          {places && places.length > 6 && (
            <div className="relative mb-3">
              <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input !min-h-11 !pl-10" placeholder="Search areas" value={placeFilter} onChange={(e) => setPlaceFilter(e.target.value)} aria-label="Search drop areas" />
            </div>
          )}
          {!places ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" role="radiogroup" aria-label="Drop area">
              {visiblePlaces.map((p) => {
                const on = p.id === placeId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPlaceId(p.id)}
                    className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      on ? "border-primary bg-sky-soft ring-2 ring-primary/20" : "border-line hover:border-primary/40"
                    }`}
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${on ? "bg-primary text-white" : "bg-surface-2 text-muted"}`}>
                      <Icon name={on ? "check" : "pin"} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.label}</span>
                      <span className="block text-xs text-muted">
                        Alone ~{rupee(p.estSoloFare)} &middot; shared <b className="text-accent">~{rupee(p.estSharedFare)}</b>
                      </span>
                    </span>
                  </button>
                );
              })}
              {!visiblePlaces.length && <p className="text-sm text-muted">No area matches &quot;{placeFilter}&quot;.</p>}
            </div>
          )}
          <p className={`hint ${showErrors && !placeId ? "!text-danger" : ""}`}>
            {showErrors && !placeId ? "Pick where you are going." : "Only the area is shared with others, never your exact address."}
          </p>
        </fieldset>

        {/* seats + luggage */}
        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <div>
            <span className="label" id="seats-label">
              Seats
            </span>
            <div className="flex items-center gap-2" role="group" aria-labelledby="seats-label">
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Fewer seats" disabled={seats <= 1} onClick={() => setSeats(seats - 1)}>
                <Icon name="minus" size={18} />
              </button>
              <output className="w-8 text-center text-xl font-extrabold" aria-live="polite">
                {seats}
              </output>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="More seats" disabled={seats >= 3} onClick={() => setSeats(seats + 1)}>
                <Icon name="plus" size={18} />
              </button>
            </div>
          </div>
          <fieldset>
            <legend className="label">Luggage</legend>
            <div className="seg !grid-cols-2 !grid-flow-row sm:!grid-flow-col sm:!grid-cols-none">
              {LUGGAGE.map((l) => (
                <button key={l.value} type="button" aria-pressed={luggage === l.value} onClick={() => setLuggage(l.value)} className="flex items-center justify-center gap-1.5">
                  <Icon name={l.icon} size={15} /> {l.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {needsProfile && (
          <fieldset className="rounded-2xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold">About you (one time)</legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="pname">
                  Name
                </label>
                <input id="pname" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="pgender">
                  Gender
                </label>
                <select id="pgender" className="input" value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <p className="hint">Only your first name is shown to others. Gender is used for women-only groups.</p>
          </fieldset>
        )}

        {/* women only */}
        <div className={`flex items-start gap-4 rounded-2xl border border-line p-4 ${canWomenOnly ? "" : "opacity-70"}`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-soft text-primary">
            <Icon name="heart" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold" id="wo-label">
              Women-only group
            </p>
            <p className="text-sm text-muted" id="wo-desc">
              {canWomenOnly ? "Match only with women travellers." : "Available when your profile gender is female."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={womenOnly && canWomenOnly}
            aria-labelledby="wo-label"
            aria-describedby="wo-desc"
            disabled={!canWomenOnly}
            onClick={() => setWomenOnly(!womenOnly)}
            className="switch mt-1"
          />
        </div>

        {/* estimate */}
        {place && (
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent-soft p-4">
            <div>
              <p className="text-sm font-semibold text-accent">You could save about {rupee(Math.max(0, place.estSoloFare - place.estSharedFare))}</p>
              <p className="text-xs text-muted">Rough estimate for a full cab. You pay the cab directly.</p>
            </div>
            <p className="text-right">
              <span className="block text-xs text-muted line-through">~{rupee(place.estSoloFare)}</span>
              <span className="text-2xl font-extrabold text-accent">~{rupee(place.estSharedFare)}</span>
            </p>
          </div>
        )}

        {error && <ErrorBox message={error} />}

        <button className="btn btn-primary btn-block !min-h-13 text-base" disabled={busy}>
          {busy ? <Spinner /> : <Icon name="search" size={18} />} {busy ? "Finding your group..." : "Find my group"}
        </button>
        {showErrors && !valid && !busy && (
          <p role="alert" className="-mt-3 text-center text-sm font-semibold text-danger">
            {!flightOk ? "Check the flight number." : !placeId ? "Pick a drop area." : wrongAirport ? "Fix the airport." : "Fill in your name and gender."}
          </p>
        )}
      </form>
    </div>
  );
}
