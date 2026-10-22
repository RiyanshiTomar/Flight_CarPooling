"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { ErrorBox, Skeleton } from "@/components/States";
import { errorText, fmtDay, fmtRange, fmtTime } from "@/lib/format";
import { service, type SharedTrip } from "@/lib/services";

const STATUS: Record<string, { label: string; cls: string; text: string }> = {
  OPEN: { label: "Group forming", cls: "chip-sun", text: "is waiting for co-travellers to join." },
  CONFIRMED: { label: "Confirmed", cls: "chip-green", text: "has a confirmed group and will meet at the pickup point." },
  IN_TRIP: { label: "On the way", cls: "chip-green", text: "is in the cab right now." },
  COMPLETED: { label: "Completed", cls: "chip-muted", text: "has completed the ride." },
  CANCELLED: { label: "Cancelled", cls: "chip-red", text: "is no longer in this group." },
};

export function SharedTripView() {
  const token = useParams<{ token: string }>().token;
  const [trip, setTrip] = useState<SharedTrip | null>(null);
  const [error, setError] = useState("");
  const [at, setAt] = useState<string>("");

  const load = useCallback(() => {
    service.safety
      .viewShared(token)
      .then((t) => {
        setTrip(t);
        setError("");
        setAt(new Date().toISOString());
      })
      .catch((e) => setError(errorText(e)));
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (error && !trip) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-12">
        <ErrorBox message={error} onRetry={load} />
        <p className="text-sm text-muted">Shared trip links stop working a few hours after the ride, or when the traveller turns them off.</p>
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-12">
        <Skeleton className="h-36" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const st = STATUS[trip.status] ?? STATUS.OPEN;
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="overflow-hidden rounded-3xl bg-band p-6 text-white">
        <p className="text-sm text-white/80">Shared trip</p>
        <h1 className="mt-1 text-2xl font-extrabold">
          {trip.sharer} {st.text}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`chip ${st.cls}`}>{st.label}</span>
          {trip.flightNo && <span className="chip chip-glass">{trip.flightNo}</span>}
          <span className="chip chip-glass">
            {trip.airport.city} {trip.airport.code}
            {trip.terminal ? ` ${trip.terminal}` : ""}
          </span>
        </div>
      </div>

      <div className="card mt-4 divide-y divide-line">
        <div className="flex items-start gap-3 p-4">
          <Icon name="pin" className="mt-0.5 text-primary" />
          <div>
            <p className="text-sm text-muted">Pickup point</p>
            <p className="font-semibold">{trip.pickupPoint}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4">
          <Icon name="clock" className="mt-0.5 text-primary" />
          <div>
            <p className="text-sm text-muted">At pickup</p>
            <p className="font-semibold">
              {fmtDay(trip.windowStart)}, {fmtRange(trip.windowStart, trip.windowEnd)}
            </p>
            {trip.startedAt && <p className="text-sm text-muted">Ride started {fmtTime(trip.startedAt)}</p>}
            {trip.completedAt && <p className="text-sm text-muted">Ride completed {fmtTime(trip.completedAt)}</p>}
          </div>
        </div>
        {trip.destination && (
          <div className="flex items-start gap-3 p-4">
            <Icon name="home" className="mt-0.5 text-primary" />
            <div>
              <p className="text-sm text-muted">{trip.sharer} is going to</p>
              <p className="font-semibold">{trip.destination}</p>
            </div>
          </div>
        )}
      </div>

      <div className="card mt-4 p-4">
        <h2 className="font-semibold">In the group</h2>
        <ul className="mt-3 space-y-3">
          {trip.members.map((m, i) => (
            <li key={i} className="flex items-center gap-3">
              <Avatar name={m.name} size={34} ring={false} />
              <span className="flex-1 text-sm font-semibold">
                {m.name} {m.isSharer && <span className="font-normal text-muted">(shared this)</span>}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted">
                {m.verifiedLevel >= 2 && <Icon name="shield" size={13} className="text-accent" label="Verified" />}
                <Icon name="star" size={13} filled className="text-sun" /> {m.rating.toFixed(1)} &middot; {m.trips} {m.trips === 1 ? "ride" : "rides"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Updates every 30 seconds{at ? `, last at ${fmtTime(at)}` : ""}. Worried? Call {trip.sharer} first, or 112 in an emergency.
      </p>
    </div>
  );
}
