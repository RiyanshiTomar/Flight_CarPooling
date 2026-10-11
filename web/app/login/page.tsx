"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { errorText } from "@/lib/format";
import { service } from "@/lib/services";

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const phoneOk = /^[6-9]\d{9}$/.test(phone);

  useEffect(() => {
    if (service.auth.current()) router.replace("/trip/new");
  }, [router]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneOk || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await service.auth.requestOtp(phone);
      setDevCode(r.devCode);
      setStep("otp");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      await service.auth.verifyOtp(phone, otp);
      router.push("/trip/new");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      <Logo />
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-3xl font-extrabold tracking-tight">{step === "phone" ? "Welcome aboard" : "Enter the code"}</h1>
        <p className="mt-2 text-muted">
          {step === "phone" ? "Log in with your phone number. No password needed." : `We sent a 6-digit code to +91 ${phone}.`}
        </p>

        {step === "phone" ? (
          <form className="mt-8 space-y-4" onSubmit={sendCode}>
            <div>
              <label className="label" htmlFor="phone">Mobile number</label>
              <div className="flex gap-2">
                <span className="input flex !w-16 items-center justify-center text-muted">+91</span>
                <input
                  id="phone"
                  className="input"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
            <button className="btn btn-primary btn-block" disabled={!phoneOk || busy}>
              {busy ? "Sending..." : "Send code"}
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-4" onSubmit={verify}>
            <div>
              <label className="label" htmlFor="otp">6-digit code</label>
              <input
                id="otp"
                className="input text-center text-xl tracking-[0.5em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
            </div>
            <button className="btn btn-primary btn-block" disabled={otp.length !== 6 || busy}>
              {busy ? "Checking..." : "Verify and continue"}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => { setStep("phone"); setOtp(""); setError(""); }}>
              Change number
            </button>
            {devCode && (
              <p className="rounded-xl bg-sun-soft p-3 text-center text-sm text-sun">
                Development mode: your code is <b className="tracking-widest">{devCode}</b>
              </p>
            )}
          </form>
        )}
        {error && <p role="alert" className="mt-4 text-sm font-semibold text-danger">{error}</p>}
      </div>
      <p className="text-center text-xs text-muted">By continuing you agree to our Terms and Privacy Policy.</p>
    </div>
  );
}
