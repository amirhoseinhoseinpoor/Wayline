# MongoDB outage experiment

## Question

What happens to individually confirmed AMQP messages when MongoDB stops and
restarts while RabbitMQ and the ingestion consumer stay up? Does replaying a
message create duplicate records or introduce alerts from a different payload?

## Run

From the repository root, with Node.js 22 and Docker Compose v2:

```sh
node scripts/reliability/run.mjs
```

The runner creates a new Compose project with its own network, volumes and API
image, and publishes no host ports. It runs the production ingestion API,
RabbitMQ 3.13 and MongoDB 7. No simulator runs. Cleanup is scoped to this project
and runs on success and handled failures. If the process is forcibly killed or
Docker is unavailable during cleanup, use the printed project name:

```sh
docker compose -p <printed-project-name> -f compose.reliability.yml down --volumes --rmi local
```

GitHub Actions runs the existing unit/API tests and stack smoke test on PRs.
For a local API e2e run with an existing MongoDB instance, set
`WAYLINE_TEST_MONGO_URI` before running `npm run test:e2e`. The suite creates
and drops a randomly named test database on that instance.
The separate **Reliability experiment** workflow runs on PRs touching the experiment or core ingestion code. It can also
be dispatched manually and uploads the console log with the JSON report. The outage run takes several minutes.

## Production path

1. The simulator's AMQP publisher uses a confirm channel and sends persistent
   JSON to the durable `telemetry` topic exchange, keyed by `device.<deviceId>`.
   The experiment uses the same exchange and routing function from the built API,
   with a direct confirm channel, mandatory routing and an attempt-specific
   `correlationId`. A positive publisher confirm is broker evidence. The probe
   also records whether the broker returned the message as unroutable.
2. The API consumes from the quorum queue `telemetry.ingest` with prefetch 20.
   It parses and validates the payload, inserts the batch and then writes its
   alerts. It acknowledges only after that path returns successfully.
3. Invalid payloads are nacked without requeue. Processing errors are nacked
   with requeue. The queue has `x-delivery-limit=5` and the broker can route
   exhausted deliveries to `telemetry.ingest.dlq`. Retry has no scheduled delay.
4. The batch index is unique on `messageId`. The alert index is unique on
   `(messageId, type, detectedAt)`. A retry can repair an alert write after a
   batch write. On replay, the first stored payload is authoritative, including
   its device, timestamp and readings. HTTP still returns 200 with the existing
   ID for a valid duplicate. AMQP acknowledges after processing the original
   payload's alerts.

## Protocol and interpretation

- Verify both unique indexes and an active consumer. Publish two baseline
  batches and verify their writes.
- Stop the MongoDB container and verify that RabbitMQ and the API are still
  running. Publish four messages while MongoDB is stopped. Require a retry log
  naming one of those confirmed messages, then verify that MongoDB is still
  stopped and the queue still has its consumer. Hold MongoDB down for at least
  105 seconds from observed stop before requesting restart.
- Use the first successful MongoDB ping from the API container as the recovery
  clock's start. Send two new batches, replay both baseline messages verbatim,
  then resend the normal baseline ID with an overspeed payload. Stop the clock
  when polling sees the source queue drained and every confirmed ID accounted
  for in MongoDB or in the DLQ. This measures observed end-to-end settlement
  including publication of the post-recovery cohort and observation overhead.
- Check each confirmed ID against both MongoDB collections and inspect DLQ
  entries with their AMQP attempt IDs and death reasons. A valid outage message
  in the DLQ is an accounted-for failure to ingest. Inspect the JSON report for
  sent attempts, confirms, replays, records, ready and unacknowledged deliveries,
  and unexplained IDs. A missing ID, duplicate record, wrong alert or unexplained
  DLQ delivery fails the run.

## Observed run on 2026-11-22

This run used Docker Desktop on Windows with Linux containers, Docker Engine
28.3.2, Compose 2.38.2, RabbitMQ 3.13.7, MongoDB 7.0.48 and Node.js 22.
The consumer logged `Requeueing message reliability-during-1: interrupted at shutdown`
while MongoDB was stopped. The runner observed 105,159 ms from stop completion
to the restart request and 1,362 ms from the first successful MongoDB ping to
settlement. The experiment resources were removed after measurement.

| Message ID | Confirmed attempts | Batches | Alerts | DLQ reason |
| --- | --- | ---: | ---: | --- |
| `reliability-before-normal` | `before-1`, `after-3`, `after-5` | 1 | 0 | |
| `reliability-before-speed` | `before-2`, `after-4` | 1 | 1 | |
| `reliability-during-1` | `during-1` | 0 | 0 | `delivery_limit` |
| `reliability-during-2` | `during-2` | 0 | 0 | `delivery_limit` |
| `reliability-during-3` | `during-3` | 0 | 0 | `delivery_limit` |
| `reliability-during-4` | `during-4` | 0 | 0 | `delivery_limit` |
| `reliability-after-normal` | `after-1` | 1 | 0 | |
| `reliability-after-speed` | `after-2` | 1 | 1 | |

All 11 sends received publisher confirms and were routed. They covered 8 unique
IDs, 2 identical replays and 1 changed-payload replay. There were 4 stored
batches, 2 overspeed alerts, 0 duplicate batch records, 4 dead-lettered
deliveries, 0 ready or unacknowledged deliveries in the source queue, and 0
unexplained IDs. In particular, the changed-payload replay was confirmed even
though its overspeed reading produced no alert for the original normal batch.

## Scope

This is one small, deterministic workload on a single broker and database, with
a single consumer. It exercises a database stop/start and application replay.
Batch and alert writes remain separate operations. A publisher confirm precedes
consumer processing and a stored record does not directly prove a consumer ack
for a specific publish attempt. The final queue snapshot and DLQ entries are
independent observations. Dead-letter transfer uses the broker's current
configuration and durability across broker failure is outside this experiment.
The recovery measurement includes Docker command and polling latency. It is a
single observation under this setup rather than a latency distribution.
