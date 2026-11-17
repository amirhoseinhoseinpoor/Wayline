import type { ConfigService } from '@nestjs/config';
import type { AmqpConnectionManager } from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';
import type { TelemetryService } from '../telemetry/telemetry.service';
import { TelemetryConsumer } from './telemetry.consumer';

const message = (content: unknown): ConsumeMessage =>
  ({
    content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)),
    properties: { messageId: 'm-1' },
    fields: {},
  }) as unknown as ConsumeMessage;

const valid = {
  messageId: 'm-1',
  deviceId: 'vehicle-001',
  recordedAt: '2026-11-17T09:30:00.000Z',
  readings: [{ offsetMs: 0, lat: 52.52, lng: 13.405, speedMps: 3 }],
};

describe('TelemetryConsumer.handle', () => {
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const ingest = jest.fn();
  const consumer = new TelemetryConsumer(
    {} as AmqpConnectionManager,
    { ingest } as unknown as TelemetryService,
    {} as ConfigService,
  );

  beforeEach(() => jest.resetAllMocks());

  it('acks after a successful ingest', async () => {
    ingest.mockResolvedValue({ id: 'x', status: 'created' });
    const msg = message(valid);
    await consumer.handle(channel, msg);

    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('dead-letters a malformed message without requeueing it', async () => {
    const msg = message('garbage');
    await consumer.handle(channel, msg);

    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('requeues when storage fails, leaving the delivery limit to the broker', async () => {
    ingest.mockRejectedValue(new Error('mongo down'));
    const msg = message(valid);
    await consumer.handle(channel, msg);

    expect(channel.nack).toHaveBeenCalledWith(msg, false, true);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
