"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { ConfirmDialog, Modal } from "@/components/Modal";
import { ErrorBox, Skeleton, Spinner } from "@/components/States";
import { useToast } from "@/components/Toast";
import { errorText, rupee } from "@/lib/format";
import { service, type BlockedUser, type Gender, type User, type UserStats } from "@/lib/services";

export default function Profile() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "logout" | "delete">(null);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(() => {
    service.me
      .get()
      .then((u) => {
        setUser(u);
        setName(u.name ?? "");
        setGender(u.gender ?? "");
        setCName(u.trustedContactName ?? "");
        setCPhone(u.trustedContactPhone?.replace(/^\+91/, "") ?? "");
      })
      .catch((e) => setError(errorText(e)));
    service.me.stats().then(setStats).catch(() => {});
    service.safety.blocks().then(setBlocks).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setBusy("details");
    setError("");
    try {
      const patch: { name?: string; gender?: Gender } = {};
      if (name.trim()) patch.name = name.trim();
      if (gender) patch.gender = gender;
      setUser(await service.me.update(patch));
      toast("Profile saved", "success");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    setBusy("contact");
    setError("");
    try {
      setUser(await service.me.update({ trustedContactName: cName.trim(), trustedContactPhone: cPhone.replace(/\D/g, "") }));
      toast(cPhone ? "Trusted contact saved" : "Trusted contact removed", "success");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function unblock(b: BlockedUser) {
    try {
      await service.safety.unblock(b.id);
      setBlocks((cur) => cur.filter((x) => x.id !== b.id));
      toast(`${b.name} unblocked`, "success");
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  async function logout() {
    setBusy("logout");
    await service.auth.logout();
    router.replace("/");
  }

  async function deleteAccount() {
    setBusy("delete");
    try {
      await service.me.deleteAccount();
      router.replace("/?deleted=1");
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
      setDialog(null);
    }
  }

  if (!user) {
    return error ? (
      <ErrorBox message={error} onRetry={load} />
    ) : (
      <div className="mx-auto max-w-xl space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const tiles: { icon: IconName; label: string; value: string }[] = [
    { icon: "car", label: "Rides shared", value: String(stats?.tripsCompleted ?? user.trips) },
    { icon: "wallet", label: "Saved (approx.)", value: rupee(stats?.savedApprox ?? 0) },
    { icon: "star", label: `Rating${user.ratingCount ? ` (${user.ratingCount})` : ""}`, value: user.rating.toFixed(1) },
    { icon: "users", label: "People met", value: String(stats?.coTravellers ?? 0) },
  ];
  const phoneOk = cPhone === "" || /^[6-9]\d{9}$/.test(cPhone);

  return (
    <div className="mx-auto max-w-xl">
      <div className="card flex items-center gap-4 overflow-hidden p-5">
        <Avatar name={user.name ?? "?"} size={64} ring={false} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold text-brand">{user.name ?? "Add your name"}</h1>
          <p className="text-sm text-muted">{user.phone.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2")}</p>
          <span className="chip chip-green mt-1.5">
            <Icon name="shield" size={13} /> Phone verified
          </span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((s) => (
          <div key={s.label} className="card p-4">
            <Icon name={s.icon} size={18} className="text-primary" />
            <dd className="mt-2 text-xl font-extrabold">{s.value}</dd>
            <dt className="text-xs text-muted">{s.label}</dt>
          </div>
        ))}
      </dl>

      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}

      <form onSubmit={saveDetails} className="card mt-4 space-y-4 p-5">
        <h2 className="font-bold">Your details</h2>
        <div>
          <label className="label" htmlFor="n">
            Name
          </label>
          <input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} />
          <p className="hint">Co-travellers see only your first name.</p>
        </div>
        <fieldset>
          <legend className="label">Gender</legend>
          <div className="seg">
            {(["female", "male", "other"] as Gender[]).map((g) => (
              <button key={g} type="button" aria-pressed={gender === g} onClick={() => setGender(g)} className="capitalize">
                {g}
              </button>
            ))}
          </div>
          <p className="hint">Used only for women-only groups. Never shown to others.</p>
        </fieldset>
        <button className="btn btn-primary" disabled={busy === "details"}>
          {busy === "details" ? <Spinner /> : null} Save details
        </button>
      </form>

      <form onSubmit={saveContact} className="card mt-4 space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
            <Icon name="phone" size={18} />
          </span>
          <div>
            <h2 className="font-bold">Trusted contact</h2>
            <p className="text-sm text-muted">We text this person your location and trip link if you press SOS.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cn">
              Their name
            </label>
            <input id="cn" className="input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Mom" maxLength={60} />
          </div>
          <div>
            <label className="label" htmlFor="cp">
              Their mobile
            </label>
            <input
              id="cp"
              className="input"
              inputMode="numeric"
              value={cPhone}
              onChange={(e) => setCPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="98765 43210"
              aria-invalid={!phoneOk}
            />
          </div>
        </div>
        {!phoneOk && <p className="text-sm text-danger">Enter a 10-digit Indian mobile number.</p>}
        <button className="btn btn-primary" disabled={busy === "contact" || !phoneOk}>
          {busy === "contact" ? <Spinner /> : null} Save contact
        </button>
      </form>

      <div className="card mt-4 p-5">
        <h2 className="font-bold">Blocked travellers</h2>
        {blocks.length === 0 ? (
          <p className="mt-1 text-sm text-muted">You have not blocked anyone. Block someone from a group&apos;s traveller list.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={b.name} size={32} ring={false} />
                <span className="flex-1 text-sm font-semibold">{b.name}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => unblock(b)}>
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card mt-4 p-5">
        <h2 className="font-bold">Get verified</h2>
        <p className="mt-1 text-sm text-muted">Verified travellers are trusted more by their group.</p>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <Icon name="check" size={16} className="text-accent" /> Phone number
          </li>
          <li className="flex items-center gap-2 text-muted">
            <Icon name="clock" size={16} /> Government ID (coming soon)
          </li>
          <li className="flex items-center gap-2 text-muted">
            <Icon name="clock" size={16} /> Selfie check (coming soon)
          </li>
        </ul>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <button className="btn btn-ghost" onClick={() => setDialog("logout")}>
          <Icon name="logout" size={16} /> Log out
        </button>
        <button className="btn btn-danger-ghost" onClick={() => setDialog("delete")}>
          <Icon name="trash" size={16} /> Delete account
        </button>
      </div>

      <ConfirmDialog
        open={dialog === "logout"}
        title="Log out?"
        text="You will need an OTP to log in again."
        confirmLabel="Log out"
        busy={busy === "logout"}
        onConfirm={logout}
        onClose={() => setDialog(null)}
      />
      <Modal
        open={dialog === "delete"}
        onClose={() => {
          setDialog(null);
          setConfirmText("");
        }}
        title="Delete your account?"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDialog(null)}>
              Keep my account
            </button>
            <button className="btn btn-danger" disabled={confirmText !== "DELETE" || busy === "delete"} onClick={deleteAccount}>
              {busy === "delete" ? "Deleting..." : "Delete forever"}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Your active rides are cancelled, you leave your groups, and your name, phone and contacts are erased. This cannot be undone.
        </p>
        <label className="label mt-4" htmlFor="del">
          Type DELETE to confirm
        </label>
        <input id="del" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
      </Modal>
    </div>
  );
}
