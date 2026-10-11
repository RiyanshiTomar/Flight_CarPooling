"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { ErrorBox, Loading } from "@/components/States";
import { errorText, fmtRange, fmtTime, rupee } from "@/lib/format";
import { service, type Group, type Message } from "@/lib/services";

const POLL_MS = 4000;

export function GroupView() {
  const id = useParams<{ id: string }>().id;
  const [group, setGroup] = useState<Group | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadGroup = useCallback(async () => {
    try {
      setGroup(await service.groups.get(id));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  // load once, then poll chat + group (Phase 3 swaps polling for WebSocket push)
  useEffect(() => {
    loadGroup();
    const tick = () => service.groups.messages(id).then(setMsgs).catch(() => {});
    tick();
    const t = setInterval(() => { tick(); loadGroup(); }, POLL_MS);
    return () => clearInterval(t);
  }, [id, loadGroup]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      const m = await service.groups.send(id, body);
      setMsgs((cur) => [...cur, m]);
    } catch (err) {
      setError(errorText(err));
      setText(body);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      setGroup(await service.groups.confirm(id));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!group) return error ? <div className="mx-auto max-w-xl"><ErrorBox message={error} onRetry={loadGroup} /></div> : <Loading />;

  const you = group.members.find((m) => m.isYou);
  const waiting = group.members.filter((m) => !m.confirmed).length;

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* chat */}
      <section className="card flex h-[calc(100dvh-13rem)] min-h-96 min-w-0 flex-col overflow-hidden lg:order-1 lg:h-[34rem]">
        <header className="flex items-center gap-3 border-b border-line p-3">
          <Link href="/trips" className="btn btn-ghost !min-h-9 !w-9 !px-0 lg:hidden" aria-label="Back to my trips">
            <Icon name="back" size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-semibold">Group chat</h1>
            <p className="truncate text-xs text-muted">{group.members.length} {group.members.length === 1 ? "member" : "members"} &middot; {group.pickupPoint}</p>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-live="polite">
          <p className="mx-auto max-w-full rounded-full bg-sky-soft px-3 py-1 text-center text-xs text-brand2">
            Chat is private to this group. Never share OTPs or payment details.
          </p>
          {msgs.length === 0 && <p className="py-8 text-center text-sm text-muted">No messages yet. Say hi and share where you will wait.</p>}
          {msgs.map((m) => (
            <div key={m.id} className={`flex items-end gap-2 ${m.mine ? "justify-end" : ""}`}>
              {!m.mine && <Avatar name={m.sender} size={28} />}
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm bg-bg"}`}>
                {!m.mine && <p className="text-[11px] font-semibold text-muted">{m.sender}</p>}
                <p className="break-words">{m.body}</p>
                <p className={`mt-0.5 text-[10px] ${m.mine ? "text-white/70" : "text-muted"}`}>{fmtTime(m.at)}</p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
          <input className="input" placeholder="Message the group" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Message" />
          <button className="btn btn-primary !w-12 !px-0" aria-label="Send" disabled={!text.trim()}>
            <Icon name="send" size={18} />
          </button>
        </form>
      </section>

      {/* side panel */}
      <aside className="min-w-0 space-y-4 lg:order-2">
        {error && <ErrorBox message={error} />}

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Pickup</h2>
            <span className={`chip ${group.status === "CONFIRMED" ? "chip-green" : "chip-sun"}`}>
              {group.status === "CONFIRMED" ? "Confirmed" : "Open"}
            </span>
          </div>
          <p className="mt-2 flex items-center gap-2 text-sm"><Icon name="pin" size={16} /> {group.pickupPoint}</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted"><Icon name="clock" size={16} /> Ready at pickup {fmtRange(group.windowStart, group.windowEnd)}</p>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold">Estimated cab cost split</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-brand2">~{rupee(group.sharedFare)}</span>
            <span className="text-sm text-muted">per person</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            A rough guess. Riding alone would be about {rupee(group.soloFare)}. FlyPool does not book cabs or take any money. Book a cab
            (Uber, Ola or a prepaid taxi) together and split the fare among yourselves.
          </p>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold">Travellers</h2>
          <ul className="mt-3 space-y-3">
            {group.members.map((m, i) => (
              <li key={`${m.name}-${i}`} className="flex items-center gap-3">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {m.name}{m.isYou && " (you)"}
                    {m.verifiedLevel >= 2 && <Icon name="shield" size={14} className="text-accent" />}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.flightNo ? `${m.flightNo} · ` : ""}{m.destLabel ?? ""}{m.confirmed ? " · confirmed" : ""}
                  </p>
                </div>
                <span className="flex items-center gap-0.5 text-xs font-semibold"><Icon name="star" size={13} className="text-sun" />{m.rating.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </div>

        {you && !you.confirmed && (
          <button className="btn btn-primary btn-block !min-h-12" onClick={confirm} disabled={busy}>
            {busy ? "Confirming..." : "Confirm I am going"} <Icon name="check" size={18} />
          </button>
        )}
        {you?.confirmed && group.status !== "CONFIRMED" && (
          <div className="card flex items-center gap-3 border-accent p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white"><Icon name="check" /></span>
            <div>
              <p className="font-semibold">You are confirmed</p>
              <p className="text-xs text-muted">
                {group.members.length < 2 ? "Waiting for someone to join." : `Waiting for ${waiting} more to confirm.`}
              </p>
            </div>
          </div>
        )}
        {group.status === "CONFIRMED" && (
          <div className="card border-accent p-4 text-sm">
            <p className="font-semibold text-accent">Everyone is confirmed</p>
            <p className="mt-1 text-muted">Meet at {group.pickupPoint}, then book your cab together.</p>
          </div>
        )}
        <Link href="/safety" className="btn btn-ghost btn-block">
          <Icon name="shield" size={18} /> Safety options
        </Link>
      </aside>
    </div>
  );
}
