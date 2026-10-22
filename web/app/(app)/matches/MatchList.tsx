"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AvatarStack } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { useLiveEvents } from "@/components/Live";
import { CardSkeletons, EmptyState, ErrorBox, Spinner } from "@/components/States";
import { useToast } from "@/components/Toast";
import { errorText, fmtDay, fmtRange, fmtTime, rupee } from "@/lib/format";
import { service, type RideRequest, type Suggestion } from "@/lib/services";

const REFRESH_MS = 20_000;

function ScoreMeter({ score }: { score: number }) {
  const tone = score >= 80 ? "bg-accent" : score >= 60 ? "bg-primary" : "bg-sun";
  return (
    <div className="flex items-center gap-2" aria-label={`Match ${score} out of 100`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${score}%` }} />
      </span>
      <span className="text-xs font-bold">{score}% match</span>
    </div>
  );
}

export function MatchList() {
  const router = useRouter();
  const toast = useToast();
  const requestId = useSearchParams().get("request");
  const [req, setReq] = useState<RideRequest | null>(null);
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!requestId) return;
    Promise.all([service.rides.mine(), service.rides.suggestions(requestId)])
      .then(([mine, sug]) => {
        const r = mine.find((x) => x.id === requestId) ?? null;
        setReq(r);
        setList(sug);
        setError("");
        // already in a real group (2+ people)? the matches page is done; go to the group
        if (r?.groupId && (r.groupSize ?? 1) > 1) router.replace(`/group/${r.groupId}`);
      })
      .catch((e) => setError(errorText(e)));
  }, [requestId, router]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS); // new groups appear as other travellers add flights
    return () => clearInterval(t);
  }, [load]);

  useLiveEvents((e) => {
    if (e.type === "group.updated" || e.type === "flight.updated") load();
  });

  async function join(groupId: string) {
    if (!requestId) return;
    setBusyId(groupId);
    try {
      await service.groups.join(groupId, requestId);
      toast("You joined the group", "success");
      router.push(`/group/${groupId}`);
    } catch (e) {
      setError(errorText(e));
      setBusyId(null);
      load();
    }
  }

  async function startOwn() {
    if (!requestId) return;
    setBusyId("own");
    try {
      const g = await service.rides.startOwnGroup(requestId);
      router.push(`/group/${g.id}?new=1`);
    } catch (e) {
      setError(errorText(e));
      setBusyId(null);
    }
  }

  if (!requestId) {
    return <EmptyState icon="search" title="No ride selected" text="Start by adding your flight and drop area." action={{ href: "/trip/new", label: "Find my ride" }} />;
  }
  if (error && !list) return <ErrorBox message={error} onRetry={load} />;
  if (!list) return <CardSkeletons count={3} label="Finding your group" />;

  const inactive = req && !["PENDING", "MATCHED"].includes(req.status);

  return (
    <div className="mx-auto max-w-2xl">
      {/* summary */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-4 p-4">
          <span className="relative grid h-12 w-12 shrink-0 place-items-center">
            {!inactive && <span className="pulse-ring absolute inset-0 rounded-full bg-primary/30" />}
            <span className="relative grid h-11 w-11 place-items-center rounded-full bg-primary text-white">
              <Icon name={list.length ? "users" : "search"} size={20} />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold">
              {inactive ? "This ride is closed" : list.length ? `${list.length} ${list.length === 1 ? "group" : "groups"} heading your way` : "You are first on this route"}
            </h1>
            {req && (
              <p className="truncate text-sm text-muted">
                {req.flightNo} &middot; {fmtDay(req.flightDate)} &middot; ready {fmtTime(req.readyAt)} &rarr; {req.destLabel}
              </p>
            )}
          </div>
        </div>
        {!inactive && (
          <p className="flex items-center gap-2 border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted">
            <Icon name="bolt" size={14} className="text-primary" /> This list updates by itself as new travellers add their flights.
          </p>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}

      {!list.length && !inactive && (
        <div className="card mt-5 p-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-soft text-primary">
            <Icon name="users" size={26} />
          </span>
          <h2 className="mt-3 text-lg font-bold">Your group is open</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Nobody else is heading your way yet. Travellers landing near your time can now find and join your group. We will tell you the moment someone does.
          </p>
          {req?.groupId && (
            <Link href={`/group/${req.groupId}`} className="btn btn-primary mt-5">
              Open my group <Icon name="arrow" size={16} />
            </Link>
          )}
        </div>
      )}

      <ul className="mt-5 space-y-4">
        {list.map((s, i) => {
          const g = s.group;
          const saving = Math.max(0, g.soloFare - g.sharedFare);
          return (
            <li key={g.id} className="card fade-up overflow-hidden" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {i === 0 && <span className="chip chip-green">Best match</span>}
                    {g.womenOnly && <span className="chip chip-red">Women-only</span>}
                    <ScoreMeter score={s.score} />
                  </div>
                  <h2 className="mt-2 font-bold">
                    {g.members.length} {g.members.length === 1 ? "traveller" : "travellers"} from {g.terminal ?? "the airport"}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    <Icon name="clock" size={14} /> At pickup {fmtRange(g.windowStart, g.windowEnd)}
                    {s.timeGapMin > 0 && <span className="text-xs">({s.timeGapMin} min from you)</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                    <Icon name="pin" size={14} /> {g.pickupPoint}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted">Your share</p>
                  <p className="text-2xl font-extrabold text-primary">~{rupee(g.sharedFare)}</p>
                  {saving > 0 && <p className="text-xs font-semibold text-accent">save ~{rupee(saving)}</p>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
                <AvatarStack names={g.members.map((m) => m.name)} size={32} />
                <ul className="min-w-0 flex-1 text-sm">
                  {g.members.map((m, j) => (
                    <li key={j} className="flex items-center gap-1.5 text-muted">
                      <b className="font-semibold text-ink">{m.name}</b>
                      {m.verifiedLevel >= 2 && <Icon name="shield" size={13} className="text-accent" label="Verified" />}
                      <span className="inline-flex items-center gap-0.5 text-xs">
                        <Icon name="star" size={12} filled className="text-sun" />
                        {m.rating.toFixed(1)}
                      </span>
                      {m.destLabel && <span className="truncate text-xs">&middot; to {m.destLabel}</span>}
                    </li>
                  ))}
                </ul>
                <span className="chip chip-muted">
                  {g.seatsLeft} {g.seatsLeft === 1 ? "seat" : "seats"} left &middot; ~{s.distanceKm} km apart
                </span>
              </div>

              <div className="border-t border-line bg-surface-2 px-4 py-3">
                <button className="btn btn-primary btn-block" disabled={busyId !== null} onClick={() => join(g.id)}>
                  {busyId === g.id ? <Spinner /> : null} {busyId === g.id ? "Joining..." : "Join this group"} {busyId !== g.id && <Icon name="arrow" size={16} />}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {list.length > 0 && !inactive && (
        <button className="btn btn-ghost btn-block mt-4" disabled={busyId !== null} onClick={startOwn}>
          {busyId === "own" ? "Opening..." : "None of these fit. Start my own group"}
        </button>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        FlyPool only connects travellers. Amounts are rough estimates of your share of one cab, paid directly to the cab you book together.
      </p>
    </div>
  );
}
