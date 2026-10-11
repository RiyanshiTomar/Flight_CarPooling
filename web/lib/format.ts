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

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const COLORS = ["#5b3fe0", "#e0527a", "#e08a1e", "#129a8a", "#2f7de1", "#8e44ad", "#c0392b"];
export function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}
