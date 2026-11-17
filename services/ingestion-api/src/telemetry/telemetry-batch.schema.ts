import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false, versionKey: false })
export class ReadingRecord {
  @Prop({ required: true }) offsetMs: number;
  @Prop({ required: true }) lat: number;
  @Prop({ required: true }) lng: number;
  @Prop({ required: true }) speedMps: number;
}
const ReadingRecordSchema = SchemaFactory.createForClass(ReadingRecord);

@Schema({ _id: false, versionKey: false })
export class RouteStatsRecord {
  @Prop({ required: true }) readingCount: number;
  @Prop({ required: true }) durationMs: number;
  @Prop({ required: true }) distanceMeters: number;
  @Prop({ required: true }) maxSpeedMps: number;
  @Prop({ required: true }) avgSpeedMps: number;
}
const RouteStatsRecordSchema = SchemaFactory.createForClass(RouteStatsRecord);

@Schema({
  collection: 'telemetry_batches',
  versionKey: false,
  timestamps: { createdAt: 'ingestedAt', updatedAt: false },
})
export class TelemetryBatch {
  /** Idempotency key supplied by the device; a unique index rejects replays. */
  @Prop({ required: true, unique: true }) messageId: string;
  @Prop({ required: true }) deviceId: string;
  @Prop({ required: true }) recordedAt: Date;
  @Prop({ type: [ReadingRecordSchema], required: true }) readings: ReadingRecord[];
  @Prop({ type: RouteStatsRecordSchema, required: true }) stats: RouteStatsRecord;
  /** Size of the serialised readings, useful for capacity planning. */
  @Prop({ required: true }) payloadBytes: number;
  ingestedAt: Date;
}

export type TelemetryBatchDocument = HydratedDocument<TelemetryBatch>;

export const TelemetryBatchSchema = SchemaFactory.createForClass(TelemetryBatch);

// Serves the main access pattern: one device's batches, newest first, within a time range.
TelemetryBatchSchema.index({ deviceId: 1, recordedAt: -1 });
TelemetryBatchSchema.index({ recordedAt: -1 });
