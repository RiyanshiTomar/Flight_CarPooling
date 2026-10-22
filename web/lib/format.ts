const TZ = "Asia/Kolkata";

export const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

export function fmtRange(a: string, b: string): string {
  const x = fmtTime(a);
  const y = fmtTime(b);
  return x === y ? x : `${x} - ${y}`;
}

/** "Today", "Tomorrow" or "Sat, 24 Oct" in India time. */
export function fmtDay(isoOrDate: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? new Date(`${isoOrDate}T12:00:00+05:30`) : new Date(isoOrDate);
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ });
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  if (key(d) === key(today)) return "Today";
  if (key(d) === key(tomorrow)) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
}

/** Today's date (YYYY-MM-DD) in India time. */
export const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

export function minutesFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// avatar colours, all readable with white text
const COLORS = ["#2f3fa6", "#5c6bb2", "#c2416c", "#b45f06", "#0f7d70", "#7a3fb0", "#2b6cb0", "#b83232"];
export function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.";
}

export const flightPattern = /^[A-Za-z0-9]{2}\s?\d{1,4}$/;
export const normalizeFlight = (s: string) => s.replace(/\s+/g, "").toUpperCase();
