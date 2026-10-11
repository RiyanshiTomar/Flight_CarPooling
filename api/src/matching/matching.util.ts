/** Tunable matching rules. Pure functions only, so they are trivial to unit test and to move into a worker later. */
export const MATCH = {
  maxTimeGapMin: 40, // landing-to-landing gap between travellers
  maxDestKm: 5, // how far apart drop areas may be
  capacity: 4, // seats in a standard cab
  etaBufferMin: 30, // deplane + baggage + walk to pickup, added to estimated landing
  sharedCarSurcharge: 1.1, // bigger car costs a bit more than a solo hatchback
} as const;

export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 0-100. Returns null when the pair is not compatible at all. */
export function matchScore(timeGapMin: number, distKm: number): number | null {
  if (timeGapMin > MATCH.maxTimeGapMin || distKm > MATCH.maxDestKm) return null;
  const s = 100 - (timeGapMin / MATCH.maxTimeGapMin) * 30 - (distKm / MATCH.maxDestKm) * 30;
  return Math.round(s);
}

/** Minutes between a point in time and a [start, end] window (0 if inside it). */
export function gapToWindowMin(t: Date, start: Date, end: Date): number {
  if (t < start) return (start.getTime() - t.getTime()) / 60_000;
  if (t > end) return (t.getTime() - end.getTime()) / 60_000;
  return 0;
}

/** Estimated per-person fare when `people` share one cab. */
export function perPersonFare(soloFare: number, people: number): number {
  return Math.round((soloFare * MATCH.sharedCarSurcharge) / Math.max(1, people) / 10) * 10;
}
