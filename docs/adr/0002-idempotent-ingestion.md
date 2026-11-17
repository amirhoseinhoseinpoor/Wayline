# 2. Idempotent ingestion keyed on `messageId`

- Status: accepted
- Date: 2026-11-17

## Context

Acknowledging only after a successful write means delivery is *at least once*.
If the consumer crashes after the write but before the ack, the broker delivers
the batch again. Devices that retry over HTTP after a timeout cause the same
problem. Without protection, both cases store duplicate data and inflate
distance totals.

## Decision

- Every batch carries a client-generated `messageId` (a UUID in the simulator).
- `telemetry_batches.messageId` has a **unique index**.
- On a duplicate-key error (`11000`), the service looks up the existing document
  and reports `status: "duplicate"`. The consumer acks it, and HTTP returns `200`
  instead of `201`.

## Consequences

- Storage is effectively exactly once, without distributed transactions.
- The unique index is enforced by the database, so it also holds under concurrent
  consumers. A read-then-write check in application code would not.
- Clients must generate unique ids. If a client reuses an id for different data,
  the second batch is silently treated as a replay. This is documented in the API
  contract.
