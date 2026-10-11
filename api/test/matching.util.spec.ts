import { gapToWindowMin, haversineKm, matchScore, perPersonFare } from '../src/matching/matching.util';

describe('matching.util', () => {
  it('haversine: Delhi IGI to Cyber Hub is roughly 17-20 km', () => {
    const d = haversineKm({ lat: 28.5562, lng: 77.1 }, { lat: 28.495, lng: 77.089 });
    expect(d).toBeGreaterThan(6);
    expect(d).toBeLessThan(25);
  });

  it('scores perfect pair 100 and rejects incompatible pairs', () => {
    expect(matchScore(0, 0)).toBe(100);
    expect(matchScore(41, 1)).toBeNull();
    expect(matchScore(10, 5.1)).toBeNull();
    expect(matchScore(40, 5)).toBe(40);
  });

  it('time gap to a window is 0 inside it', () => {
    const s = new Date('2026-01-01T10:00:00Z');
    const e = new Date('2026-01-01T11:00:00Z');
    expect(gapToWindowMin(new Date('2026-01-01T10:30:00Z'), s, e)).toBe(0);
    expect(gapToWindowMin(new Date('2026-01-01T11:20:00Z'), s, e)).toBe(20);
    expect(gapToWindowMin(new Date('2026-01-01T09:45:00Z'), s, e)).toBe(15);
  });

  it('fare split gets cheaper as more people share', () => {
    expect(perPersonFare(920, 3)).toBe(340);
    expect(perPersonFare(920, 1)).toBeGreaterThan(perPersonFare(920, 2));
  });
});
