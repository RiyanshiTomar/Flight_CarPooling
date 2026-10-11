"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { ErrorBox } from "@/components/States";
import { errorText } from "@/lib/format";
import { service, type Airport, type Gender, type Place, type User } from "@/lib/services";

export default function NewTrip() {
  const router = useRouter();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [user, setUser] = useState<User | null>(null);

  const [airport, setAirport] = useState("DEL");
  const [flight, setFlight] = useState("");
  const [date, setDate] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [seats, setSeats] = useState(1);
  const [luggage, setLuggage] = useState<"none" | "cabin" | "check" | "heavy">("cabin");
  const [womenOnly, setWomenOnly] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // set after mount so prerendered HTML never bakes in a stale "today"
    setDate((d) => d || new Date().toLocaleDateString("en-CA"));
    service.catalog.airports().then(setAirports).catch((e) => setError(errorText(e)));
    service.me.get().then((u) => {
      setUser(u);
      setName(u.name ?? "");
      setGender(u.gender ?? "");
    }).catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    setPlaceId("");
    service.catalog.places(airport).then(setPlaces).catch((e) => setError(errorText(e)));
  }, [airport]);

  const flightOk = /^[A-Za-z0-9]{2}\s?\d{1,4}$/.test(flight.trim());
  const needsProfile = !!user && (!user.name || !user.gender);
  const profileOk = !needsProfile || (name.trim().length > 1 && gender !== "");
  const valid = flightOk && !!placeId && !!date && profileOk && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      if (needsProfile) await service.me.update({ name: name.trim(), gender: gender as Gender });
      const res = await service.rides.create({
        flightNo: flight.trim(), date, destPlaceId: placeId, seats, luggage, womenOnly, airport,
      });
      router.push(`/matches?request=${res.request.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Where are you headed?</h1>
      <p className="mt-1 text-muted">Tell us your flight and drop area. We will find your group.</p>

      <form onSubmit={submit} className="card mt-6 space-y-5 p-5">
        <div>
          <label className="label" htmlFor="airport">Arriving at</label>
          <select id="airport" className="input" value={airport} onChange={(e) => setAirport(e.target.value)}>
            {(airports.length ? airports : [{ code: "DEL", name: "Indira Gandhi International Airport", city: "Delhi" }]).map((a) => (
              <option key={a.code} value={a.code}>{a.city} - {a.name}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="flight">Flight number</label>
            <input
              id="flight"
              className="input uppercase"
              placeholder="6E 2041"
              value={flight}
              onChange={(e) => setFlight(e.target.value)}
              aria-invalid={flight.length > 0 && !flightOk}
            />
            {flight.length > 0 && !flightOk && <p className="mt-1 text-xs text-danger">Use format like 6E 2041 or AI805</p>}
          </div>
          <div>
            <label className="label" htmlFor="date">Arrival date</label>
            <input id="date" type="date" className="input" value={date} min={date && new Date().toLocaleDateString("en-CA")} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="dest">Drop area</label>
          <div className="relative">
            <Icon name="pin" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <select id="dest" className="input !pl-10" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
              <option value="">{places.length ? "Choose an area" : "Loading areas..."}</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-xs text-muted">Only the area is shared with others, never your exact address.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">Seats needed</span>
            <div className="flex items-center gap-3">
              <button type="button" className="btn btn-ghost !w-11 !px-0" aria-label="Fewer seats" onClick={() => setSeats(Math.max(1, seats - 1))}>-</button>
              <span className="w-6 text-center text-lg font-bold">{seats}</span>
              <button type="button" className="btn btn-ghost !w-11 !px-0" aria-label="More seats" onClick={() => setSeats(Math.min(3, seats + 1))}>+</button>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="lug">Luggage</label>
            <select id="lug" className="input" value={luggage} onChange={(e) => setLuggage(e.target.value as typeof luggage)}>
              <option value="none">Just a backpack</option>
              <option value="cabin">1 cabin bag</option>
              <option value="check">1-2 check-in bags</option>
              <option value="heavy">3+ bags</option>
            </select>
          </div>
        </div>

        {needsProfile && (
          <fieldset className="rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold">About you (one time)</legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="pname">Name</label>
                <input id="pname" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="pgender">Gender</label>
                <select id="pgender" className="input" value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
                  <option value="">Select</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">Only your first name is shown to others. Gender is used for women-only groups.</p>
          </fieldset>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[#5b3fe0]" checked={womenOnly} onChange={(e) => setWomenOnly(e.target.checked)} />
          <span>
            <span className="block font-semibold">Women-only group</span>
            <span className="block text-sm text-muted">Match only with women travellers.</span>
          </span>
        </label>

        {error && <ErrorBox message={error} />}

        <button className="btn btn-primary btn-block !min-h-12 text-base" disabled={!valid}>
          <Icon name="search" size={18} /> {busy ? "Finding your group..." : "Find my group"}
        </button>
      </form>
    </div>
  );
}
