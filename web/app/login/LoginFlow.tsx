"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { OtpInput } from "@/components/OtpInput";
import { Spinner } from "@/components/States";
import { errorText } from "@/lib/format";
import { service, type Gender } from "@/lib/services";

type Step = "phone" | "otp" | "profile";

/** Only allow in-app paths as the post-login destination (no open redirects). */
function safeNext(raw: string | null) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/trip/new";
}

export function LoginFlow() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(0);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const phoneOk = /^[6-9]\d{9}$/.test(phone);

  useEffect(() => {
    if (service.auth.current()) router.replace(next);
  }, [router, next]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!phoneOk || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await service.auth.requestOtp(phone);
      setDevCode(r.devCode);
      setCooldown(r.resendInSeconds);
      setOtp("");
      setStep("otp");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(code = otp) {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      const s = await service.auth.verifyOtp(phone, code);
      if (!s.user.name) {
        setStep("profile");
        setBusy(false);
      } else router.replace(next);
    } catch (err) {
      setError(errorText(err));
      setOtp("");
      setBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !gender || busy) return;
    setBusy(true);
    setError("");
    try {
      await service.me.update({ name: name.trim(), gender: gender as Gender });
      router.replace(next);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const titles: Record<Step, [string, string]> = {
    phone: ["Welcome aboard", "Log in or sign up with your mobile number. No password needed."],
    otp: ["Check your phone", `Enter the 6-digit code we sent to +91 ${phone.replace(/(\d{5})(\d{5})/, "$1 $2")}.`],
    profile: ["One last thing", "This is what your co-travellers will see. Only your first name is shown."],
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      {/* brand panel */}
      <aside className="relative hidden overflow-hidden bg-band p-10 text-white lg:flex lg:flex-col">
        <Logo light />
        <div className="my-auto max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Your flight lands. Your group is waiting.</h2>
          <ul className="mt-8 space-y-4 text-white/90">
            {[
              ["users", "Matched by landing time and drop area"],
              ["wallet", "Split one cab instead of paying alone"],
              ["shield", "Verified riders, women-only option, SOS"],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15">
                  <Icon name={icon as "users"} size={20} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <svg className="pointer-events-none absolute -bottom-10 -right-10 h-80 w-80 opacity-20" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="none" stroke="#fff" strokeDasharray="3 5" />
          <circle cx="50" cy="50" r="32" fill="none" stroke="#fff" />
          <circle cx="50" cy="50" r="16" fill="none" stroke="#fff" strokeDasharray="2 3" />
        </svg>
      </aside>

      <main id="main" className="mx-auto flex w-full max-w-md flex-col px-5 py-6">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 flex-col justify-center py-10">
          {step !== "phone" && step !== "profile" && (
            <button
              type="button"
              className="mb-6 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-primary"
              onClick={() => {
                setStep("phone");
                setError("");
              }}
            >
              <Icon name="back" size={16} /> Change number
            </button>
          )}
          <h1 className="text-3xl font-extrabold tracking-tight text-brand">{titles[step][0]}</h1>
          <p className="mt-2 text-muted">{titles[step][1]}</p>

          {step === "phone" && (
            <form className="mt-8 space-y-4" onSubmit={sendCode} noValidate>
              <div>
                <label className="label" htmlFor="phone">
                  Mobile number
                </label>
                <div className="flex gap-2">
                  <span className="input flex !w-20 shrink-0 items-center justify-center font-semibold text-muted">+91</span>
                  <input
                    id="phone"
                    className="input text-lg tracking-wide"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={phone}
                    autoFocus
                    aria-invalid={phone.length === 10 && !phoneOk}
                    aria-describedby="phone-hint"
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").replace(/^91(?=\d{10})/, "").slice(0, 10))}
                  />
                </div>
                <p id="phone-hint" className="hint">
                  {phone.length === 10 && !phoneOk ? "Indian mobile numbers start with 6, 7, 8 or 9." : "We text you a one-time code. Standard SMS rates may apply."}
                </p>
              </div>
              <button className="btn btn-primary btn-block !min-h-12" disabled={!phoneOk || busy}>
                {busy ? <Spinner /> : null} {busy ? "Sending code..." : "Send code"}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form
              className="mt-8 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                verify();
              }}
            >
              <OtpInput value={otp} onChange={setOtp} onComplete={verify} disabled={busy} invalid={!!error} />
              <button className="btn btn-primary btn-block !min-h-12" disabled={otp.length !== 6 || busy}>
                {busy ? <Spinner /> : null} {busy ? "Checking..." : "Verify and continue"}
              </button>
              <p className="text-center text-sm text-muted">
                Didn&apos;t get it?{" "}
                {cooldown > 0 ? (
                  <span>Resend in {cooldown}s</span>
                ) : (
                  <button type="button" className="font-semibold text-primary" onClick={() => sendCode()} disabled={busy}>
                    Send a new code
                  </button>
                )}
              </p>
              {devCode && (
                <p className="rounded-2xl bg-sun-soft p-3 text-center text-sm text-sun">
                  Development mode: your code is <b className="tracking-widest">{devCode}</b>
                </p>
              )}
            </form>
          )}

          {step === "profile" && (
            <form className="mt-8 space-y-5" onSubmit={saveProfile}>
              <div>
                <label className="label" htmlFor="pname">
                  Your name
                </label>
                <input id="pname" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
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
              <button className="btn btn-primary btn-block !min-h-12" disabled={name.trim().length < 2 || !gender || busy}>
                {busy ? <Spinner /> : null} Continue <Icon name="arrow" size={16} />
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
              <Icon name="alert" size={16} /> {error}
            </p>
          )}
        </div>
        <p className="text-center text-xs text-muted">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
