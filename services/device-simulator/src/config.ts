export interface SimulatorConfig {
  amqpUrl: string;
  /** Number of simulated vehicles. */
  deviceCount: number;
  /** How often each vehicle publishes a batch. */
  publishIntervalMs: number;
  /** Readings per batch; they are spaced evenly across the publish interval. */
  readingsPerBatch: number;
  /** Where vehicles start, roughly: a point plus a random offset of up to ~2 km. */
  originLat: number;
  originLng: number;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min = 1): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}, got "${raw}"`);
  }
  return value;
}

function decimal(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SimulatorConfig {
  return {
    amqpUrl: env.AMQP_URL || 'amqp://localhost:5672',
    deviceCount: integer(env, 'DEVICE_COUNT', 5),
    publishIntervalMs: integer(env, 'PUBLISH_INTERVAL_MS', 5000, 100),
    readingsPerBatch: integer(env, 'READINGS_PER_BATCH', 5),
    originLat: decimal(env, 'ORIGIN_LAT', 52.520008),
    originLng: decimal(env, 'ORIGIN_LNG', 13.404954),
  };
}
