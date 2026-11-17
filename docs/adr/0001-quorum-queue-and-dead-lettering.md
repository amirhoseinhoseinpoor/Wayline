# 1. Quorum queue with a delivery limit and a dead-letter queue

- Status: accepted
- Date: 2026-11-17

## Context

Each telemetry batch is consumed from RabbitMQ and written to MongoDB. Processing
can fail in two different ways:

- **Permanent failures.** The body is not JSON, or it fails validation. Retrying
  will never help.
- **Transient failures.** For example, MongoDB is restarting. Retrying later
  will probably succeed.

If a failed message is never acknowledged, it blocks a prefetch slot until the
connection drops. If it is requeued forever, one bad message can loop endlessly
and hide real traffic.

## Decision

- `telemetry.ingest` is a **quorum queue** with `x-delivery-limit: 5` and
  `x-dead-letter-exchange: telemetry.dlx`. The dead-letter exchange routes to
  `telemetry.ingest.dlq`.
- The consumer maps every delivery to exactly one disposition in
  `message-handler.ts`:
  - stored, or a known replay: `ack`
  - permanent failure: `nack` without requeue, so the message is dead-lettered at once
  - transient failure: `nack` with requeue; after five deliveries the broker
    dead-letters it by itself
- Publishers use confirm channels, and messages are persistent.

## Consequences

- No message is lost, and none can loop forever.
- The DLQ can be inspected and replayed from the RabbitMQ management UI.
- Quorum queues are replicated, so the same design works on a multi-node cluster.
- A requeued message is redelivered right away, with no backoff. During a long
  database outage the five attempts run out quickly, and the batches land in the
  DLQ to be replayed later. A delayed retry exchange would smooth this out and
  is a possible improvement.
- Queue arguments cannot be changed in place. Changing the delivery limit needs a
  new queue, which is why the limit is a constant shared by both services.
