import { computeRouteStats, haversineMeters, Reading } from './route-stats';

const reading = (offsetMs: number, lat: number, lng: number, speedMps = 0): Reading => ({
  offsetMs,
  lat,
  lng,
  speedMps,
});

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineMeters({ lat: 52.52, lng: 13.405 }, { lat: 52.52, lng: 13.405 })).toBe(0);
  });

  it('measures one degree of latitude as roughly 111 km', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('matches a known city-to-city distance (Berlin to Hamburg, ~255 km)', () => {
    const d = haversineMeters({ lat: 52.52, lng: 13.405 }, { lat: 53.5511, lng: 9.9937 });
    expect(d / 1000).toBeCloseTo(255.4, 0);
  });
});

describe('computeRouteStats', () => {
  it('throws on an empty batch', () => {
    expect(() => computeRouteStats([])).toThrow(RangeError);
  });

  it('handles a single reading', () => {
    expect(computeRouteStats([reading(0, 52.52, 13.405, 4)])).toEqual({
      readingCount: 1,
      durationMs: 0,
      distanceMeters: 0,
      maxSpeedMps: 4,
      avgSpeedMps: 4,
    });
  });

  it('sums distance, duration and speed over the batch', () => {
    const stats = computeRouteStats([
      reading(0, 0, 0, 2),
      reading(1000, 0.001, 0, 4),
      reading(2000, 0.002, 0, 6),
    ]);

    expect(stats.readingCount).toBe(3);
    expect(stats.durationMs).toBe(2000);
    expect(stats.distanceMeters).toBeCloseTo(222.39, 1);
    expect(stats.maxSpeedMps).toBe(6);
    expect(stats.avgSpeedMps).toBe(4);
  });

  it('orders readings by offset before measuring distance', () => {
    const inOrder = computeRouteStats([
      reading(0, 0, 0),
      reading(1000, 0.001, 0),
      reading(2000, 0.002, 0),
    ]);
    const shuffled = computeRouteStats([
      reading(2000, 0.002, 0),
      reading(0, 0, 0),
      reading(1000, 0.001, 0),
    ]);

    expect(shuffled).toEqual(inOrder);
  });
});
