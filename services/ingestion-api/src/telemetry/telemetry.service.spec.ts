import type { Model } from 'mongoose';
import type { AlertsService } from './alerts.service';
import type { IngestTelemetryDto } from './dto/ingest-telemetry.dto';
import type { LiveEvents } from './live-events';
import type { TelemetryBatch } from './telemetry-batch.schema';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService replay', () => {
  const original: IngestTelemetryDto = {
    messageId: 'replayed',
    deviceId: 'original-device',
    recordedAt: new Date('2026-01-01T00:00:00Z'),
    readings: [{ offsetMs: 0, lat: 52, lng: 13, speedMps: 10 }],
  };

  function replayOf(stored: IngestTelemetryDto) {
    const recordForBatch = jest.fn().mockResolvedValue([]);
    const publish = jest.fn();
    const model = {
      create: jest.fn().mockRejectedValue({ code: 11000 }),
      findOne: jest.fn().mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve({ _id: 'first', ...stored }) }),
      }),
    };

    const service = new TelemetryService(
      model as unknown as Model<TelemetryBatch>,
      { recordForBatch } as unknown as AlertsService,
      { publish } as unknown as LiveEvents,
      { overspeedMps: 33.3, maxImpliedSpeedMps: 70 },
      60_000,
    );
    return { service, recordForBatch, publish };
  }

  it('derives alerts from the original batch even when the replay payload differs', async () => {
    const { service, recordForBatch, publish } = replayOf(original);
    const result = await service.ingest({
      ...original,
      deviceId: 'different-device',
      recordedAt: new Date('2026-01-02T00:00:00Z'),
      readings: [{ ...original.readings[0], speedMps: 50 }],
    });

    expect(result).toEqual({ id: 'first', status: 'duplicate', alerts: 0 });
    expect(recordForBatch).toHaveBeenCalledWith(expect.objectContaining(original), []);
    expect(publish).not.toHaveBeenCalled();
  });

  it('allows an identical replay to complete the original alert write', async () => {
    const speeding = { ...original, readings: [{ ...original.readings[0], speedMps: 50 }] };
    const { service, recordForBatch } = replayOf(speeding);

    await expect(service.ingest(speeding)).resolves.toMatchObject({
      status: 'duplicate',
      alerts: 1,
    });
    expect(recordForBatch).toHaveBeenCalledWith(expect.objectContaining(speeding), [
      expect.objectContaining({ type: 'overspeed', value: 50 }),
    ]);
  });
});
