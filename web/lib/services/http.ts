import { clearSession, loadSession, saveSession } from "./sessionStore";
import {
  ServiceError,
  type CreateRideResult,
  type FlyPoolService,
  type Group,
  type Message,
  type RideRequest,
  type Suggestion,
  type Traveller,
  type User,
} from "./types";

/**
 * Implementation of FlyPoolService for the FlyPool NestJS API (see /api).
 * ALL knowledge of the backend's URLs and JSON shape lives in this one file.
 */
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) {
    const s = loadSession();
    if (s) headers.authorization = `Bearer ${s.token}`;
  }
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ServiceError("Cannot reach the server. Check your internet or try again.");
  }
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401 && auth) {
      clearSession();
      if (typeof window !== "undefined") window.location.assign("/login");
    }
    const m = json?.message;
    throw new ServiceError(Array.isArray(m) ? m.join(", ") : (m ?? `Request failed (${res.status})`), res.status);
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

// ---------- mappers: backend JSON -> domain types ----------
const toUser = (u: any): User => ({
  id: u.id,
  phone: u.phone,
  name: u.name ?? null,
  gender: u.gender ?? null,
  verifiedLevel: u.verified_level,
  rating: Number(u.rating_avg),
  trips: u.trips_count,
});

const toTraveller = (m: any): Traveller => ({
  name: m.name ?? "Traveller",
  verifiedLevel: m.verified_level,
  rating: Number(m.rating_avg),
  trips: m.trips_count,
  flightNo: m.flight_no,
  readyAt: m.eta,
  destLabel: m.dest_label,
  confirmed: m.confirmed,
  isYou: m.isYou,
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
  womenOnly: r.womenOnly,
  status: r.status,
  estSoloFare: r.estSoloFare,
  groupId: r.groupId ?? null,
});

const toMessage = (m: any): Message => ({
  id: m.id,
  body: m.body,
  at: m.created_at,
  mine: !!m.mine,
  sender: m.sender ?? "You",
});

export const httpService: FlyPoolService = {
  name: "http",

  auth: {
    async requestOtp(phone) {
      const r = await call<{ devCode?: string }>("POST", "/auth/otp/request", { phone }, false);
      return { devCode: r.devCode };
    },
    async verifyOtp(phone, code) {
      const r = await call<{ accessToken: string; user: any }>("POST", "/auth/otp/verify", { phone, code }, false);
      const session = { token: r.accessToken, user: toUser(r.user) };
      saveSession(session);
      return session;
    },
    current: loadSession,
    logout: clearSession,
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
  },

  rides: {
    async create(input): Promise<CreateRideResult> {
      const r = await call<any>("POST", "/ride-requests", input);
      return {
        request: toRequest({ ...r.request, groupId: r.groupId }),
        flight: r.flight,
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
    async messages(id) {
      return (await call<any[]>("GET", `/groups/${id}/messages`)).map(toMessage);
    },
    async send(id, body) {
      return toMessage(await call("POST", `/groups/${id}/messages`, { body }));
    },
  },
};
