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
  trips: number;
}

export interface Session {
  token: string;
  user: User;
}

export interface Traveller {
  name: string;
  verifiedLevel: number;
  rating: number;
  trips: number;
  flightNo?: string;
  readyAt?: string; // ISO time the person is expected at the pickup point
  destLabel?: string;
  confirmed?: boolean;
  isYou?: boolean;
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
  soloFare: number;
  /** estimated fare per person at the current group size (or if you join, for a suggestion) */
  sharedFare: number;
  members: Traveller[];
}

export interface Suggestion {
  score: number; // 0-100
  timeGapMin: number;
  distanceKm: number;
  group: Group;
}

export interface RideRequest {
  id: string;
  flightNo: string;
  flightDate: string;
  terminal: string | null;
  readyAt: string;
  destLabel: string;
  seats: number;
  womenOnly: boolean;
  status: string;
  estSoloFare: number;
  groupId: string | null;
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
  luggage: "none" | "cabin" | "check" | "heavy";
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
}

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
    requestOtp(phone: string): Promise<{ devCode?: string }>;
    verifyOtp(phone: string, code: string): Promise<Session>;
    current(): Session | null;
    logout(): void;
  };
  catalog: {
    airports(): Promise<Airport[]>;
    places(airport: string): Promise<Place[]>;
  };
  me: {
    get(): Promise<User>;
    update(patch: { name?: string; gender?: Gender }): Promise<User>;
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
    messages(groupId: string): Promise<Message[]>;
    send(groupId: string, body: string): Promise<Message>;
  };
}
