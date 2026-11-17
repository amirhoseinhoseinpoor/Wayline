# 3. One telemetry document per batch

- Status: accepted
- Date: 2026-11-17

## Context

Devices send readings in batches, typically 5 to 60 readings covering a few
seconds to a minute. Readings could be stored one document per reading or one
document per batch.

## Decision

Store **one document per batch**:

- the raw readings, sorted by `offsetMs`
- route statistics computed at ingest time: distance, duration, max and average speed
- `payloadBytes`, for capacity planning

Indexes: `{ deviceId: 1, recordedAt: -1 }` for per-device timelines, and
`{ recordedAt: -1 }` for fleet-wide queries.

## Consequences

- There is one write per message, and idempotency maps naturally onto the batch.
- List queries leave out `readings` through a projection, so pages stay small.
- Per-device aggregates (`/devices`) are computed from the precomputed stats
  instead of from raw points.
- Queries over individual points, such as "where was the vehicle at 10:02:13",
  have to unwind the batch. If that becomes a main access pattern, a MongoDB
  time-series collection of single readings can be added alongside.
