import { loadSession, saveSession, clearSession } from "./sessionStore";
import {
  ServiceError,
  type CreateRideResult,
  type FlyPoolService,
  type Group,
  type Message,
  type Place,
  type RideRequest,
  type Suggestion,
  type Traveller,
  type User,
} from "./types";

/**
 * Offline implementation of FlyPoolService: no backend needed, state lives in memory.
 * Useful for UI work, demos, and as a second reference implementation of the contract.
 */
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

const AIRPORTS = [
  { code: "DEL", name: "Indira Gandhi International Airport", city: "Delhi" },
  { code: "BLR", name: "Kempegowda International Airport", city: "Bengaluru" },
];

const PLACES: Record<string, string[]> = {
  DEL: ["Gurugram - Cyber Hub", "Gurugram - DLF Phase 3", "Noida - Sector 62", "Connaught Place", "Dwarka Sector 21", "Saket"],
  BLR: ["Whitefield", "Koramangala", "Indiranagar", "Electronic City", "HSR Layout", "MG Road"],
};

const person = (name: string, level = 1, rating = 4.8, trips = 6): Traveller => ({ name, verifiedLevel: level, rating, trips });
const iso = (h: number, m: number) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const groups = new Map<string, Group>([
  ["g1", { id: "g1", status: "OPEN", terminal: "T3", pickupPoint: "T3 Arrivals, Pillar 6", windowStart: iso(18, 50), windowEnd: iso(19, 20),
    womenOnly: false, seatsTaken: 3, seatsLeft: 1, soloFare: 920, sharedFare: 310, members: [person("Aarav", 2), person("Meera", 3, 4.9, 22), person("Rohan", 1, 4.5, 3)] }],
  ["g2", { id: "g2", status: "OPEN", terminal: "T3", pickupPoint: "T3 Arrivals, Pillar 9", windowStart: iso(19, 35), windowEnd: iso(19, 40),
    womenOnly: false, seatsTaken: 2, seatsLeft: 2, soloFare: 880, sharedFare: 340, members: [person("Sana", 2, 4.9, 9), person("Kabir")] }],
]);
const chats = new Map<string, Message[]>([
  ["g1", [
    { id: "m1", body: "Hi all! I land 18:35, will be at Pillar 6 by 18:55.", at: iso(18, 2), mine: false, sender: "Meera" },
    { id: "m2", body: "Cool, I'm already landed. Will wait near Costa Coffee.", at: iso(18, 4), mine: false, sender: "Aarav" },
  ]],
]);
const rides: RideRequest[] = [];
let me: User | null = null;
let seq = 0;

function requireSession() {
  const s = loadSession();
  if (!s) throw new ServiceError("Please log in", 401);
  return s;
}

const clone = <T>(x: T): T => structuredClone(x);

export const mockService: FlyPoolService = {
  name: "mock",

  auth: {
    async requestOtp() {
      await wait();
      return { devCode: "123456" };
    },
    async verifyOtp(phone, code) {
      await wait();
      if (code.length !== 6) throw new ServiceError("Incorrect code", 400);
      me = me ?? { id: "me", phone: `+91${phone}`, name: null, gender: null, verifiedLevel: 1, rating: 5, trips: 0 };
      const s = { token: "mock-token", user: me };
      saveSession(s);
      return s;
    },
    current: loadSession,
    logout: clearSession,
  },

  catalog: {
    async airports() {
      await wait(100);
      return AIRPORTS;
    },
    async places(airport): Promise<Place[]> {
      await wait(100);
      return (PLACES[airport] ?? []).map((label) => ({ id: `${airport}:${label}`, label, estSoloFare: 900, airport }));
    },
  },

  me: {
    async get() {
      requireSession();
      return clone(me ?? loadSession()!.user);
    },
    async update(patch) {
      const s = requireSession();
      me = { ...(me ?? s.user), ...patch };
      saveSession({ ...s, user: me });
      return clone(me);
    },
  },

  rides: {
    async create(input): Promise<CreateRideResult> {
      requireSession();
      await wait(500);
      if (!/^[A-Za-z0-9]{2}\s?\d{1,4}$/.test(input.flightNo)) throw new ServiceError("flightNo looks like 6E 2041", 400);
      const label = input.destPlaceId.split(":")[1] ?? "Gurugram - Cyber Hub";
      const request: RideRequest = {
        id: `r${++seq}`, flightNo: input.flightNo.toUpperCase(), flightDate: input.date, terminal: "T3", readyAt: iso(18, 50),
        destLabel: label, seats: input.seats, womenOnly: input.womenOnly, status: "PENDING", estSoloFare: 900, groupId: null,
      };
      const suggestions: Suggestion[] = input.womenOnly
        ? []
        : [...groups.values()].filter((g) => g.seatsLeft >= input.seats).map((g, i) => ({
            score: 94 - i * 12, timeGapMin: 10 * (i + 1), distanceKm: 1.2 + i, group: clone(g),
          }));
      if (!suggestions.length) {
        const g: Group = { id: `g-own-${seq}`, status: "OPEN", terminal: "T3", pickupPoint: "T3 Arrivals, Pillar 6", windowStart: request.readyAt,
          windowEnd: request.readyAt, womenOnly: input.womenOnly, seatsTaken: input.seats, seatsLeft: 4 - input.seats, soloFare: 900, sharedFare: 990,
          members: [{ name: "You", verifiedLevel: 1, rating: 5, trips: 0, isYou: true, confirmed: false }] };
        groups.set(g.id, g);
        request.groupId = g.id;
      }
      rides.unshift(request);
      return {
        request: clone(request),
        flight: { flightNo: request.flightNo, origin: "BOM", destination: input.airport, terminal: "T3", scheduledArrival: iso(18, 20), estimatedArrival: iso(18, 20), status: "scheduled" },
        suggestions,
        groupId: request.groupId,
      };
    },
    async mine() {
      requireSession();
      await wait(150);
      return clone(rides);
    },
    async suggestions(id) {
      requireSession();
      await wait(250);
      const r = rides.find((x) => x.id === id);
      if (!r) throw new ServiceError("Ride request not found", 404);
      if (r.groupId) return [];
      return [...groups.values()].filter((g) => g.seatsLeft >= r.seats).map((g, i) => ({ score: 94 - i * 12, timeGapMin: 10 * (i + 1), distanceKm: 1.2 + i, group: clone(g) }));
    },
    async startOwnGroup(id) {
      requireSession();
      const r = rides.find((x) => x.id === id);
      if (!r) throw new ServiceError("Ride request not found", 404);
      const g: Group = { id: `g-own-${++seq}`, status: "OPEN", terminal: "T3", pickupPoint: "T3 Arrivals, Pillar 6", windowStart: r.readyAt, windowEnd: r.readyAt,
        womenOnly: r.womenOnly, seatsTaken: r.seats, seatsLeft: 4 - r.seats, soloFare: r.estSoloFare, sharedFare: 990,
        members: [{ name: "You", verifiedLevel: 1, rating: 5, trips: 0, isYou: true, confirmed: false }] };
      groups.set(g.id, g);
      r.groupId = g.id;
      return clone(g);
    },
    async cancel(id) {
      requireSession();
      const r = rides.find((x) => x.id === id);
      if (r) r.status = "CANCELLED";
    },
  },

  groups: {
    async get(id) {
      requireSession();
      await wait(150);
      const g = groups.get(id);
      if (!g) throw new ServiceError("Group not found", 404);
      return clone(g);
    },
    async join(id, requestId) {
      requireSession();
      await wait(300);
      const g = groups.get(id);
      const r = rides.find((x) => x.id === requestId);
      if (!g || !r) throw new ServiceError("Group not found", 404);
      g.members.push({ name: "You", verifiedLevel: 1, rating: 5, trips: 0, isYou: true, confirmed: false });
      g.seatsTaken += r.seats;
      g.seatsLeft -= r.seats;
      g.sharedFare = Math.round((g.soloFare * 1.1) / g.seatsTaken / 10) * 10;
      r.groupId = id;
      r.status = "MATCHED";
      return clone(g);
    },
    async confirm(id) {
      requireSession();
      const g = groups.get(id);
      if (!g) throw new ServiceError("Group not found", 404);
      g.members.forEach((m) => { if (m.isYou) m.confirmed = true; });
      return clone(g);
    },
    async messages(id) {
      requireSession();
      return clone(chats.get(id) ?? []);
    },
    async send(id, body) {
      requireSession();
      const m: Message = { id: `m${Date.now()}`, body, at: new Date().toISOString(), mine: true, sender: "You" };
      chats.set(id, [...(chats.get(id) ?? []), m]);
      return m;
    },
  },
};
