import { clearSession, loadSession, saveSession } from "./sessionStore";
import {
  ServiceError,
  type BlockedUser,
  type FlyPoolService,
  type Group,
  type LiveEvent,
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
 * Turn it on with NEXT_PUBLIC_DATA_SOURCE=mock.
 */
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

const AIRPORTS = [
  { code: "DEL", name: "Indira Gandhi International Airport", city: "Delhi" },
  { code: "BLR", name: "Kempegowda International Airport", city: "Bengaluru" },
];

const PLACES: Record<string, [string, number][]> = {
  DEL: [["Gurugram - Cyber Hub", 920], ["Gurugram - DLF Phase 3", 910], ["Noida - Sector 62", 880], ["Connaught Place", 560], ["Dwarka Sector 21", 420], ["Saket", 520]],
  BLR: [["Whitefield", 1200], ["Koramangala", 1400], ["Indiranagar", 1300], ["Electronic City", 1700], ["HSR Layout", 1500], ["MG Road", 1250]],
};
const share = (solo: number, people: number) => Math.round((solo * 1.1) / Math.max(1, people) / 10) * 10;

let seq = 0;
const id = (p: string) => `${p}${++seq}`;
const person = (name: string, level = 1, rating = 4.8, trips = 6): Traveller => ({
  memberId: id("mem"), name, verifiedLevel: level, rating, ratingCount: trips, trips, confirmed: false,
});
const iso = (h: number, m: number) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const groups = new Map<string, Group>([
  ["g1", { id: "g1", status: "OPEN", terminal: "T3", pickupPoint: "T3 Arrivals, Pillar 6", windowStart: iso(18, 50), windowEnd: iso(19, 20),
    womenOnly: false, seatsTaken: 3, seatsLeft: 1, soloFare: 920, sharedFare: 250, members: [person("Aarav", 2), person("Meera", 3, 4.9, 22), person("Rohan", 1, 4.5, 3)] }],
  ["g2", { id: "g2", status: "OPEN", terminal: "T3", pickupPoint: "T3 Arrivals, Pillar 9", windowStart: iso(19, 35), windowEnd: iso(19, 40),
    womenOnly: false, seatsTaken: 2, seatsLeft: 2, soloFare: 880, sharedFare: 320, members: [person("Sana", 2, 4.9, 9), person("Kabir")] }],
]);
const chats = new Map<string, Message[]>([
  ["g1", [
    { id: "m1", body: "Hi all! I land 18:35, will be at Pillar 6 by 18:55.", at: iso(18, 2), mine: false, sender: "Meera" },
    { id: "m2", body: "Cool, I'm already landed. Will wait near Costa Coffee.", at: iso(18, 4), mine: false, sender: "Aarav" },
  ]],
]);
const rides: RideRequest[] = [];
const blocks: BlockedUser[] = [];
const listeners = new Set<(e: LiveEvent) => void>();
let me: User | null = null;

function requireSession() {
  const s = loadSession();
  if (!s) throw new ServiceError("Please log in", 401);
  return s;
}
const clone = <T>(x: T): T => structuredClone(x);
const you = (): Traveller => ({ memberId: "me", name: me?.name?.split(" ")[0] ?? "You", verifiedLevel: 1, rating: 5, trips: me?.trips ?? 0, isYou: true, confirmed: false });
const getGroup = (gid: string) => {
  const g = groups.get(gid);
  if (!g) throw new ServiceError("Group not found", 404);
  return g;
};
const sys = (gid: string, body: string) => chats.set(gid, [...(chats.get(gid) ?? []), { id: id("m"), body, at: new Date().toISOString(), mine: false, sender: "FlyPool", system: true }]);
const emit = (e: LiveEvent) => setTimeout(() => listeners.forEach((l) => l(e)), 50);
function setRideStatus(gid: string, status: RideRequest["status"]) {
  rides.filter((r) => r.groupId === gid).forEach((r) => { r.status = status; r.groupStatus = getGroup(gid).status; });
}
function ownGroup(r: RideRequest): Group {
  const g: Group = { id: id("g-own-"), status: "OPEN", terminal: "T3", pickupPoint: "T3 Arrivals, Pillar 6", windowStart: r.readyAt, windowEnd: r.readyAt,
    womenOnly: r.womenOnly, seatsTaken: r.seats, seatsLeft: 4 - r.seats, soloFare: r.estSoloFare, sharedFare: share(r.estSoloFare, r.seats),
    members: [you()], myRequestId: r.id };
  groups.set(g.id, g);
  r.groupId = g.id;
  r.groupStatus = "OPEN";
  return g;
}
function suggest(r: RideRequest): Suggestion[] {
  if (r.womenOnly) return [];
  return [...groups.values()]
    .filter((g) => g.status === "OPEN" && g.seatsLeft >= r.seats && !g.members.some((m) => m.isYou) && !g.members.some((m) => blocks.some((b) => b.name === m.name)))
    .map((g, i) => ({ score: 94 - i * 12, timeGapMin: 10 * (i + 1), distanceKm: 1.2 + i, group: { ...clone(g), soloFare: r.estSoloFare, sharedFare: share(g.soloFare, g.seatsTaken + r.seats) } }));
}

export const mockService: FlyPoolService = {
  name: "mock",

  auth: {
    async requestOtp() {
      await wait();
      return { devCode: "123456", resendInSeconds: 30 };
    },
    async verifyOtp(phone, code) {
      await wait();
      if (code !== "123456") throw new ServiceError("Incorrect code. Use 123456 in demo mode.", 400);
      me = me ?? { id: "me", phone: `+91${phone}`, name: null, gender: null, verifiedLevel: 1, rating: 5, ratingCount: 0, trips: 0, trustedContactName: null, trustedContactPhone: null };
      const s = { token: "mock-token", refreshToken: "mock-refresh", user: me };
      saveSession(s);
      return { ...s, isNewUser: !me.name };
    },
    current: loadSession,
    async logout() {
      clearSession();
    },
  },

  catalog: {
    async airports() {
      await wait(100);
      return AIRPORTS;
    },
    async places(airport): Promise<Place[]> {
      await wait(100);
      return (PLACES[airport] ?? []).map(([label, fare]) => ({ id: `${airport}:${label}`, label, estSoloFare: fare, estSharedFare: share(fare, 3), airport }));
    },
  },

  flights: {
    async lookup(flightNo, date, airport = "DEL") {
      requireSession();
      await wait(300);
      const no = flightNo.replace(/\s+/g, "").toUpperCase();
      if (!/^[A-Z0-9]{2}\d{1,4}$/.test(no)) throw new ServiceError(`No flight ${no} found on ${date}`, 404);
      const h = [...no].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 900;
      const t = new Date(`${date}T${String(8 + Math.floor(h / 60) % 14).padStart(2, "0")}:${String(h % 60).padStart(2, "0")}:00+05:30`).toISOString();
      return { flightNo: no, origin: "BOM", destination: airport, terminal: "T3", scheduledArrival: t, estimatedArrival: t, status: "scheduled" };
    },
  },

  me: {
    async get() {
      requireSession();
      return clone(me ?? loadSession()!.user);
    },
    async update(patch) {
      const s = requireSession();
      me = { ...(me ?? s.user), ...patch } as User;
      if (patch.trustedContactPhone !== undefined) me.trustedContactPhone = patch.trustedContactPhone ? `+91${patch.trustedContactPhone.replace(/\D/g, "").slice(-10)}` : null;
      saveSession({ ...s, user: me });
      return clone(me);
    },
    async stats() {
      requireSession();
      const done = rides.filter((r) => r.status === "COMPLETED");
      return { tripsCompleted: done.length, savedApprox: done.length * 540, coTravellers: done.length * 2, rating: me?.rating ?? 5, ratingCount: me?.ratingCount ?? 0 };
    },
    async deleteAccount() {
      me = null;
      clearSession();
    },
  },

  rides: {
    async create(input) {
      requireSession();
      await wait(500);
      if (!me?.name) throw new ServiceError("Add your name to your profile first", 400);
      const flight = await mockService.flights.lookup(input.flightNo, input.date, input.airport);
      const [label, fare] = PLACES[input.airport]?.find(([l]) => `${input.airport}:${l}` === input.destPlaceId) ?? ["Gurugram - Cyber Hub", 920];
      const request: RideRequest = {
        id: id("r"), flightNo: flight.flightNo, flightDate: input.date, terminal: "T3", readyAt: new Date(new Date(flight.estimatedArrival).getTime() + 30 * 60_000).toISOString(),
        destLabel: label, seats: input.seats, luggage: input.luggage, womenOnly: input.womenOnly, status: "PENDING", estSoloFare: fare, groupId: null,
      };
      rides.unshift(request);
      const suggestions = suggest(request);
      if (!suggestions.length) ownGroup(request);
      return { request: clone(request), flight, suggestions, groupId: request.groupId };
    },
    async mine() {
      requireSession();
      await wait(150);
      return clone(rides);
    },
    async suggestions(rid) {
      requireSession();
      await wait(250);
      const r = rides.find((x) => x.id === rid);
      if (!r) throw new ServiceError("Ride request not found", 404);
      return ["PENDING", "MATCHED"].includes(r.status) ? suggest(r) : [];
    },
    async startOwnGroup(rid) {
      requireSession();
      const r = rides.find((x) => x.id === rid);
      if (!r) throw new ServiceError("Ride request not found", 404);
      return clone(ownGroup(r));
    },
    async cancel(rid) {
      requireSession();
      const r = rides.find((x) => x.id === rid);
      if (!r) throw new ServiceError("Active ride request not found", 404);
      r.status = "CANCELLED";
      if (r.groupId) {
        const g = getGroup(r.groupId);
        g.members = g.members.filter((m) => !m.isYou);
        if (!g.members.length) g.status = "CANCELLED";
      }
    },
  },

  groups: {
    async get(gid) {
      requireSession();
      await wait(150);
      return clone(getGroup(gid));
    },
    async join(gid, requestId) {
      requireSession();
      await wait(300);
      const g = getGroup(gid);
      const r = rides.find((x) => x.id === requestId);
      if (!r) throw new ServiceError("Ride request not found", 404);
      if (g.status !== "OPEN") throw new ServiceError("This group is no longer open. Pick another one.", 409);
      if (r.groupId && r.groupId !== gid) groups.delete(r.groupId);
      g.members.push(you());
      g.seatsTaken += r.seats;
      g.seatsLeft -= r.seats;
      g.soloFare = r.estSoloFare;
      g.sharedFare = share(g.soloFare, g.seatsTaken);
      g.myRequestId = r.id;
      r.groupId = gid;
      r.status = "MATCHED";
      r.groupStatus = "OPEN";
      sys(gid, `${you().name} joined the group.`);
      // demo: the others confirm a few seconds later
      setTimeout(() => {
        g.members.forEach((m) => { if (!m.isYou) m.confirmed = true; });
        sys(gid, "Meera confirmed.");
        emit({ type: "group.updated", groupId: gid, note: "Others confirmed. Your turn!" });
        emit({ type: "message.created", groupId: gid });
      }, 4000);
      return clone(g);
    },
    async confirm(gid) {
      requireSession();
      const g = getGroup(gid);
      g.members.forEach((m) => { if (m.isYou) m.confirmed = true; });
      if (g.members.length >= 2 && g.members.every((m) => m.confirmed)) {
        g.status = "CONFIRMED";
        setRideStatus(gid, "CONFIRMED");
        sys(gid, "Everyone has confirmed. Meet at the pickup point and book one cab together.");
      }
      return clone(g);
    },
    async leave(gid) {
      requireSession();
      const g = getGroup(gid);
      if (!["OPEN", "CONFIRMED"].includes(g.status)) throw new ServiceError("You cannot leave a trip that has started or ended", 400);
      g.members = g.members.filter((m) => !m.isYou);
      const r = rides.find((x) => x.groupId === gid)!;
      return { newGroupId: ownGroup(r).id };
    },
    async setPickup(gid, pickupPoint) {
      const g = getGroup(gid);
      g.pickupPoint = pickupPoint;
      sys(gid, `${you().name} changed the pickup point to "${pickupPoint}".`);
      return clone(g);
    },
    async start(gid) {
      const g = getGroup(gid);
      if (g.status !== "CONFIRMED") throw new ServiceError("Everyone has to confirm before the ride starts", 400);
      g.status = "IN_TRIP";
      g.startedAt = new Date().toISOString();
      setRideStatus(gid, "IN_TRIP");
      sys(gid, `${you().name} started the ride. Have a safe trip!`);
      return clone(g);
    },
    async complete(gid) {
      const g = getGroup(gid);
      if (g.status !== "IN_TRIP") throw new ServiceError("Start the ride first", 400);
      g.status = "COMPLETED";
      g.completedAt = new Date().toISOString();
      setRideStatus(gid, "COMPLETED");
      if (me) me.trips += 1;
      sys(gid, "Ride completed. Please rate your co-travellers, it keeps FlyPool safe.");
      return clone(g);
    },
    async rate(gid, ratings) {
      const g = getGroup(gid);
      ratings.forEach((r) => { const m = g.members.find((x) => x.memberId === r.memberId); if (m) m.ratedByYou = true; });
      return clone(g);
    },
    async messages(gid, after) {
      requireSession();
      const all = chats.get(gid) ?? [];
      return clone(after ? all.filter((m) => m.at > after) : all);
    },
    async send(gid, body) {
      requireSession();
      const m: Message = { id: id("m"), body, at: new Date().toISOString(), mine: true, sender: "You" };
      chats.set(gid, [...(chats.get(gid) ?? []), m]);
      return m;
    },
  },

  safety: {
    async report() {
      await wait(300);
    },
    async block(gid, memberId) {
      const m = getGroup(gid).members.find((x) => x.memberId === memberId);
      if (m) blocks.push({ id: id("b"), name: m.name, at: new Date().toISOString() });
    },
    async blocks() {
      return clone(blocks);
    },
    async unblock(bid) {
      const i = blocks.findIndex((b) => b.id === bid);
      if (i >= 0) blocks.splice(i, 1);
    },
    async sos() {
      await wait(400);
      return { contactNotified: !!me?.trustedContactPhone, contactName: me?.trustedContactName ?? null, hasTrustedContact: !!me?.trustedContactPhone, emergencyNumber: "112", shareUrl: null };
    },
    async share(gid) {
      return { token: `demo-${gid}`, url: `${typeof window !== "undefined" ? window.location.origin : ""}/share/demo-${gid}`, expiresAt: iso(23, 0) };
    },
    async unshare() {},
    async viewShared(token) {
      const g = groups.get(token.replace(/^demo-/, "")) ?? groups.get("g1")!;
      return {
        sharer: me?.name?.split(" ")[0] ?? "Aarav", airport: { code: "DEL", city: "Delhi" }, status: g.status, terminal: g.terminal, pickupPoint: g.pickupPoint,
        windowStart: g.windowStart, windowEnd: g.windowEnd, startedAt: g.startedAt ?? null, completedAt: g.completedAt ?? null, flightNo: "6E2041",
        destination: "Gurugram - Cyber Hub", expiresAt: iso(23, 0),
        members: g.members.map((m) => ({ name: m.name, verifiedLevel: m.verifiedLevel, rating: m.rating, trips: m.trips, isSharer: !!m.isYou })),
      };
    },
  },

  live: {
    subscribe(onEvent, onStatus) {
      listeners.add(onEvent);
      onStatus?.("live");
      return () => listeners.delete(onEvent);
    },
  },
};
