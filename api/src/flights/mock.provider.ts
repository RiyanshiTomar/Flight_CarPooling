import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { FlightInfo, FlightProvider, normalizeFlightNo } from './flight-provider';

/**
 * Deterministic fake flights for development and tests. Needs no API key.
 * The same flight number + date always gives the same arrival time, so two test users
 * on "6E 2041" really are on the same flight.
 */
@Injectable()
export class MockFlightProvider implements FlightProvider {
  readonly name = 'mock';

  async getFlight(flightNo: string, date: string, hintAirport?: string): Promise<FlightInfo | null> {
    const no = normalizeFlightNo(flightNo);
    if (!/^[A-Z0-9]{2}\d{1,4}$/.test(no)) return null;
    const h = createHash('sha256').update(no + date).digest();
    const minutes = 6 * 60 + (h[0] * 256 + h[1]) % (17 * 60); // 06:00 - 23:00 local
    const delay = h[2] % 4 === 0 ? 10 + (h[3] % 40) : 0; // a quarter of flights run late
    const dest = hintAirport === 'BLR' ? 'BLR' : 'DEL';
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    const scheduled = new Date(`${date}T${hh}:${mm}:00+05:30`);
    return {
      flightNo: no,
      flightDate: date,
      originIata: ['BOM', 'HYD', 'CCU', 'MAA', 'PNQ'][h[4] % 5],
      destIata: dest,
      terminal: dest === 'DEL' ? (no.startsWith('6E') || no.startsWith('AI') || no.startsWith('UK') ? 'T3' : 'T2') : 'T1',
      scheduledArrival: scheduled,
      estimatedArrival: new Date(scheduled.getTime() + delay * 60_000),
      status: delay ? 'delayed' : 'scheduled',
      provider: this.name,
    };
  }
}
