import Link from "next/link";

/** The FlyPool mark: a plane's path curving into a shared ride (two seats). */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="var(--primary)" />
      <path d="M8 27c6-1 9-5 12-10s6-8 12-8" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="2.5 3" strokeLinecap="round" />
      <path d="M27.5 7.5 33 9l-1.5 5.5-2-2.2-3 2.6-1.4-1.6 3-2.6z" fill="#fff" />
      <circle cx="12" cy="27" r="3.2" fill="#fff" />
      <circle cx="19" cy="27" r="3.2" fill="#c7cdf8" />
    </svg>
  );
}

export function Logo({ light = false, href = "/" }: { light?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 rounded-xl text-[1.2rem] font-extrabold tracking-tight" aria-label="FlyPool home">
      <LogoMark />
      <span className={light ? "text-white" : "text-brand"}>
        Fly<span className={light ? "text-[#c7cdf8]" : "text-band dark:text-primary"}>Pool</span>
      </span>
    </Link>
  );
}
