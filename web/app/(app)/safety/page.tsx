"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/Icon";

const TIPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "lock", title: "Your address stays private", text: "Others only see your drop area, until the group is confirmed." },
  { icon: "users", title: "Check verified badges", text: "Prefer travellers with the shield badge and good ratings." },
  { icon: "car", title: "Match the cab details", text: "Confirm the plate number and driver name before you get in." },
  { icon: "phone", title: "Keep chat in-app", text: "Your phone number is masked from other travellers." },
];

export default function Safety() {
  const [shared, setShared] = useState(false);
  const [sos, setSos] = useState(false);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Safety centre</h1>
      <p className="mt-1 text-muted">Tools to keep every ride safe and accountable.</p>

      <div className="card mt-6 border-danger/40 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-danger-soft text-danger"><Icon name="alert" /></span>
          <div>
            <h2 className="font-semibold">Emergency</h2>
            <p className="text-sm text-muted">Alerts your trusted contact and shows 112.</p>
          </div>
        </div>
        <button className="btn btn-danger btn-block mt-4 !min-h-12" onClick={() => setSos(true)}>
          <Icon name="phone" size={18} /> Send SOS alert
        </button>
        {sos && (
          <p role="status" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
            Demo: in the real app this alerts your trusted contact with live location. Call 112 for immediate help.
          </p>
        )}
      </div>

      <div className="card mt-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Share my trip</h2>
            <p className="text-sm text-muted">Send flight, cab and group details to family.</p>
          </div>
          <button className={`btn ${shared ? "btn-primary" : "btn-ghost"}`} onClick={() => setShared(!shared)} aria-pressed={shared}>
            <Icon name={shared ? "check" : "share"} size={18} /> {shared ? "Shared" : "Share"}
          </button>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold">Safety tips</h2>
      <ul className="mt-3 space-y-3">
        {TIPS.map((t) => (
          <li key={t.title} className="card flex gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-soft text-brand2"><Icon name={t.icon} /></span>
            <div>
              <h3 className="font-semibold">{t.title}</h3>
              <p className="text-sm text-muted">{t.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <button className="btn btn-ghost btn-block mt-6">
        <Icon name="flag" size={18} /> Report or block a traveller
      </button>
    </div>
  );
}

