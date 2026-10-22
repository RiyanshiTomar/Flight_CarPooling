"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { ConfirmDialog } from "@/components/Modal";
import { Spinner } from "@/components/States";
import { useToast } from "@/components/Toast";
import { errorText, fmtTime } from "@/lib/format";
import { service, type RideRequest, type SosResult, type User } from "@/lib/services";

const TIPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "lock", title: "Your address stays private", text: "Others see only your drop area and first name. Never your phone number." },
  { icon: "shield", title: "Check badges and ratings", text: "Prefer travellers with the shield badge and good ratings." },
  { icon: "car", title: "Match the cab details", text: "Confirm the plate number and driver name before anyone gets in." },
  { icon: "chat", title: "Keep chat in FlyPool", text: "Never share OTPs, UPI PINs or payment links in the chat." },
  { icon: "flag", title: "Report anything off", text: "Open the group, tap the three dots next to a person, then Report or Block." },
];

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function SafetyCentre() {
  const toast = useToast();
  const groupParam = useSearchParams().get("group");
  const [user, setUser] = useState<User | null>(null);
  const [active, setActive] = useState<RideRequest[]>([]);
  const [confirmSos, setConfirmSos] = useState(false);
  const [sosBusy, setSosBusy] = useState(false);
  const [sos, setSos] = useState<SosResult | null>(null);
  const [sosError, setSosError] = useState("");

  useEffect(() => {
    service.me.get().then(setUser).catch(() => {});
    service.rides
      .mine()
      .then((r) => setActive(r.filter((x) => ["MATCHED", "CONFIRMED", "IN_TRIP", "PENDING"].includes(x.status) && x.groupId)))
      .catch(() => {});
  }, []);

  async function sendSos() {
    setSosBusy(true);
    setSosError("");
    try {
      const pos = await getPosition();
      setSos(await service.safety.sos({ groupId: groupParam ?? undefined, ...(pos ?? {}) }));
    } catch (e) {
      setSosError(errorText(e));
    } finally {
      setSosBusy(false);
      setConfirmSos(false);
    }
  }

  async function share(groupId: string) {
    try {
      const link = await service.safety.share(groupId);
      if (typeof navigator.share === "function") await navigator.share({ title: "My FlyPool ride", url: link.url }).catch(() => {});
      else {
        await navigator.clipboard.writeText(link.url);
        toast("Trip link copied. Send it to family.", "success");
      }
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-extrabold tracking-tight text-brand md:text-3xl">Safety centre</h1>
      <p className="mt-1 text-muted">Tools that keep every shared ride safe and accountable.</p>

      {/* SOS */}
      <section className="card mt-6 overflow-hidden border-danger/30" aria-labelledby="sos-h">
        <div className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-danger-soft text-danger">
              <Icon name="alert" size={22} />
            </span>
            <div>
              <h2 id="sos-h" className="font-bold">
                Emergency
              </h2>
              <p className="text-sm text-muted">
                {user?.trustedContactPhone
                  ? `Texts ${user.trustedContactName ?? "your trusted contact"} your location and trip link.`
                  : "Add a trusted contact on your profile so we can alert them."}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a href="tel:112" className="btn btn-danger !min-h-12">
              <Icon name="phone" size={18} /> Call 112
            </a>
            <button className="btn btn-danger-ghost !min-h-12" onClick={() => setConfirmSos(true)} disabled={sosBusy}>
              {sosBusy ? <Spinner /> : <Icon name="bolt" size={18} />} Send SOS alert
            </button>
          </div>
          {!user?.trustedContactPhone && user && (
            <Link href="/profile" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Add a trusted contact <Icon name="chevron" size={14} />
            </Link>
          )}
        </div>
        {(sos || sosError) && (
          <div role="status" className={`border-t px-5 py-4 text-sm ${sosError ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-surface-2"}`}>
            {sosError ? (
              sosError
            ) : sos?.contactNotified ? (
              <p>
                <b>Alert sent</b> to {sos.contactName ?? "your trusted contact"} at {fmtTime(new Date().toISOString())}. If you are in danger, call 112 now.
              </p>
            ) : (
              <p>
                <b>Your SOS is recorded</b>, but {sos?.hasTrustedContact ? "the text could not be sent" : "you have no trusted contact"}. Call 112 for immediate help.
              </p>
            )}
          </div>
        )}
      </section>

      {/* share */}
      <section className="card mt-4 p-5" aria-labelledby="share-h">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-soft text-primary">
            <Icon name="share" size={22} />
          </span>
          <div>
            <h2 id="share-h" className="font-bold">
              Share my trip
            </h2>
            <p className="text-sm text-muted">Family gets a live, read-only page with your group, pickup and status.</p>
          </div>
        </div>
        {active.length === 0 ? (
          <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-muted">You can share once you have an active ride.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {active.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                <Icon name="plane" size={18} className="text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <b>{r.flightNo}</b> &middot; to {r.destLabel}
                </span>
                <button className="btn btn-soft btn-sm" onClick={() => share(r.groupId!)}>
                  <Icon name="share" size={14} /> Share
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mt-8 text-lg font-bold">Safety tips</h2>
      <ul className="mt-3 space-y-3">
        {TIPS.map((t) => (
          <li key={t.title} className="card flex gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-soft text-primary">
              <Icon name={t.icon} />
            </span>
            <div>
              <h3 className="font-semibold">{t.title}</h3>
              <p className="text-sm text-muted">{t.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirmSos}
        title="Send an SOS alert?"
        text={
          user?.trustedContactPhone
            ? `We will text ${user.trustedContactName ?? "your trusted contact"} with your location (if you allow it) and a live trip link.`
            : "You have no trusted contact yet, so we will only record the alert. Call 112 if you need help right now."
        }
        confirmLabel="Send SOS"
        danger
        busy={sosBusy}
        onConfirm={sendSos}
        onClose={() => setConfirmSos(false)}
      />
    </div>
  );
}
