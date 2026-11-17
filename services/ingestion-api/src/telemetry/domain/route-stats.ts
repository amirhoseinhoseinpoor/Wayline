/** A single GPS sample, relative to the start of its batch. */
export interface Reading {
  /** Milliseconds since the batch's `recordedAt` timestamp. */
  offsetMs: number;
  lat: number;
  lng: number;
  /** Ground speed reported by the device, in metres per second. */
  speedMps: number;
}

export interface RouteStats {
  readingCount: number;
  durationMs: number;
  /** Great-circle distance travelled between consecutive readings. */
  distanceMeters: number;
  maxSpeedMps: number;
  avgSpeedMps: number;
}

const EARTH_RADIUS_METERS = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Haversine distance between two coordinates, in metres. */
export function haversineMeters(
  a: Pick<Reading, 'lat' | 'lng'>,
  b: Pick<Reading, 'lat' | 'lng'>,
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Readings ordered by their offset; devices may deliver them out of order. */
export function sortReadings<T extends Reading>(readings: readonly T[]): T[] {
  return [...readings].sort((x, y) => x.offsetMs - y.offsetMs);
}

/** Summarises a batch of readings. Expects at least one reading. */
export function computeRouteStats(readings: readonly Reading[]): RouteStats {
  if (readings.length === 0) {
    throw new RangeError('computeRouteStats requires at least one reading');
  }

  const ordered = sortReadings(readings);
  let distanceMeters = 0;
  let maxSpeedMps = 0;
  let speedSum = 0;

  ordered.forEach((reading, index) => {
    if (index > 0) distanceMeters += haversineMeters(ordered[index - 1], reading);
    maxSpeedMps = Math.max(maxSpeedMps, reading.speedMps);
    speedSum += reading.speedMps;
  });

  return {
    readingCount: ordered.length,
    durationMs: ordered[ordered.length - 1].offsetMs - ordered[0].offsetMs,
    distanceMeters: round(distanceMeters, 2),
    maxSpeedMps: round(maxSpeedMps, 2),
    avgSpeedMps: round(speedSum / ordered.length, 2),
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
