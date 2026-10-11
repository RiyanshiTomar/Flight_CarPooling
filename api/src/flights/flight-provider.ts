export interface FlightInfo {
  flightNo: string; // normalised, e.g. "6E2041"
  flightDate: string; // YYYY-MM-DD (local date of arrival)
  originIata: string | null;
  destIata: string;
  terminal: string | null;
  scheduledArrival: Date;
  estimatedArrival: Date;
  status: string; // scheduled | delayed | landed | cancelled | ...
  provider: string;
}

/**
 * Every flight-data vendor (FlightAware, Aviationstack, Cirium...) implements this.
 * Swapping vendors = one new class + FLIGHT_PROVIDER env var. Nothing else changes.
 */
export interface FlightProvider {
  readonly name: string;
  getFlight(flightNo: string, date: string, hintAirport?: string): Promise<FlightInfo | null>;
}

export const FLIGHT_PROVIDER = Symbol('FLIGHT_PROVIDER');

export function normalizeFlightNo(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}
