"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { ErrorBox, Loading } from "@/components/States";
import { errorText } from "@/lib/format";
import { service, type Gender, type User } from "@/lib/services";

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    service.me.get().then((u) => { setUser(u); setName(u.name ?? ""); setGender(u.gender ?? ""); }).catch((e) => setError(errorText(e)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    try {
      const patch: { name?: string; gender?: Gender } = {};
      if (name.trim()) patch.name = name.trim();
      if (gender) patch.gender = gender;
      setUser(await service.me.update(patch));
      setSaved(true);
      setError("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return error ? <div className="mx-auto max-w-xl"><ErrorBox message={error} /></div> : <Loading />;

  const stats = [
    { label: "Trips", value: String(user.trips) },
    { label: "Rating", value: user.rating.toFixed(1) },
    { label: "Verified level", value: String(user.verifiedLevel) },
  ];

  return (
    <div className="mx-auto max-w-xl">
      <div className="card flex items-center gap-4 p-5">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-2xl font-bold text-white">
          {(user.name ?? "?")[0].toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{user.name ?? "Add your name"}</h1>
          <p className="text-sm text-muted">{user.phone}</p>
          <span className="chip chip-green mt-1"><Icon name="shield" size={14} /> Phone verified</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <dd className="text-xl font-extrabold text-brand2">{s.value}</dd>
            <dt className="text-xs text-muted">{s.label}</dt>
          </div>
        ))}
      </dl>

      <form onSubmit={save} className="card mt-4 space-y-4 p-5">
        <h2 className="font-semibold">Your details</h2>
        <div>
          <label className="label" htmlFor="n">Name</label>
          <input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="g">Gender</label>
          <select id="g" className="input" value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
            <option value="">Select</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
          <p className="mt-1 text-xs text-muted">Used only for women-only groups. Others see just your first name.</p>
        </div>
        {error && <ErrorBox message={error} />}
        {saved && <p role="status" className="text-sm font-semibold text-accent">Saved</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
      </form>

      <div className="card mt-4 p-5">
        <h2 className="font-semibold">Get verified</h2>
        <p className="mt-1 text-sm text-muted">Verified travellers are trusted more by their group.</p>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center gap-2"><Icon name="check" size={16} className="text-accent" /> Phone number</li>
          <li className="flex items-center gap-2 text-muted"><Icon name="clock" size={16} /> Government ID (coming soon)</li>
          <li className="flex items-center gap-2 text-muted"><Icon name="clock" size={16} /> Selfie check (coming soon)</li>
        </ul>
      </div>

      <button className="btn btn-ghost btn-block mt-4" onClick={() => { service.auth.logout(); router.push("/"); }}>Log out</button>
    </div>
  );
}
