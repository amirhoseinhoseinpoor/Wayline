import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsInt,
  IsNumber,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const MAX_READINGS_PER_BATCH = 1000;
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export class ReadingDto {
  @ApiProperty({ example: 0, description: 'Milliseconds since `recordedAt`' })
  @IsInt()
  @Min(0)
  offsetMs: number;

  @ApiProperty({ example: 52.520008 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 13.404954 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiProperty({ example: 8.3, description: 'Ground speed in metres per second' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(150)
  speedMps: number;
}

export class IngestTelemetryDto {
  @ApiProperty({
    example: '3f1c9a4e-8d2b-4c55-9a51-0b7c2e6f1d90',
    description: 'Unique per batch. The first stored payload wins on replay.',
  })
  @IsString()
  @Length(1, 128)
  messageId: string;

  @ApiProperty({ example: 'vehicle-001' })
  @IsString()
  @Matches(DEVICE_ID_PATTERN, {
    message: 'deviceId must be 1-64 characters: letters, digits, ".", "_" or "-"',
  })
  deviceId: string;

  @ApiProperty({ example: '2026-11-17T09:30:00.000Z', type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  recordedAt: Date;

  @ApiProperty({ type: [ReadingDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_READINGS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => ReadingDto)
  readings: ReadingDto[];
}
