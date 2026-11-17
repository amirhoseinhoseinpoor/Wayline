import type { Channel } from 'amqplib';

/**
 * Broker topology shared by every service that talks to RabbitMQ. Declarations
 * are idempotent, so whichever service starts first creates them.
 *
 * Keep the declarations below in sync with `services/ingestion-api/src/messaging/topology.ts`:
 * RabbitMQ refuses to redeclare a queue with different arguments.
 */
export const TELEMETRY_EXCHANGE = 'telemetry';
export const TELEMETRY_QUEUE = 'telemetry.ingest';
export const DEAD_LETTER_EXCHANGE = 'telemetry.dlx';
export const DEAD_LETTER_QUEUE = 'telemetry.ingest.dlq';

/** Deliveries a message gets before the broker dead-letters it. */
export const DELIVERY_LIMIT = 5;

export const routingKeyFor = (deviceId: string) => `device.${deviceId}`;

export async function assertTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(TELEMETRY_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', { durable: true });

  await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, '');

  // A quorum queue is replicated and counts redeliveries, which lets the broker
  // move a message that keeps failing to the dead-letter queue on its own.
  await channel.assertQueue(TELEMETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-delivery-limit': DELIVERY_LIMIT,
      'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE,
    },
  });
  await channel.bindQueue(TELEMETRY_QUEUE, TELEMETRY_EXCHANGE, 'device.#');
}
