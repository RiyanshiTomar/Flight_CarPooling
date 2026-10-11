"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { ErrorBox, Loading } from "@/components/States";
import { errorText, fmtTime } from "@/lib/format";
import { service, type RideRequest } from "@/lib/services";

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Waiting for a match", cls: "chip-sun" },
  MATCHED: { label: "Group formed", cls: "" },
  CONFIRMED: { label: "Confirmed", cls: "chip-green" },
  CANCELLED: { label: "Cancelled", cls: "chip-red" },
  COMPLETED: { label: "Completed", cls: "chip-green" },
  EXPIRED: { label: "Expired", cls: "chip-red" },
};

export default function Trips() {
  const [rides, setRides] = useState<RideRequest[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    service.rides.mine().then(setRides).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  async function cancel(id: string) {
    if (!window.confirm("Cancel this request? You will leave your group.")) return;
    setBusy(id);
    try {
      await service.rides.cancel(id);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">My trips</h1>
        <Link href="/trip/new" className="btn btn-primary !min-h-10">New trip</Link>
      </div>

      {error && <div className="mt-4"><ErrorBox message={error} onRetry={load} /></div>}
      {!rides && !error && <Loading />}

      {rides && rides.length === 0 && (
        <div className="card mt-6 p-8 text-center">
          <Icon name="plane" size={28} className="mx-auto text-brand2" />
          <p className="mt-3 font-semibold">No trips yet</p>
          <p className="text-sm text-muted">Add your flight to find people heading your way.</p>
        </div>
      )}

      <ul className="mt-5 space-y-3">
        {rides?.map((r) => {
          const st = STATUS[r.status] ?? { label: r.status, cls: "" };
          const active = !["CANCELLED", "EXPIRED", "COMPLETED"].includes(r.status);
          return (
            <li key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.flightNo} &middot; {r.flightDate}</p>
                  <p className="truncate text-sm text-muted">To {r.destLabel} &middot; ready at pickup {fmtTime(r.readyAt)}</p>
                </div>
                <span className={`chip shrink-0 ${st.cls}`}>{st.label}</span>
              </div>
              {active && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.groupId ? (
                    <Link href={`/group/${r.groupId}`} className="btn btn-primary !min-h-10"><Icon name="chat" size={16} /> Group and chat</Link>
                  ) : (
                    <Link href={`/matches?request=${r.id}`} className="btn btn-primary !min-h-10"><Icon name="search" size={16} /> See matches</Link>
                  )}
                  <button className="btn btn-ghost !min-h-10" disabled={busy === r.id} onClick={() => cancel(r.id)}>Cancel</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
