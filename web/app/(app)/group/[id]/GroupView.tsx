"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { useLiveEvents, useLiveStatus } from "@/components/Live";
import { ConfirmDialog, Modal } from "@/components/Modal";
import { StarPicker } from "@/components/Stars";
import { ErrorBox, Skeleton, Spinner } from "@/components/States";
import { useToast } from "@/components/Toast";
import { errorText, fmtRange, fmtTime, rupee } from "@/lib/format";
import { service, type Group, type Message, type ReportReason, type Traveller } from "@/lib/services";

const FALLBACK_POLL_MS = 15_000; // only when the live connection is down

const STEPS: { key: Group["status"]; label: string; icon: IconName }[] = [
  { key: "OPEN", label: "Forming", icon: "users" },
  { key: "CONFIRMED", label: "Confirmed", icon: "check" },
  { key: "IN_TRIP", label: "On the way", icon: "car" },
  { key: "COMPLETED", label: "Done", icon: "flagDone" },
];

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "no_show", label: "Did not show up" },
  { value: "rude", label: "Rude or disrespectful" },
  { value: "unsafe", label: "Made me feel unsafe" },
  { value: "harassment", label: "Harassment" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "payment", label: "Fare split problem" },
  { value: "other", label: "Something else" },
];

function StatusSteps({ status }: { status: Group["status"] }) {
  const idx = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Trip progress">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const now = i === idx;
        return (
          <li key={s.key} className="flex flex-col items-center gap-1.5 text-center" aria-current={now ? "step" : undefined}>
            <span className="relative flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done || now ? "bg-primary" : "bg-line"}`} />
              <span
                className={`grid h-8 w-8 place-items-center rounded-full border-2 ${
                  now ? "border-primary bg-primary text-white" : done ? "border-primary bg-sky-soft text-primary" : "border-line bg-surface text-muted"
                }`}
              >
                <Icon name={done ? "check" : s.icon} size={15} />
              </span>
              <span className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? "opacity-0" : done ? "bg-primary" : "bg-line"}`} />
            </span>
            <span className={`text-[11px] font-semibold ${now ? "text-primary" : "text-muted"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function GroupView() {
  const id = useParams<{ id: string }>().id;
  // a fresh instance per group, so nothing from the previous group leaks in after "leave"
  return <GroupScreen key={id} id={id} />;
}

function GroupScreen({ id }: { id: string }) {
  const isNew = useSearchParams().get("new") === "1";
  const router = useRouter();
  const toast = useToast();
  const liveStatus = useLiveStatus();

  const [group, setGroup] = useState<Group | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "leave" | "pickup" | "rate" | "start" | "complete">(null);
  const [reportFor, setReportFor] = useState<Traveller | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | undefined>(undefined);

  const loadGroup = useCallback(() => {
    service.groups
      .get(id)
      .then((g) => {
        setGroup(g);
        setError("");
      })
      .catch((e) => setError(errorText(e)));
  }, [id]);

  const loadMessages = useCallback(() => {
    service.groups
      .messages(id, lastAt.current)
      .then((fresh) => {
        if (!fresh.length) return;
        setMsgs((cur) => {
          const seen = new Set(cur.map((m) => m.id));
          const merged = [...cur, ...fresh.filter((m) => !seen.has(m.id))];
          return merged;
        });
        lastAt.current = fresh[fresh.length - 1].at;
      })
      .catch(() => {
        /* the next event or poll retries */
      });
  }, [id]);

  useEffect(() => {
    loadGroup();
    loadMessages();
  }, [loadGroup, loadMessages]);

  // live updates; a slow poll only while the live connection is down
  useLiveEvents((e) => {
    if (e.groupId !== id && e.type !== "flight.updated") return;
    if (e.type === "message.created") loadMessages();
    else loadGroup();
  });
  useEffect(() => {
    if (liveStatus === "live") return;
    const t = setInterval(() => {
      loadGroup();
      loadMessages();
    }, FALLBACK_POLL_MS);
    return () => clearInterval(t);
  }, [liveStatus, loadGroup, loadMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs.length]);

  async function act(key: string, fn: () => Promise<Group | void>, ok?: string) {
    setBusy(key);
    setError("");
    try {
      const g = await fn();
      if (g) setGroup(g);
      if (ok) toast(ok, "success");
      loadMessages();
      setDialog(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      const m = await service.groups.send(id, body);
      setMsgs((cur) => [...cur, m]);
      lastAt.current = m.at;
    } catch (err) {
      toast(errorText(err), "error");
      setText(body);
    }
  }

  async function shareTrip() {
    try {
      const link = await service.safety.share(id);
      const data = { title: "My FlyPool ride", text: "Follow my airport cab share on FlyPool", url: link.url };
      if (typeof navigator.share === "function") {
        await navigator.share(data).catch(() => {});
      } else {
        await navigator.clipboard.writeText(link.url);
        toast("Trip link copied. Send it to family.", "success");
      }
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  async function leave() {
    setBusy("leave");
    try {
      const r = await service.groups.leave(id);
      toast("You left the group. You can still find another.", "success");
      router.replace(`/group/${r.newGroupId}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
      setDialog(null);
    }
  }

  if (!group) {
    return error ? (
      <div className="mx-auto max-w-xl space-y-4">
        <ErrorBox message={error} onRetry={loadGroup} />
        <Link href="/trips" className="btn btn-ghost">
          <Icon name="back" size={16} /> My trips
        </Link>
      </div>
    ) : (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[30rem]" />
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const you = group.members.find((m) => m.isYou);
  const others = group.members.filter((m) => !m.isYou);
  const waiting = group.members.filter((m) => !m.confirmed).length;
  const editable = group.status === "OPEN" || group.status === "CONFIRMED";
  const toRate = others.filter((m) => !m.ratedByYou);
  const saving = Math.max(0, group.soloFare - group.sharedFare);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ---------- left: status + chat ---------- */}
      <div className="min-w-0 space-y-4">
        <div className="card p-4">
          <div className="mb-4 flex items-center gap-2">
            <Link href="/trips" className="btn btn-ghost btn-icon !min-h-9 !w-9" aria-label="Back to my trips">
              <Icon name="back" size={18} />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-bold">
                {group.members.length === 1 ? "Your group (waiting for others)" : `Group of ${group.members.length}`}
                {group.womenOnly && <span className="chip chip-red ml-2 align-middle">Women-only</span>}
              </h1>
              <p className="truncate text-xs text-muted">At pickup {fmtRange(group.windowStart, group.windowEnd)}</p>
            </div>
          </div>
          {group.status === "CANCELLED" ? (
            <p className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">This group was cancelled.</p>
          ) : (
            <StatusSteps status={group.status} />
          )}
        </div>

        {isNew && group.members.length === 1 && group.status === "OPEN" && (
          <div className="card flex items-start gap-3 border-primary/30 bg-sky-soft p-4">
            <Icon name="info" className="mt-0.5 text-primary" />
            <p className="text-sm">
              <b>Your group is open.</b> Travellers landing near your time and heading your way can now join. You will get a live update
              the moment someone does. Keep this page or the app open.
            </p>
          </div>
        )}

        <section className="card flex h-[calc(100dvh-20rem)] min-h-[26rem] flex-col overflow-hidden lg:h-[34rem]" aria-label="Group chat">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <Icon name="chat" size={18} className="text-primary" /> Group chat
            </h2>
            <span className="text-xs text-muted">{liveStatus === "live" ? "Live" : "Updating every 15s"}</span>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-surface-2 p-4" role="log" aria-live="polite" aria-label="Messages">
            <p className="mx-auto w-fit max-w-full rounded-full bg-sky-soft px-3 py-1 text-center text-xs font-medium text-primary">
              <Icon name="lock" size={12} className="mr-1 inline" />
              Private to this group. Never share OTPs or payment details.
            </p>
            {msgs.length === 0 && <p className="py-8 text-center text-sm text-muted">No messages yet. Say hi and tell everyone where you will wait.</p>}
            {msgs.map((m) =>
              m.system ? (
                <p key={m.id} className="mx-auto w-fit max-w-[90%] rounded-xl bg-surface px-3 py-1.5 text-center text-xs text-muted shadow-sm">
                  {m.body} <span className="opacity-60">&middot; {fmtTime(m.at)}</span>
                </p>
              ) : (
                <div key={m.id} className={`flex items-end gap-2 ${m.mine ? "justify-end" : ""}`}>
                  {!m.mine && <Avatar name={m.sender} size={28} ring={false} />}
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.mine ? "rounded-br-md bg-primary text-[var(--primary-ink)]" : "rounded-bl-md bg-surface"}`}>
                    {!m.mine && <p className="text-[11px] font-bold text-primary">{m.sender}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`mt-0.5 text-right text-[10px] ${m.mine ? "opacity-70" : "text-muted"}`}>{fmtTime(m.at)}</p>
                  </div>
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>

          {group.status !== "CANCELLED" && (
            <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
              <input
                className="input"
                placeholder="Message the group"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={1000}
                aria-label="Message"
                enterKeyHint="send"
              />
              <button className="btn btn-primary btn-icon !h-12 !w-12 shrink-0" aria-label="Send" disabled={!text.trim()}>
                <Icon name="send" size={18} />
              </button>
            </form>
          )}
        </section>
      </div>

      {/* ---------- right: details + actions ---------- */}
      <aside className="min-w-0 space-y-4">
        {error && <ErrorBox message={error} />}

        {/* primary action for this stage */}
        {group.status === "OPEN" && you && !you.confirmed && (
          <button className="btn btn-primary btn-block !min-h-13" onClick={() => act("confirm", () => service.groups.confirm(id), "You confirmed")} disabled={!!busy}>
            {busy === "confirm" ? <Spinner /> : <Icon name="check" size={18} />} Confirm I am going
          </button>
        )}
        {group.status === "OPEN" && you?.confirmed && (
          <div className="card flex items-center gap-3 border-accent/40 p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white">
              <Icon name="check" />
            </span>
            <div>
              <p className="font-semibold">You are confirmed</p>
              <p className="text-xs text-muted">{group.members.length < 2 ? "Waiting for someone to join." : `Waiting for ${waiting} more to confirm.`}</p>
            </div>
          </div>
        )}
        {group.status === "CONFIRMED" && (
          <div className="card space-y-3 border-accent/40 p-4">
            <p className="flex items-center gap-2 font-semibold text-accent">
              <Icon name="check" size={18} /> Everyone is confirmed
            </p>
            <p className="text-sm text-muted">Meet at {group.pickupPoint}, book one cab together, then tap start.</p>
            <button className="btn btn-primary btn-block" onClick={() => setDialog("start")} disabled={!!busy}>
              <Icon name="play" size={16} /> We are in the cab
            </button>
          </div>
        )}
        {group.status === "IN_TRIP" && (
          <div className="card space-y-3 p-4">
            <p className="flex items-center gap-2 font-semibold text-primary">
              <Icon name="car" size={18} /> Ride in progress
            </p>
            <p className="text-sm text-muted">Share your trip with family. Tap below when everyone is dropped.</p>
            <button className="btn btn-primary btn-block" onClick={() => setDialog("complete")} disabled={!!busy}>
              <Icon name="flagDone" size={16} /> Ride completed
            </button>
          </div>
        )}
        {group.status === "COMPLETED" && (
          <div className="card space-y-3 p-4">
            <p className="flex items-center gap-2 font-semibold text-accent">
              <Icon name="flagDone" size={18} /> Ride completed
            </p>
            {saving > 0 && <p className="text-sm text-muted">You saved about {rupee(saving)} compared with riding alone.</p>}
            {toRate.length > 0 ? (
              <button className="btn btn-primary btn-block" onClick={() => setDialog("rate")}>
                <Icon name="star" size={16} /> Rate co-travellers
              </button>
            ) : (
              <p className="text-sm font-semibold text-muted">Thanks for rating your group.</p>
            )}
          </div>
        )}

        {/* pickup + fare */}
        <div className="card divide-y divide-line">
          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted">Pickup point</h2>
              {editable && (
                <button className="btn btn-ghost btn-sm !min-h-8" onClick={() => setDialog("pickup")}>
                  <Icon name="edit" size={14} /> Change
                </button>
              )}
            </div>
            <p className="mt-1 flex items-start gap-2 font-semibold">
              <Icon name="pin" size={18} className="mt-0.5 text-primary" /> {group.pickupPoint}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              <Icon name="clock" size={16} /> {fmtRange(group.windowStart, group.windowEnd)}
            </p>
          </div>
          <div className="p-4">
            <h2 className="text-sm font-semibold text-muted">Estimated share per person</h2>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-primary">~{rupee(group.sharedFare)}</span>
              {saving > 0 && <span className="chip chip-green">save ~{rupee(saving)}</span>}
            </div>
            <p className="mt-1 text-xs text-muted">
              Alone about {rupee(group.soloFare)}. FlyPool does not book cabs or take money: book one together (Uber, Ola, prepaid taxi) and split it.
            </p>
          </div>
        </div>

        {/* members */}
        <div className="card p-4">
          <h2 className="font-semibold">Travellers</h2>
          <ul className="mt-3 space-y-3">
            {group.members.map((m, i) => (
              <li key={m.memberId ?? i} className="relative flex items-center gap-3">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {m.name}
                    {m.isYou && <span className="text-muted">(you)</span>}
                    {m.verifiedLevel >= 2 && <Icon name="shield" size={14} className="text-accent" label="ID verified" />}
                    {m.confirmed && group.status === "OPEN" && <span className="chip chip-green !py-0.5 !text-[10px]">Confirmed</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {[m.flightNo, m.destLabel, m.readyAt ? `ready ${fmtTime(m.readyAt)}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="flex items-center gap-0.5 text-xs font-semibold">
                  <Icon name="star" size={13} filled className="text-sun" />
                  {m.rating.toFixed(1)}
                </span>
                {!m.isYou && m.memberId && (
                  <>
                    <button
                      className="btn btn-ghost btn-icon !min-h-8 !w-8 !border-transparent"
                      aria-label={`More options for ${m.name}`}
                      aria-expanded={menuFor === m.memberId}
                      onClick={() => setMenuFor(menuFor === m.memberId ? null : m.memberId!)}
                    >
                      <Icon name="more" size={16} />
                    </button>
                    {menuFor === m.memberId && (
                      <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lg)]" role="menu">
                        <button
                          role="menuitem"
                          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-sky-soft"
                          onClick={() => {
                            setMenuFor(null);
                            setReportFor(m);
                          }}
                        >
                          <Icon name="flag" size={16} /> Report {m.name}
                        </button>
                        <button
                          role="menuitem"
                          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-danger hover:bg-danger-soft"
                          onClick={async () => {
                            setMenuFor(null);
                            try {
                              await service.safety.block(id, m.memberId!);
                              toast(`${m.name} is blocked. You will not be matched again.`, "success");
                            } catch (e) {
                              toast(errorText(e), "error");
                            }
                          }}
                        >
                          <Icon name="ban" size={16} /> Block {m.name}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* safety + exit */}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-soft" onClick={shareTrip}>
            <Icon name="share" size={16} /> Share trip
          </button>
          <Link href={`/safety?group=${id}`} className="btn btn-danger-ghost">
            <Icon name="alert" size={16} /> SOS
          </Link>
        </div>
        {editable && (
          <button className="btn btn-ghost btn-block text-muted" onClick={() => setDialog("leave")}>
            <Icon name="logout" size={16} /> Leave this group
          </button>
        )}
      </aside>

      {/* ---------- dialogs ---------- */}
      <ConfirmDialog
        open={dialog === "leave"}
        title="Leave this group?"
        text="Your ride request stays active and you get a fresh group of your own, so others can still find you. The group will be told."
        confirmLabel="Leave group"
        danger
        busy={busy === "leave"}
        onConfirm={leave}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "start"}
        title="Start the ride?"
        text="Tap this once your whole group is in the cab. Everyone gets a message, and family with your trip link sees you are on the way."
        confirmLabel="Start ride"
        busy={busy === "start"}
        onConfirm={() => act("start", () => service.groups.start(id), "Ride started. Have a safe trip!")}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "complete"}
        title="Mark the ride as completed?"
        text="Do this when everyone has been dropped. You can then rate your co-travellers."
        confirmLabel="Ride completed"
        busy={busy === "complete"}
        onConfirm={() => act("complete", () => service.groups.complete(id), "Ride completed")}
        onClose={() => setDialog(null)}
      />
      <PickupDialog
        key={dialog === "pickup" ? "pickup-open" : "pickup-closed"}
        open={dialog === "pickup"}
        current={group.pickupPoint}
        terminal={group.terminal}
        busy={busy === "pickup"}
        onClose={() => setDialog(null)}
        onSave={(p) => act("pickup", () => service.groups.setPickup(id, p), "Pickup point updated")}
      />
      <RateDialog
        open={dialog === "rate"}
        members={toRate}
        busy={busy === "rate"}
        onClose={() => setDialog(null)}
        onSave={(ratings) => act("rate", () => service.groups.rate(id, ratings), "Thanks! Ratings keep FlyPool safe.")}
      />
      <ReportDialog
        key={reportFor?.memberId ?? "report-closed"}
        member={reportFor}
        onClose={() => setReportFor(null)}
        onSubmit={async (reason, details, block) => {
          if (!reportFor?.memberId) return;
          await service.safety.report({ groupId: id, memberId: reportFor.memberId, reason, details, block });
          toast(block ? `Reported and blocked ${reportFor.name}` : "Report sent. Our team will review it.", "success");
          setReportFor(null);
        }}
      />
    </div>
  );
}

function PickupDialog({
  open,
  current,
  terminal,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  current: string;
  terminal: string | null;
  busy: boolean;
  onClose: () => void;
  onSave: (p: string) => void;
}) {
  const [value, setValue] = useState(current);
  const t = terminal ?? "T1";
  const ideas = [`${t} Arrivals, Pillar 6`, `${t} Arrivals, Gate 4`, `${t} Prepaid taxi counter`, `${t} App cab pickup zone`];
  const ok = value.trim().length >= 3 && value.trim().length <= 80;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change pickup point"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!ok || busy || value.trim() === current} onClick={() => onSave(value.trim())}>
            {busy ? "Saving..." : "Save and tell the group"}
          </button>
        </>
      }
    >
      <label className="label" htmlFor="pickup">
        Where should everyone meet?
      </label>
      <input id="pickup" className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} />
      <div className="mt-3 flex flex-wrap gap-2">
        {ideas.map((i) => (
          <button key={i} type="button" className="chip hover:bg-lavender" onClick={() => setValue(i)}>
            {i}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function RateDialog({
  open,
  members,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  members: Traveller[];
  busy: boolean;
  onClose: () => void;
  onSave: (r: { memberId: string; score: number; comment?: string }[]) => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const rated = members.filter((m) => m.memberId && scores[m.memberId]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How was the ride?"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Later
          </button>
          <button
            className="btn btn-primary"
            disabled={!rated.length || busy}
            onClick={() => onSave(rated.map((m) => ({ memberId: m.memberId!, score: scores[m.memberId!], comment: notes[m.memberId!] || undefined })))}
          >
            {busy ? "Sending..." : "Send ratings"}
          </button>
        </>
      }
    >
      <ul className="space-y-5">
        {members.map((m) => (
          <li key={m.memberId}>
            <div className="flex items-center gap-2">
              <Avatar name={m.name} size={30} ring={false} />
              <span className="font-semibold">{m.name}</span>
            </div>
            <div className="mt-2">
              <StarPicker label={`Rate ${m.name}`} value={scores[m.memberId!] ?? 0} onChange={(v) => setScores((s) => ({ ...s, [m.memberId!]: v }))} />
            </div>
            {scores[m.memberId!] > 0 && (
              <input
                className="input mt-2 !min-h-11"
                placeholder="Anything to add? (optional)"
                maxLength={300}
                value={notes[m.memberId!] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [m.memberId!]: e.target.value }))}
                aria-label={`Comment for ${m.name}`}
              />
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">Ratings are anonymous. Only the average is shown.</p>
    </Modal>
  );
}

function ReportDialog({
  member,
  onClose,
  onSubmit,
}: {
  member: Traveller | null;
  onClose: () => void;
  onSubmit: (reason: ReportReason, details: string, block: boolean) => Promise<void>;
}) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title={`Report ${member?.name ?? ""}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            disabled={!reason || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onSubmit(reason as ReportReason, details.trim(), block);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Sending..." : "Send report"}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">Reports are private. {member?.name} will not know who reported them. If you are in danger, call 112 now.</p>
      <fieldset className="mt-4">
        <legend className="label">What happened?</legend>
        <div className="grid gap-2">
          {REASONS.map((r) => (
            <label key={r.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${reason === r.value ? "border-primary bg-sky-soft" : "border-line"}`}>
              <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="h-4 w-4 accent-[var(--primary)]" />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="label mt-4" htmlFor="rep-details">
        Details (optional)
      </label>
      <textarea id="rep-details" className="input" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      <label className="mt-3 flex items-center gap-3 text-sm">
        <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />
        Also block {member?.name} so we never match you again
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
