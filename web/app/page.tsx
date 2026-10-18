import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { PopularRoutes } from "@/components/landing/PopularRoutes";
import { QuickSearch } from "@/components/landing/QuickSearch";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "plane", title: "Add your flight", text: "Flight number, date and your drop area. We read your landing time and terminal for you." },
  { icon: "users", title: "Get matched", text: "We group people landing within about 40 minutes and heading the same way. You choose the group." },
  { icon: "car", title: "Share one cab", text: "Meet at the pickup point, book any cab together and split the fare. FlyPool takes no money." },
];

const WHY: { value: string; label: string }[] = [
  { value: "Up to 60%", label: "less than riding alone" },
  { value: "40 min", label: "landing window for matches" },
  { value: "₹0", label: "fees. We never touch fares" },
  { value: "Live", label: "delay updates for your group" },
];

const TRUST: { icon: IconName; title: string; text: string }[] = [
  { icon: "lock", title: "Phone-verified riders", text: "Everyone logs in with an OTP. Others see only your first name and drop area." },
  { icon: "heart", title: "Women-only groups", text: "Turn it on and you are matched only with women travellers." },
  { icon: "share", title: "Share your trip", text: "Send family a live link with your group, pickup point and status." },
  { icon: "alert", title: "SOS in one tap", text: "Alerts your trusted contact with your location and shows 112." },
  { icon: "ban", title: "Report and block", text: "Block someone once and you never get matched with them again." },
  { icon: "star", title: "Ratings after every ride", text: "Good co-travellers rise to the top. Bad ones stand out fast." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Does FlyPool book the cab?",
    a: "No. FlyPool only connects travellers. Your group books any cab it likes (Uber, Ola, a prepaid taxi) and splits the fare directly. We never collect money.",
  },
  {
    q: "What if my flight is late?",
    a: "We keep checking your flight. If it is delayed, your pickup time moves and your group gets a message right away.",
  },
  {
    q: "Who can see my details?",
    a: "Before you join a group, others see only first names, ratings and drop areas. Phone numbers are never shown. Chat happens inside FlyPool.",
  },
  {
    q: "How is the shared fare worked out?",
    a: "We start from a typical solo cab fare to your area, add about 10% for a bigger car, and divide by the number of riders. It is an estimate; the real fare depends on the cab you book.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, any time before the ride starts. Your group is told, and your seat opens up for someone else.",
  },
];

function HeroArt() {
  // original skyline + flight path illustration, drawn in the brand palette
  return (
    <svg viewBox="0 0 560 260" className="h-auto w-full" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--lavender)" stopOpacity="0.0" />
          <stop offset="1" stopColor="var(--lavender)" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect x="0" y="120" width="560" height="140" fill="url(#sky)" />
      <g fill="var(--band)" opacity="0.28">
        <rect x="20" y="150" width="34" height="110" rx="3" />
        <rect x="60" y="120" width="26" height="140" rx="3" />
        <rect x="92" y="170" width="40" height="90" rx="3" />
        <rect x="140" y="100" width="22" height="160" rx="3" />
        <path d="M151 70 l8 30 h-16 z" />
        <rect x="170" y="140" width="46" height="120" rx="3" />
        <rect x="350" y="130" width="40" height="130" rx="3" />
        <rect x="396" y="95" width="24" height="165" rx="3" />
        <rect x="426" y="155" width="48" height="105" rx="3" />
        <rect x="480" y="125" width="30" height="135" rx="3" />
        <rect x="515" y="170" width="36" height="90" rx="3" />
      </g>
      <g fill="var(--band)" opacity="0.5">
        <rect x="236" y="168" width="96" height="92" rx="4" />
        <path d="M228 170 h112 l-14 -22 h-84 z" />
        <rect x="270" y="120" width="28" height="30" rx="3" />
        <rect x="262" y="112" width="44" height="10" rx="3" />
      </g>
      <path d="M0 252 H560" stroke="var(--band)" strokeOpacity="0.5" strokeWidth="2" />
      <path className="route-dash" d="M30 210 C 140 40, 330 40, 520 40" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeDasharray="6 8" strokeLinecap="round" />
      <g transform="translate(508 30) rotate(8)">
        <path d="M0 10 L22 6 L30 0 L34 2 L28 9 L40 12 L40 15 L28 14 L24 22 L20 22 L22 13 L4 14 Z" fill="var(--primary)" />
      </g>
      {/* the shared cab */}
      <g transform="translate(372 214)">
        <rect x="0" y="10" width="96" height="24" rx="10" fill="var(--primary)" />
        <path d="M14 12 L28 0 H66 L82 12 Z" fill="var(--primary)" />
        <path d="M30 4 H46 V12 H22 Z M50 4 H64 L74 12 H50 Z" fill="#c7cdf8" />
        <circle cx="22" cy="36" r="8" fill="var(--brand)" />
        <circle cx="74" cy="36" r="8" fill="var(--brand)" />
      </g>
      {/* travellers */}
      {[
        { x: 300, c: "#c2416c" },
        { x: 326, c: "#b45f06" },
        { x: 352, c: "#0f7d70" },
      ].map((p) => (
        <g key={p.x} transform={`translate(${p.x} 206)`}>
          <circle cx="8" cy="0" r="7" fill={p.c} />
          <rect x="0" y="9" width="16" height="30" rx="7" fill={p.c} />
          <rect x="18" y="22" width="12" height="17" rx="3" fill="var(--brand)" opacity="0.75" />
        </g>
      ))}
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main">
        {/* hero */}
        <section className="relative overflow-hidden bg-[linear-gradient(180deg,var(--surface)_0%,var(--bg)_100%)]">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-8 pt-10 md:grid-cols-[1.05fr_1fr] md:pb-12 md:pt-16">
            <div className="fade-up">
              <span className="chip">
                <Icon name="pin" size={14} /> Now live at Delhi IGI T3
              </span>
              <h1 className="mt-4 text-[2.4rem] font-extrabold leading-[1.05] tracking-tight text-brand md:text-6xl">
                Landed? <span className="text-band dark:text-primary">Share the cab.</span>
                <br />
                Split the fare.
              </h1>
              <p className="mt-4 max-w-lg text-base text-muted md:text-lg">
                FlyPool matches you with travellers from your flight window who are heading the same way. One cab, one fare, split
                fairly.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/trip/new" className="btn btn-primary !min-h-12 px-6 text-base">
                  Find my ride share <Icon name="arrow" size={18} />
                </Link>
                <Link href="#how" className="btn btn-ghost !min-h-12">
                  See how it works
                </Link>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-muted">
                {["Phone-verified riders", "Women-only option", "No fees, ever"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Icon name="check" size={16} className="text-accent" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <HeroArt />
              <div className="card absolute bottom-3 left-2 hidden max-w-[15rem] items-center gap-3 p-3 sm:flex md:-left-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon name="wallet" />
                </span>
                <div>
                  <p className="text-xs text-muted">IGI T3 to Cyber Hub</p>
                  <p className="text-sm font-bold">
                    ~₹340 each <span className="font-medium text-muted line-through">₹920</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="mx-auto max-w-6xl px-4 pb-14">
            <QuickSearch />
          </div>
        </section>

        {/* routes */}
        <section id="routes" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-band dark:text-primary">Popular airport routes</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-brand md:text-3xl">Where travellers are heading</h2>
            </div>
            <p className="max-w-sm text-sm text-muted">Tag shows the rough share per person when the cab is full.</p>
          </div>
          <div className="mt-6">
            <PopularRoutes />
          </div>
        </section>

        {/* how it works */}
        <section id="how" className="scroll-mt-20 bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-16">
            <p className="text-sm font-bold uppercase tracking-wider text-band dark:text-primary">Simple by design</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-brand md:text-3xl">Three steps from the gate to the cab</h2>
            <ol className="relative mt-8 grid gap-5 md:grid-cols-3">
              <svg className="absolute left-0 right-0 top-7 -z-0 hidden h-4 w-full md:block" preserveAspectRatio="none" viewBox="0 0 100 4" aria-hidden="true">
                <path d="M10 2 H90" stroke="var(--lavender)" strokeWidth="0.6" strokeDasharray="1.5 1.5" />
              </svg>
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative">
                  <span className="relative z-10 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-white shadow-[var(--shadow)]">
                    <Icon name={s.icon} size={24} />
                  </span>
                  <p className="mt-4 text-xs font-bold text-band dark:text-primary">STEP {i + 1}</p>
                  <h3 className="mt-1 text-lg font-bold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* why */}
        <section className="bg-band text-white">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4">
            {WHY.map((w) => (
              <div key={w.label}>
                <dt className="sr-only">{w.label}</dt>
                <dd className="text-3xl font-extrabold tracking-tight">{w.value}</dd>
                <dd className="mt-1 text-sm text-white/80">{w.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* safety */}
        <section id="safety" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16">
          <p className="text-sm font-bold uppercase tracking-wider text-band dark:text-primary">Trust first</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-brand md:text-3xl">Built around your safety</h2>
          <p className="mt-2 max-w-xl text-muted">Sharing a cab only works when you trust the people in it. So safety is not a feature, it is the base.</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((t) => (
              <li key={t.title} className="card p-5">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-soft text-primary">
                  <Icon name={t.icon} />
                </span>
                <h3 className="mt-3 font-bold">{t.title}</h3>
                <p className="mt-1 text-sm text-muted">{t.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* faq */}
        <section id="faq" className="scroll-mt-20 bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-band dark:text-primary">Questions</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-brand md:text-3xl">Good to know</h2>
              <p className="mt-2 text-muted">Everything people ask before their first shared ride.</p>
            </div>
            <div className="divide-y divide-line rounded-2xl border border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {f.q}
                    <Icon name="plus" size={18} className="text-primary transition-transform group-open:rotate-45" />
                  </summary>
                  <p className="mt-2 text-sm text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* cta */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <div className="relative overflow-hidden rounded-[2rem] bg-brand px-6 py-12 text-center text-surface md:py-16">
            <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-25" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <path d="M-20 260 C 220 40, 520 300, 820 60" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 9" />
            </svg>
            <h2 className="relative text-2xl font-extrabold tracking-tight md:text-4xl">Flying in soon?</h2>
            <p className="relative mx-auto mt-2 max-w-md opacity-80">Add your flight now. Your group can be ready before you land.</p>
            <Link href="/trip/new" className="btn relative mt-6 !min-h-12 bg-surface px-6 text-brand hover:opacity-90">
              Find my ride share <Icon name="arrow" size={18} />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
