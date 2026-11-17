import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { DEVICE_ID_PATTERN } from './ingest-telemetry.dto';

export class ListTelemetryQuery {
  @ApiPropertyOptional({ example: 'vehicle-001' })
  @IsOptional()
  @Matches(DEVICE_ID_PATTERN)
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'Inclusive lower bound on `recordedAt`',
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound on `recordedAt`',
    format: 'date-time',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
