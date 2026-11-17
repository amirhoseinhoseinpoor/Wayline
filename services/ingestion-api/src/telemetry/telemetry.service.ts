import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model } from 'mongoose';
import { computeRouteStats, sortReadings } from './domain/route-stats';
import { IngestTelemetryDto } from './dto/ingest-telemetry.dto';
import { ListTelemetryQuery } from './dto/list-telemetry.query';
import { TelemetryBatch } from './telemetry-batch.schema';

export type IngestStatus = 'created' | 'duplicate';

export interface IngestResult {
  id: string;
  status: IngestStatus;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface DeviceSummary {
  deviceId: string;
  batchCount: number;
  lastSeenAt: Date;
  totalDistanceMeters: number;
  maxSpeedMps: number;
  lastPosition: { lat: number; lng: number } | null;
}

const DUPLICATE_KEY_ERROR = 11000;

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @InjectModel(TelemetryBatch.name)
    private readonly batches: Model<TelemetryBatch>,
  ) {}

  /**
   * Stores one batch. Replaying a batch with a known `messageId` returns the
   * existing record instead of creating a second one, so callers can retry safely.
   */
  async ingest(dto: IngestTelemetryDto): Promise<IngestResult> {
    const readings = sortReadings(dto.readings).map(({ offsetMs, lat, lng, speedMps }) => ({
      offsetMs,
      lat,
      lng,
      speedMps,
    }));

    try {
      const created = await this.batches.create({
        messageId: dto.messageId,
        deviceId: dto.deviceId,
        recordedAt: dto.recordedAt,
        readings,
        stats: computeRouteStats(readings),
        payloadBytes: Buffer.byteLength(JSON.stringify(readings)),
      });
      this.logger.debug(`Stored batch ${dto.messageId} from ${dto.deviceId}`);
      return { id: created.id as string, status: 'created' };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const existing = await this.batches
        .findOne({ messageId: dto.messageId }, { _id: 1 })
        .lean()
        .exec();
      if (!existing) throw error;
      this.logger.log(`Ignored replayed batch ${dto.messageId}`);
      return { id: String(existing._id), status: 'duplicate' };
    }
  }

  async list(query: ListTelemetryQuery): Promise<Page<Omit<TelemetryBatch, 'readings'>>> {
    const filter: FilterQuery<TelemetryBatch> = {};
    if (query.deviceId) filter.deviceId = query.deviceId;
    if (query.from || query.to) {
      filter.recordedAt = {
        ...(query.from && { $gte: query.from }),
        ...(query.to && { $lte: query.to }),
      };
    }

    const [items, total] = await Promise.all([
      this.batches
        .find(filter, { readings: 0 })
        .sort({ recordedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      this.batches.countDocuments(filter).exec(),
    ]);

    return { items, page: query.page, limit: query.limit, total };
  }

  async findById(id: string): Promise<TelemetryBatch> {
    const batch = isValidObjectId(id) ? await this.batches.findById(id).lean().exec() : null;
    if (!batch) throw new NotFoundException(`Telemetry batch ${id} not found`);
    return batch;
  }

  async remove(id: string): Promise<void> {
    const deleted = isValidObjectId(id)
      ? await this.batches.findByIdAndDelete(id).lean().exec()
      : null;
    if (!deleted) throw new NotFoundException(`Telemetry batch ${id} not found`);
  }

  /** One row per device: activity totals and the most recent known position. */
  async listDevices(): Promise<DeviceSummary[]> {
    return this.batches
      .aggregate<DeviceSummary>([
        { $sort: { recordedAt: -1 } },
        {
          $group: {
            _id: '$deviceId',
            batchCount: { $sum: 1 },
            lastSeenAt: { $first: '$recordedAt' },
            totalDistanceMeters: { $sum: '$stats.distanceMeters' },
            maxSpeedMps: { $max: '$stats.maxSpeedMps' },
            lastReading: { $first: { $arrayElemAt: ['$readings', -1] } },
          },
        },
        {
          $project: {
            _id: 0,
            deviceId: '$_id',
            batchCount: 1,
            lastSeenAt: 1,
            totalDistanceMeters: { $round: ['$totalDistanceMeters', 2] },
            maxSpeedMps: 1,
            lastPosition: {
              $cond: [
                { $ifNull: ['$lastReading', false] },
                { lat: '$lastReading.lat', lng: '$lastReading.lng' },
                null,
              ],
            },
          },
        },
        { $sort: { deviceId: 1 } },
      ])
      .exec();
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === DUPLICATE_KEY_ERROR
  );
}
