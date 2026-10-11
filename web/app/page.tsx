import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { Logo } from "@/components/Logo";

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "plane", title: "Add your flight", text: "Flight number, date and where you are headed. Takes 20 seconds." },
  { icon: "users", title: "Get matched", text: "We group travellers landing within ~40 minutes and going the same way." },
  { icon: "rupee", title: "Share one cab", text: "Meet at the pickup point, book any cab together (Uber, Ola, prepaid taxi) and split the fare. FlyPool takes no money." },
];

const TRUST: { icon: IconName; title: string; text: string }[] = [
  { icon: "lock", title: "Phone-verified riders", text: "OTP login for everyone, ID badge for extra trust." },
  { icon: "users", title: "Women-only groups", text: "Choose to match only with women travellers." },
  { icon: "share", title: "Share your trip", text: "Send live details to family in one tap." },
];

const PEOPLE = [
  { i: "AS", c: "#5b3fe0" },
  { i: "MK", c: "#e0527a" },
  { i: "RT", c: "#e08a1e" },
];

function HeroCard() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="absolute -inset-6 rounded-[2rem] bg-white/10 blur-2xl" aria-hidden="true" />
      <div className="relative rounded-3xl bg-white p-5 text-[#1b1a33] shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#66658a]">Your group</span>
          <span className="rounded-full bg-[#ddf5e8] px-2.5 py-1 text-xs font-bold text-[#129a55]">Best match 94%</span>
        </div>
        <p className="mt-2 text-lg font-bold">IGI T3 &rarr; Gurugram</p>
        <p className="text-sm text-[#66658a]">Landing 18:20 - 18:50 &middot; Pillar 6</p>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#f6f5fc] p-3">
          <span className="inline-flex -space-x-2">
            {PEOPLE.map((p) => (
              <span
                key={p.i}
                className="grid h-9 w-9 place-items-center rounded-full border-2 border-white text-xs font-bold text-white"
                style={{ background: p.c }}
              >
                {p.i}
              </span>
            ))}
          </span>
          <div className="text-right">
            <p className="text-xs text-[#66658a]">Approx. share</p>
            <p className="text-2xl font-extrabold text-[#5b3fe0]">~&#8377;340</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#ffebdb] px-3 py-2 text-xs font-semibold text-[#d9660f]">
          <Icon name="clock" size={14} /> UK 971 delayed 10 min. Pickup time updated.
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#1b1464_0%,#4a2fd1_55%,#c2476b_120%)] text-white">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M-20 400 C 200 100, 420 480, 820 100" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" strokeDasharray="6 9" />
          <circle cx="120" cy="300" r="6" fill="#ffb26b" />
          <circle cx="700" cy="150" r="6" fill="#ffffff" />
        </svg>
        <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-5 md:pb-24">
          <div className="flex items-center justify-between">
            <Logo light />
            <Link href="/login" className="btn btn-ghost !min-h-10 !border-white/30 !text-white hover:!bg-white/10">
              Log in
            </Link>
          </div>

          <div className="mt-10 grid items-center gap-10 md:mt-16 md:grid-cols-[1.15fr_1fr]">
            <div>
              <span className="chip chip-glass">
                <Icon name="pin" size={14} /> Now piloting at Delhi IGI
              </span>
              <h1 className="mt-4 text-4xl font-extrabold leading-[1.06] tracking-tight md:text-6xl">
                Landed? Don&apos;t overpay for the cab.
              </h1>
              <p className="mt-4 max-w-lg text-base text-white/80 md:text-lg">
                We connect you with travellers from your flight window who are heading the same way, so you can share
                one cab and split the fare between you.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/trip/new" className="btn btn-light !min-h-12 text-base">
                  Find my ride <Icon name="arrow" size={18} />
                </Link>
                <a href="#how" className="btn btn-ghost !min-h-12 !border-white/30 !text-white hover:!bg-white/10">
                  How it works
                </a>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
                <li className="flex items-center gap-1.5"><Icon name="check" size={16} /> Verified riders</li>
                <li className="flex items-center gap-1.5"><Icon name="check" size={16} /> Women-only option</li>
                <li className="flex items-center gap-1.5"><Icon name="check" size={16} /> No fares collected by us</li>
              </ul>
            </div>
            <HeroCard />
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto w-full max-w-5xl px-4 py-16">
        <p className="text-sm font-bold uppercase tracking-wide text-brand2">Simple by design</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-5">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-white">
                  <Icon name={s.icon} />
                </span>
                <span className="text-4xl font-extrabold text-line">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted">
          FlyPool is not a cab service. We only connect travellers. Amounts shown are rough estimates of each person&apos;s share of a cab
          fare, which you pay directly to the cab you book. Real fares vary by time and cab type.
        </p>
      </section>

      <section className="bg-sky-soft">
        <div className="mx-auto w-full max-w-5xl px-4 py-16">
          <p className="text-sm font-bold uppercase tracking-wide text-brand2">Trust first</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">Built around safety</h2>
          <p className="mt-2 max-w-xl text-muted">Sharing a cab only works if you trust the people. So safety comes before everything else.</p>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {TRUST.map((t) => (
              <li key={t.title} className="card p-5">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-soft text-brand2">
                  <Icon name={t.icon} />
                </span>
                <h3 className="mt-3 font-bold">{t.title}</h3>
                <p className="mt-1 text-sm text-muted">{t.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-16">
        <div className="rounded-3xl bg-[linear-gradient(135deg,#1b1464,#4a2fd1)] px-6 py-12 text-center text-white">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Flying in soon?</h2>
          <p className="mx-auto mt-2 max-w-md text-white/80">Add your flight now. We will find your group before you land.</p>
          <Link href="/trip/new" className="btn btn-light mt-6 !min-h-12">
            Find my ride <Icon name="arrow" size={18} />
          </Link>
        </div>
      </section>

      <footer className="mt-auto border-t border-line px-4 py-6 text-center text-xs text-muted">
        FlyPool only connects travellers. We do not operate or book cabs, and we do not collect fares. &copy; 2026
      </footer>
    </div>
  );
}
