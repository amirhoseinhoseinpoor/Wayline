import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

export class Environment {
  @IsString()
  MONGO_URI: string;

  @IsString()
  AMQP_URL: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  /** Unacknowledged messages a single consumer may hold at once. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  AMQP_PREFETCH: number = 20;
}

/** Fails fast at startup with every missing or malformed variable listed. */
export function validateEnvironment(config: Record<string, unknown>): Environment {
  const env = plainToInstance(Environment, config, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return env;
}
