import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { FlightInfo, FlightProvider, normalizeFlightNo } from './flight-provider';

/**
 * FlightAware AeroAPI v4 (https://www.flightaware.com/aeroapi/portal/documentation).
 * Needs AEROAPI_KEY. Billing is per query, which is why FlightsService caches results.
 *
 * NOTE: field names below follow the v4 `/flights/{ident}` response. Verify them against the
 * current docs when you enable this provider, and adjust `toInfo` if FlightAware changed anything.
 */
@Injectable()
export class AeroApiProvider implements FlightProvider {
  readonly name = 'aeroapi';
  private readonly log = new Logger('AeroApi');
  private readonly base = 'https://aeroapi.flightaware.com/aeroapi';

  async getFlight(flightNo: string, date: string): Promise<FlightInfo | null> {
    const key = process.env.AEROAPI_KEY;
    if (!key) throw new ServiceUnavailableException('AEROAPI_KEY is not configured');
    const ident = normalizeFlightNo(flightNo);

    // window: the whole local day (IST) of the requested date
    const start = new Date(`${date}T00:00:00+05:30`).toISOString();
    const end = new Date(`${date}T23:59:59+05:30`).toISOString();
    const url = `${this.base}/flights/${encodeURIComponent(ident)}?start=${start}&end=${end}`;

    const res = await fetch(url, { headers: { 'x-apikey': key, Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) {
      this.log.error(`AeroAPI ${res.status}`);
      throw new ServiceUnavailableException('Flight data provider error');
    }
    const body = (await res.json()) as { flights?: any[] };
    const f = body.flights?.find((x) => x.destination?.code_iata) ?? body.flights?.[0];
    return f ? this.toInfo(ident, date, f) : null;
  }

  private toInfo(ident: string, date: string, f: any): FlightInfo {
    const sched = new Date(f.scheduled_in ?? f.scheduled_on);
    const est = new Date(f.estimated_in ?? f.estimated_on ?? f.actual_in ?? f.scheduled_in);
    return {
      flightNo: ident,
      flightDate: date,
      originIata: f.origin?.code_iata ?? null,
      destIata: f.destination?.code_iata,
      terminal: f.terminal_destination ? `T${f.terminal_destination}`.replace(/^TT/, 'T') : null,
      scheduledArrival: sched,
      estimatedArrival: est,
      status: String(f.status ?? 'scheduled').toLowerCase(),
      provider: this.name,
    };
  }
}
