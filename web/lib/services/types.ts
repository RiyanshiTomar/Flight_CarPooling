/**
 * THE CONTRACT between the website and any backend.
 *
 * Pages and components import ONLY from here and from `@/lib/services` (the `service` object).
 * They never call fetch() or know the backend's JSON shape. To use a different backend,
 * implement `FlyPoolService` once and point `lib/services/index.ts` at it.
 */

export interface Airport {
  code: string;
  name: string;
  city: string;
}

export interface Place {
  id: string;
  label: string;
  estSoloFare: number;
  /** rough per-person fare when the cab is full */
  estSharedFare: number;
  airport: string;
}

export type Gender = "female" | "male" | "other";

export interface User {
  id: string;
  phone: string;
  name: string | null;
  gender: Gender | null;
  verifiedLevel: number;
  rating: number;
  ratingCount: number;
  trips: number;
  trustedContactName: string | null;
  trustedContactPhone: string | null;
}

export interface UserStats {
  tripsCompleted: number;
  savedApprox: number;
  coTravellers: number;
  rating: number;
  ratingCount: number;
}

export interface Session {
  token: string;
  refreshToken?: string;
  user: User;
}

export interface Traveller {
  /** stable id of this person within the group (used to rate, report or block) */
  memberId?: string;
  name: string;
  verifiedLevel: number;
  rating: number;
  ratingCount?: number;
  trips: number;
  flightNo?: string;
  readyAt?: string; // ISO time the person is expected at the pickup point
  destLabel?: string;
  seats?: number;
  confirmed?: boolean;
  isYou?: boolean;
  ratedByYou?: boolean;
}

export type GroupStatus = "OPEN" | "CONFIRMED" | "IN_TRIP" | "COMPLETED" | "CANCELLED";

export interface Group {
  id: string;
  status: GroupStatus;
  terminal: string | null;
  pickupPoint: string;
  windowStart: string;
  windowEnd: string;
  womenOnly: boolean;
  seatsTaken: number;
  seatsLeft: number;
  /** what YOU would pay riding alone */
  soloFare: number;
  /** estimated fare per person at the current group size (or if you join, for a suggestion) */
  sharedFare: number;
  members: Traveller[];
  myRequestId?: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface Suggestion {
  score: number; // 0-100
  timeGapMin: number;
  distanceKm: number;
  group: Group;
}

export type RideStatus = "PENDING" | "MATCHED" | "CONFIRMED" | "IN_TRIP" | "COMPLETED" | "CANCELLED" | "EXPIRED";
export type Luggage = "none" | "cabin" | "check" | "heavy";

export interface RideRequest {
  id: string;
  flightNo: string;
  flightDate: string;
  terminal: string | null;
  readyAt: string;
  destLabel: string;
  seats: number;
  luggage?: Luggage;
  womenOnly: boolean;
  status: RideStatus;
  estSoloFare: number;
  groupId: string | null;
  groupStatus?: GroupStatus | null;
  groupSize?: number | null;
  pickupPoint?: string | null;
}

export interface FlightInfo {
  flightNo: string;
  origin: string | null;
  destination: string;
  terminal: string | null;
  scheduledArrival: string;
  estimatedArrival: string;
  status: string;
}

export interface CreateRideInput {
  flightNo: string;
  date: string; // YYYY-MM-DD
  destPlaceId: string;
  seats: number;
  luggage: Luggage;
  womenOnly: boolean;
  airport: string;
}

export interface CreateRideResult {
  request: RideRequest;
  flight: FlightInfo;
  suggestions: Suggestion[];
  /** set when nobody was compatible and a group of one was opened for you */
  groupId: string | null;
}

export interface Message {
  id: string;
  body: string;
  at: string;
  mine: boolean;
  sender: string;
  system?: boolean;
}

export type ReportReason = "no_show" | "rude" | "unsafe" | "harassment" | "fake_profile" | "payment" | "other";

export interface BlockedUser {
  id: string;
  name: string;
  at: string;
}

export interface ShareLink {
  url: string;
  token: string;
  expiresAt: string;
}

export interface SharedTrip {
  sharer: string;
  airport: { code: string; city: string };
  status: GroupStatus;
  terminal: string | null;
  pickupPoint: string;
  windowStart: string;
  windowEnd: string;
  startedAt: string | null;
  completedAt: string | null;
  flightNo: string | null;
  destination: string | null;
  expiresAt: string;
  members: { name: string; verifiedLevel: number; rating: number; trips: number; isSharer: boolean }[];
}

export interface SosResult {
  contactNotified: boolean;
  contactName: string | null;
  hasTrustedContact: boolean;
  emergencyNumber: string;
  shareUrl: string | null;
}

/** Live events pushed by the backend. They carry ids only; re-read what changed. */
export interface LiveEvent {
  type: "group.updated" | "message.created" | "request.updated" | "flight.updated";
  groupId?: string;
  requestId?: string;
  note?: string;
}
export type LiveStatus = "connecting" | "live" | "offline";

/** Thrown by every implementation so the UI can show one consistent error. */
export class ServiceError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface FlyPoolService {
  /** Human label, shown nowhere important, handy for debugging ("http", "mock") */
  readonly name: string;

  auth: {
    requestOtp(phone: string): Promise<{ devCode?: string; resendInSeconds: number }>;
    verifyOtp(phone: string, code: string): Promise<Session & { isNewUser: boolean }>;
    current(): Session | null;
    logout(): Promise<void>;
  };
  catalog: {
    airports(): Promise<Airport[]>;
    places(airport: string): Promise<Place[]>;
  };
  flights: {
    lookup(flightNo: string, date: string, airport?: string): Promise<FlightInfo>;
  };
  me: {
    get(): Promise<User>;
    update(patch: { name?: string; gender?: Gender; trustedContactName?: string; trustedContactPhone?: string }): Promise<User>;
    stats(): Promise<UserStats>;
    deleteAccount(): Promise<void>;
  };
  rides: {
    create(input: CreateRideInput): Promise<CreateRideResult>;
    mine(): Promise<RideRequest[]>;
    suggestions(requestId: string): Promise<Suggestion[]>;
    startOwnGroup(requestId: string): Promise<Group>;
    cancel(requestId: string): Promise<void>;
  };
  groups: {
    get(groupId: string): Promise<Group>;
    join(groupId: string, requestId: string): Promise<Group>;
    confirm(groupId: string): Promise<Group>;
    leave(groupId: string): Promise<{ newGroupId: string }>;
    setPickup(groupId: string, pickupPoint: string): Promise<Group>;
    start(groupId: string): Promise<Group>;
    complete(groupId: string): Promise<Group>;
    rate(groupId: string, ratings: { memberId: string; score: number; comment?: string }[]): Promise<Group>;
    /** pass `after` (ISO time of the last message you have) to fetch only newer ones */
    messages(groupId: string, after?: string): Promise<Message[]>;
    send(groupId: string, body: string): Promise<Message>;
  };
  safety: {
    report(input: { groupId: string; memberId: string; reason: ReportReason; details?: string; block?: boolean }): Promise<void>;
    block(groupId: string, memberId: string): Promise<void>;
    blocks(): Promise<BlockedUser[]>;
    unblock(blockId: string): Promise<void>;
    sos(input: { groupId?: string; lat?: number; lng?: number }): Promise<SosResult>;
    share(groupId: string): Promise<ShareLink>;
    unshare(groupId: string): Promise<void>;
    /** public, no login needed */
    viewShared(token: string): Promise<SharedTrip>;
  };
  live: {
    /** Subscribe to live events for the logged-in user. Returns an unsubscribe function. */
    subscribe(onEvent: (e: LiveEvent) => void, onStatus?: (s: LiveStatus) => void): () => void;
  };
}
