import { SimulatedVehicle } from './vehicle';

/** Deterministic pseudo-random sequence (mulberry32). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const start = { lat: 52.52, lng: 13.405, headingDeg: 90, speedMps: 10 };

describe('SimulatedVehicle', () => {
  it('produces evenly spaced offsets starting at zero', () => {
    const vehicle = new SimulatedVehicle('vehicle-001', start, seeded(1));
    const batch = vehicle.sampleBatch(5, 1000);
    expect(batch.map((r) => r.offsetMs)).toEqual([0, 1000, 2000, 3000, 4000]);
  });

  it('keeps speed within physical limits', () => {
    const vehicle = new SimulatedVehicle('vehicle-001', start, seeded(2));
    const batch = vehicle.sampleBatch(500, 1000);
    for (const r of batch) {
      expect(r.speedMps).toBeGreaterThanOrEqual(0);
      expect(r.speedMps).toBeLessThanOrEqual(33);
    }
  });

  it('moves a plausible distance between readings', () => {
    const vehicle = new SimulatedVehicle('vehicle-001', start, seeded(3));
    const [a, b] = vehicle.sampleBatch(2, 1000);
    // At most ~33 m in one second: well under 0.001 degrees in either axis.
    expect(Math.abs(b.lat - a.lat)).toBeLessThan(0.001);
    expect(Math.abs(b.lng - a.lng)).toBeLessThan(0.001);
  });

  it('heads east when the heading is 90 degrees and turning is neutral', () => {
    const vehicle = new SimulatedVehicle('vehicle-001', start, () => 0.5);
    const before = vehicle.position.lng;
    vehicle.step(1000);
    expect(vehicle.position.lng).toBeGreaterThan(before);
    expect(vehicle.position.lat).toBeCloseTo(start.lat, 6);
  });

  it('continues from where the previous batch ended', () => {
    const vehicle = new SimulatedVehicle('vehicle-001', start, seeded(4));
    const first = vehicle.sampleBatch(3, 1000);
    const second = vehicle.sampleBatch(3, 1000);
    expect(second[0].lat).toBe(first[2].lat);
    expect(second[0].lng).toBe(first[2].lng);
  });
});
