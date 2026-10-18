/* eslint-disable @typescript-eslint/no-explicit-any -- this file maps raw backend JSON into the typed domain objects in ./types */
import { clearSession, loadSession, saveSession } from "./sessionStore";
import {
  ServiceError,
  type FlyPoolService,
  type Group,
  type LiveEvent,
  type LiveStatus,
  type Message,
  type RideRequest,
  type Session,
  type Suggestion,
  type Traveller,
  type User,
} from "./types";

/**
 * Implementation of FlyPoolService for the FlyPool NestJS API (see /api).
 * ALL knowledge of the backend's URLs and JSON shape lives in this one file.
 */
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

// ---------------------------------------------------------------- tokens

let refreshing: Promise<boolean> | null = null;

/** Swap the refresh token for a new pair. Concurrent callers share one request. */
function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const s = loadSession();
    if (!s?.refreshToken) return false;
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: s.refreshToken }),
      });
      if (!res.ok) return false;
      const t = (await res.json()) as { accessToken: string; refreshToken: string };
      saveSession({ ...s, token: t.accessToken, refreshToken: t.refreshToken });
      return true;
    } catch {
      return false;
    }
  })().finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

function endSession() {
  clearSession();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    // outside React, so no router here; a full load also resets all in-memory state
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
}

async function call<T>(method: string, path: string, body?: unknown, auth = true, retried = false): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) {
    const s = loadSession();
    if (s) headers.authorization = `Bearer ${s.token}`;
  }
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ServiceError("Cannot reach FlyPool. Check your internet and try again.");
  }
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401 && auth) {
      if (!retried && (await refreshTokens())) return call<T>(method, path, body, auth, true);
      endSession();
      throw new ServiceError("Your session ended. Please log in again.", 401);
    }
    if (res.status === 429) throw new ServiceError(json?.message ?? "Too many tries. Please wait a moment.", 429);
    const m = json?.message;
    throw new ServiceError(Array.isArray(m) ? m[0] : (m ?? `Something went wrong (${res.status})`), res.status);
  }
  return json as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- live events (SSE over fetch, so we can send the token)

type Sub = { onEvent: (e: LiveEvent) => void; onStatus?: (s: LiveStatus) => void };
const subs = new Set<Sub>();
let liveCtrl: AbortController | null = null;
let liveStatus: LiveStatus = "offline";

function setStatus(s: LiveStatus) {
  liveStatus = s;
  subs.forEach((x) => x.onStatus?.(s));
}

async function runLive() {
  let delay = 1000;
  const ctrl = new AbortController();
  liveCtrl = ctrl;
  while (!ctrl.signal.aborted && subs.size) {
    const s = loadSession();
    if (!s) return setStatus("offline");
    setStatus("connecting");
    try {
      const res = await fetch(`${BASE}/events`, {
        headers: { authorization: `Bearer ${s.token}`, accept: "text/event-stream" },
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (res.status === 401) {
        if (!(await refreshTokens())) return endSession();
        continue;
      }
      if (!res.ok || !res.body) throw new Error(String(res.status));
      setStatus("live");
      delay = 1000;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (!/^event: event$/m.test(block)) continue;
          const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("\n");
          const ev = safeJson(data) as LiveEvent | null;
          if (ev) subs.forEach((x) => x.onEvent(ev));
        }
      }
    } catch {
      if (ctrl.signal.aborted) return;
    }
    setStatus("offline");
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 30_000);
  }
}

// ---------------------------------------------------------------- mappers: backend JSON -> domain types

const toUser = (u: any): User => ({
  id: u.id,
  phone: u.phone,
  name: u.name ?? null,
  gender: u.gender ?? null,
  verifiedLevel: u.verified_level,
  rating: Number(u.rating_avg),
  ratingCount: u.rating_count ?? 0,
  trips: u.trips_count,
  trustedContactName: u.trusted_contact_name ?? null,
  trustedContactPhone: u.trusted_contact_phone ?? null,
});

const toTraveller = (m: any): Traveller => ({
  memberId: m.memberId,
  name: m.name ?? "Traveller",
  verifiedLevel: m.verified_level,
  rating: Number(m.rating_avg),
  ratingCount: m.rating_count,
  trips: m.trips_count,
  flightNo: m.flight_no,
  readyAt: m.eta,
  destLabel: m.dest_label,
  seats: m.seats,
  confirmed: m.confirmed,
  isYou: m.isYou,
  ratedByYou: m.ratedByYou,
});

const toGroup = (g: any, sharedFare?: number): Group => ({
  id: g.id,
  status: g.status ?? "OPEN",
  terminal: g.terminal,
  pickupPoint: g.pickupPoint,
  windowStart: g.windowStart,
  windowEnd: g.windowEnd,
  womenOnly: g.womenOnly,
  seatsTaken: g.seatsTaken,
  seatsLeft: g.seatsLeft,
  soloFare: g.soloFare,
  sharedFare: sharedFare ?? g.perPersonFare ?? g.sharedFareIfJoined,
  members: (g.members ?? []).map(toTraveller),
  myRequestId: g.myRequestId,
  startedAt: g.startedAt ?? null,
  completedAt: g.completedAt ?? null,
});

const toSuggestion = (s: any): Suggestion => ({
  score: s.score,
  timeGapMin: s.timeGapMin,
  distanceKm: s.detourKmApprox,
  group: toGroup(s.group, s.group.sharedFareIfJoined),
});

const toRequest = (r: any): RideRequest => ({
  id: r.id,
  flightNo: r.flightNo,
  flightDate: r.flightDate,
  terminal: r.terminal,
  readyAt: r.eta,
  destLabel: r.destLabel,
  seats: r.seats,
  luggage: r.luggage,
  womenOnly: r.womenOnly,
  status: r.status,
  estSoloFare: r.estSoloFare,
  groupId: r.groupId ?? null,
  groupStatus: r.groupStatus ?? null,
  groupSize: r.groupSize ?? null,
  pickupPoint: r.pickupPoint ?? null,
});

const toMessage = (m: any): Message => ({
  id: m.id,
  body: m.body,
  at: m.created_at,
  mine: !!m.mine,
  sender: m.sender ?? "You",
  system: m.kind === "system",
});

const toFlight = (f: any) => ({
  flightNo: f.flightNo,
  origin: f.origin ?? f.originIata ?? null,
  destination: f.destination ?? f.destIata,
  terminal: f.terminal,
  scheduledArrival: f.scheduledArrival,
  estimatedArrival: f.estimatedArrival,
  status: f.status,
});

export const httpService: FlyPoolService = {
  name: "http",

  auth: {
    async requestOtp(phone) {
      const r = await call<{ devCode?: string; resendInSeconds?: number }>("POST", "/auth/otp/request", { phone }, false);
      return { devCode: r.devCode, resendInSeconds: r.resendInSeconds ?? 30 };
    },
    async verifyOtp(phone, code) {
      const r = await call<{ accessToken: string; refreshToken: string; user: any; isNewUser: boolean }>(
        "POST",
        "/auth/otp/verify",
        { phone, code },
        false,
      );
      const session: Session = { token: r.accessToken, refreshToken: r.refreshToken, user: toUser(r.user) };
      saveSession(session);
      return { ...session, isNewUser: !!r.isNewUser };
    },
    current: loadSession,
    async logout() {
      const s = loadSession();
      liveCtrl?.abort();
      clearSession();
      if (s?.refreshToken) await call("POST", "/auth/logout", { refreshToken: s.refreshToken }, false).catch(() => {});
    },
  },

  catalog: {
    async airports() {
      const rows = await call<any[]>("GET", "/airports", undefined, false);
      return rows.map((a) => ({ code: a.iata, name: a.name, city: a.city }));
    },
    async places(airport) {
      return call("GET", `/places?airport=${encodeURIComponent(airport)}`, undefined, false);
    },
  },

  flights: {
    async lookup(flightNo, date, airport) {
      const q = new URLSearchParams({ date, ...(airport ? { airport } : {}) });
      return toFlight(await call("GET", `/flights/${encodeURIComponent(flightNo.replace(/\s+/g, ""))}?${q}`));
    },
  },

  me: {
    async get() {
      return toUser(await call("GET", "/me"));
    },
    async update(patch) {
      const u = toUser(await call("PATCH", "/me", patch));
      const s = loadSession();
      if (s) saveSession({ ...s, user: u });
      return u;
    },
    async stats() {
      return call("GET", "/me/stats");
    },
    async deleteAccount() {
      await call("DELETE", "/me", { confirm: "DELETE" });
      liveCtrl?.abort();
      clearSession();
    },
  },

  rides: {
    async create(input) {
      const r = await call<any>("POST", "/ride-requests", input);
      return {
        request: toRequest({ ...r.request, groupId: r.groupId }),
        flight: toFlight(r.flight),
        suggestions: r.suggestions.map(toSuggestion),
        groupId: r.groupId ?? null,
      };
    },
    async mine() {
      return (await call<any[]>("GET", "/ride-requests/mine")).map(toRequest);
    },
    async suggestions(id) {
      return (await call<any[]>("GET", `/ride-requests/${id}/suggestions`)).map(toSuggestion);
    },
    async startOwnGroup(id) {
      return toGroup(await call("POST", `/ride-requests/${id}/own-group`));
    },
    async cancel(id) {
      await call("DELETE", `/ride-requests/${id}`);
    },
  },

  groups: {
    async get(id) {
      return toGroup(await call("GET", `/groups/${id}`));
    },
    async join(id, requestId) {
      return toGroup(await call("POST", `/groups/${id}/join`, { requestId }));
    },
    async confirm(id) {
      return toGroup(await call("POST", `/groups/${id}/confirm`));
    },
    async leave(id) {
      return call("POST", `/groups/${id}/leave`);
    },
    async setPickup(id, pickupPoint) {
      return toGroup(await call("PATCH", `/groups/${id}/pickup`, { pickupPoint }));
    },
    async start(id) {
      return toGroup(await call("POST", `/groups/${id}/start`));
    },
    async complete(id) {
      return toGroup(await call("POST", `/groups/${id}/complete`));
    },
    async rate(id, ratings) {
      return toGroup(await call("POST", `/groups/${id}/ratings`, { ratings }));
    },
    async messages(id, after) {
      const q = after ? `?after=${encodeURIComponent(after)}` : "";
      return (await call<any[]>("GET", `/groups/${id}/messages${q}`)).map(toMessage);
    },
    async send(id, body) {
      return toMessage(await call("POST", `/groups/${id}/messages`, { body }));
    },
  },

  safety: {
    async report(input) {
      await call("POST", "/safety/reports", input);
    },
    async block(groupId, memberId) {
      await call("POST", "/safety/blocks", { groupId, memberId });
    },
    async blocks() {
      return (await call<any[]>("GET", "/safety/blocks")).map((b) => ({ id: b.id, name: b.name, at: b.created_at }));
    },
    async unblock(id) {
      await call("DELETE", `/safety/blocks/${id}`);
    },
    async sos(input) {
      return call("POST", "/safety/sos", input);
    },
    async share(groupId) {
      return call("POST", `/groups/${groupId}/share`);
    },
    async unshare(groupId) {
      await call("DELETE", `/groups/${groupId}/share`);
    },
    async viewShared(token) {
      return call("GET", `/share/${encodeURIComponent(token)}`, undefined, false);
    },
  },

  live: {
    subscribe(onEvent, onStatus) {
      const sub: Sub = { onEvent, onStatus };
      subs.add(sub);
      onStatus?.(liveStatus);
      if (subs.size === 1) runLive();
      return () => {
        subs.delete(sub);
        if (!subs.size) {
          liveCtrl?.abort();
          liveCtrl = null;
          liveStatus = "offline";
        }
      };
    },
  },
};
