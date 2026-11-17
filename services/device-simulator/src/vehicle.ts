export interface Reading {
  offsetMs: number;
  lat: number;
  lng: number;
  speedMps: number;
}

export interface VehicleState {
  lat: number;
  lng: number;
  /** Degrees clockwise from north. */
  headingDeg: number;
  speedMps: number;
}

/** Returns a float in [0, 1). Injected so tests can be deterministic. */
export type Random = () => number;

const METERS_PER_DEGREE_LAT = 111_320;
const MAX_SPEED_MPS = 33; // ~120 km/h
const MAX_ACCELERATION_MPS2 = 2.5;
const MAX_TURN_DEG_PER_S = 15;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A simple kinematic model of a road vehicle: speed and heading drift
 * gradually, and position follows from them, so consecutive readings
 * form a plausible route instead of random noise.
 */
export class SimulatedVehicle {
  private state: VehicleState;

  constructor(
    readonly deviceId: string,
    start: VehicleState,
    private readonly random: Random = Math.random,
  ) {
    this.state = { ...start };
  }

  get position(): Readonly<VehicleState> {
    return this.state;
  }

  /** Advances the model by `dtMs` and returns the new state. */
  step(dtMs: number): Readonly<VehicleState> {
    const dt = dtMs / 1000;
    const accel = (this.random() * 2 - 1) * MAX_ACCELERATION_MPS2;
    const turn = (this.random() * 2 - 1) * MAX_TURN_DEG_PER_S;

    const speedMps = clamp(this.state.speedMps + accel * dt, 0, MAX_SPEED_MPS);
    const headingDeg = (((this.state.headingDeg + turn * dt) % 360) + 360) % 360;
    const distance = speedMps * dt;
    const heading = (headingDeg * Math.PI) / 180;

    const lat = this.state.lat + (distance * Math.cos(heading)) / METERS_PER_DEGREE_LAT;
    const lng =
      this.state.lng +
      (distance * Math.sin(heading)) /
        (METERS_PER_DEGREE_LAT * Math.cos((this.state.lat * Math.PI) / 180));

    this.state = { lat, lng, headingDeg, speedMps };
    return this.state;
  }

  /** Samples `count` readings `intervalMs` apart, starting at the current position. */
  sampleBatch(count: number, intervalMs: number): Reading[] {
    const readings: Reading[] = [];
    for (let i = 0; i < count; i++) {
      const { lat, lng, speedMps } = i === 0 ? this.state : this.step(intervalMs);
      readings.push({
        offsetMs: i * intervalMs,
        lat: round(lat, 6),
        lng: round(lng, 6),
        speedMps: round(speedMps, 2),
      });
    }
    return readings;
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
