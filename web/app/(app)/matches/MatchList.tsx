"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AvatarStack } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { ErrorBox, Loading } from "@/components/States";
import { errorText, fmtRange, rupee } from "@/lib/format";
import { service, type RideRequest, type Suggestion } from "@/lib/services";

export function MatchList() {
  const router = useRouter();
  const requestId = useSearchParams().get("request");
  const [req, setReq] = useState<RideRequest | null>(null);
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!requestId) return;
    setError("");
    try {
      const [mine, sug] = await Promise.all([service.rides.mine(), service.rides.suggestions(requestId)]);
      setReq(mine.find((r) => r.id === requestId) ?? null);
      setList(sug);
    } catch (e) {
      setError(errorText(e));
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  async function join(groupId: string) {
    if (!requestId) return;
    setBusyId(groupId);
    try {
      await service.groups.join(groupId, requestId);
      router.push(`/group/${groupId}`);
    } catch (e) {
      setError(errorText(e));
      setBusyId(null);
    }
  }

  async function startOwn() {
    if (!requestId) return;
    setBusyId("own");
    try {
      const g = await service.rides.startOwnGroup(requestId);
      router.push(`/group/${g.id}`);
    } catch (e) {
      setError(errorText(e));
      setBusyId(null);
    }
  }

  if (!requestId) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-muted">No ride request selected.</p>
        <Link href="/trip/new" className="btn btn-primary mt-4">Find my ride</Link>
      </div>
    );
  }
  if (error && !list) return <div className="mx-auto max-w-2xl"><ErrorBox message={error} onRetry={load} /></div>;
  if (!list) return <Loading text="Finding your group..." />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card flex items-center gap-4 p-4">
        <span className="relative grid h-12 w-12 shrink-0 place-items-center">
          <span className="pulse-ring absolute inset-0 rounded-full bg-primary/30" />
          <span className="relative grid h-10 w-10 place-items-center rounded-full bg-primary text-white">
            <Icon name="search" size={20} />
          </span>
        </span>
        <div className="min-w-0">
          <p className="font-semibold">
            {list.length ? `${list.length} ${list.length === 1 ? "group" : "groups"} found for you` : "You are the first on this route"}
          </p>
          {req && (
            <p className="truncate text-sm text-muted">
              {req.flightNo} &rarr; {req.destLabel}
            </p>
          )}
        </div>
        <Link href="/trip/new" className="btn btn-ghost ml-auto !min-h-9 !px-3 text-sm">Edit</Link>
      </div>

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}

      {!list.length && (
        <div className="card mt-6 p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sky-soft text-brand2"><Icon name="users" /></span>
          <h2 className="mt-3 text-lg font-bold">Your group is open</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            No one else is heading your way yet. We opened a group for you, and travellers on your flight window will be able to join it.
          </p>
          {req?.groupId && (
            <Link href={`/group/${req.groupId}`} className="btn btn-primary mt-4">Open my group <Icon name="arrow" size={16} /></Link>
          )}
        </div>
      )}

      <ul className="mt-5 space-y-4">
        {list.map((s, i) => {
          const g = s.group;
          return (
            <li key={g.id} className="card fade-up overflow-hidden" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{g.members.length} going from T{g.terminal?.replace(/^T/, "") ?? "?"}</h2>
                    {g.womenOnly && <span className="chip chip-red">Women-only</span>}
                    {i === 0 && <span className="chip chip-sun">Best match {s.score}%</span>}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    <Icon name="clock" size={14} /> Ready at pickup {fmtRange(g.windowStart, g.windowEnd)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                    <Icon name="pin" size={14} /> {g.pickupPoint}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted">Approx. share</p>
                  <p className="text-xl font-extrabold text-brand2">~{rupee(g.sharedFare)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
                <AvatarStack names={g.members.map((m) => m.name)} />
                <span className="text-sm text-muted">
                  {g.members.map((m) => m.name).join(", ")} &middot; {g.seatsLeft} {g.seatsLeft === 1 ? "seat" : "seats"} left
                </span>
                <span className="chip ml-auto">Drop areas ~{s.distanceKm} km apart</span>
              </div>

              <div className="border-t border-line bg-bg px-4 py-3">
                <button className="btn btn-primary btn-block" disabled={busyId !== null} onClick={() => join(g.id)}>
                  {busyId === g.id ? "Joining..." : "Join this group"} <Icon name="arrow" size={16} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {list.length > 0 && (
        <button className="btn btn-ghost btn-block mt-4" disabled={busyId !== null} onClick={startOwn}>
          {busyId === "own" ? "Opening..." : "None of these. Start my own group"}
        </button>
      )}

      <p className="mt-4 text-center text-xs text-muted">
        FlyPool only connects travellers. We do not book cabs or collect any money. The amount is a rough estimate of your share
        of a cab fare, which you pay directly to the cab you book together.
      </p>
    </div>
  );
}
