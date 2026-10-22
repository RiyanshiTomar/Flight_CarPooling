"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useLiveEvents } from "@/components/Live";
import { ConfirmDialog } from "@/components/Modal";
import { CardSkeletons, EmptyState, ErrorBox } from "@/components/States";
import { useToast } from "@/components/Toast";
import { errorText, fmtDay, fmtTime } from "@/lib/format";
import { service, type RideRequest, type RideStatus } from "@/lib/services";

const STATUS: Record<RideStatus, { label: string; cls: string }> = {
  PENDING: { label: "Looking for people", cls: "chip-sun" },
  MATCHED: { label: "Group formed", cls: "" },
  CONFIRMED: { label: "Confirmed", cls: "chip-green" },
  IN_TRIP: { label: "On the way", cls: "chip-green" },
  COMPLETED: { label: "Completed", cls: "chip-muted" },
  CANCELLED: { label: "Cancelled", cls: "chip-red" },
  EXPIRED: { label: "Expired", cls: "chip-muted" },
};
const ACTIVE: RideStatus[] = ["PENDING", "MATCHED", "CONFIRMED", "IN_TRIP"];

export default function Trips() {
  const toast = useToast();
  const [rides, setRides] = useState<RideRequest[] | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [error, setError] = useState("");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    service.rides
      .mine()
      .then((r) => {
        setRides(r);
        setError("");
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  useLiveEvents(() => load());

  async function cancel() {
    if (!cancelId) return;
    setBusy(true);
    try {
      await service.rides.cancel(cancelId);
      toast("Ride cancelled. Your group has been told.", "success");
      setCancelId(null);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const upcoming = rides?.filter((r) => ACTIVE.includes(r.status)).sort((a, b) => a.readyAt.localeCompare(b.readyAt)) ?? [];
  const past = rides?.filter((r) => !ACTIVE.includes(r.status)) ?? [];
  const shown = tab === "upcoming" ? upcoming : past;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-brand md:text-3xl">My trips</h1>
        <Link href="/trip/new" className="btn btn-primary btn-sm">
          <Icon name="plus" size={16} /> New trip
        </Link>
      </div>

      <div className="seg mt-5" role="tablist" aria-label="Trips">
        <button role="tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>
          Upcoming {rides ? `(${upcoming.length})` : ""}
        </button>
        <button role="tab" aria-selected={tab === "past"} onClick={() => setTab("past")}>
          Past {rides ? `(${past.length})` : ""}
        </button>
      </div>

      <div className="mt-5" role="tabpanel">
        {error && (
          <div className="mb-4">
            <ErrorBox message={error} onRetry={load} />
          </div>
        )}
        {!rides && !error && <CardSkeletons count={3} label="Loading trips" />}

        {rides && shown.length === 0 && (
          tab === "upcoming" ? (
            <EmptyState icon="plane" title="No upcoming trips" text="Add your next flight and we will find people heading your way." action={{ href: "/trip/new", label: "Find a ride share" }} />
          ) : (
            <EmptyState icon="clock" title="No past trips yet" text="Completed, cancelled and expired rides will show up here." />
          )
        )}

        <ul className="space-y-3">
          {shown.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, cls: "" };
            const active = ACTIVE.includes(r.status);
            const groupHref = r.groupId ? `/group/${r.groupId}` : null;
            return (
              <li key={r.id} className="card overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${active ? "bg-primary text-white" : "bg-surface-2 text-muted"}`}>
                    <Icon name="plane" size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{r.flightNo}</p>
                      <span className={`chip ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted">
                      {fmtDay(r.flightDate)} &middot; ready {fmtTime(r.readyAt)} &middot; to {r.destLabel}
                    </p>
                    {active && r.groupSize != null && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                        <Icon name="users" size={13} />
                        {r.groupSize > 1 ? `${r.groupSize} in your group` : "Waiting for others to join"}
                        {r.pickupPoint ? ` · ${r.pickupPoint}` : ""}
                      </p>
                    )}
                  </div>
                </div>
                {(active || (r.status === "COMPLETED" && groupHref)) && (
                  <div className="flex flex-wrap gap-2 border-t border-line bg-surface-2 px-4 py-3">
                    {groupHref ? (
                      <Link href={groupHref} className="btn btn-primary btn-sm">
                        <Icon name="chat" size={15} /> {r.status === "COMPLETED" ? "Open and rate" : "Group and chat"}
                      </Link>
                    ) : null}
                    {active && (r.groupSize ?? 1) <= 1 && (
                      <Link href={`/matches?request=${r.id}`} className="btn btn-soft btn-sm">
                        <Icon name="search" size={15} /> See matches
                      </Link>
                    )}
                    {active && r.status !== "IN_TRIP" && (
                      <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setCancelId(r.id)}>
                        Cancel ride
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <ConfirmDialog
        open={!!cancelId}
        title="Cancel this ride?"
        text="You will leave your group and your co-travellers will be told. You can add the flight again later."
        confirmLabel="Cancel ride"
        danger
        busy={busy}
        onConfirm={cancel}
        onClose={() => setCancelId(null)}
      />
    </div>
  );
}
