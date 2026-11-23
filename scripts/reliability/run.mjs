import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const project = `wayline-reliability-${randomUUID().slice(0, 12)}`;
const ingestQueue = "telemetry.ingest";
const deadLetterQueue = "telemetry.ingest.dlq";
const outageMs = 105_000;

const attempts = [];
const sent = new Set();
const confirmed = new Map();
let interrupted;
let mongoReadyAt;
let drainedAt;
let outageEvidence;
let deliveryLimit;
let mongoStoppedAt;
let actualOutageMs;
let failure;
let queues;
let records;
let dlq;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = signal;
  });
}

function compose(args, timeout = 15_000) {
  return exec(
    "docker",
    ["compose", "-p", project, "-f", "compose.reliability.yml", ...args],
    { cwd: root, timeout, maxBuffer: 4 * 1024 * 1024 },
  );
}

function probeCommand(action, argument = []) {
  return [
    "exec",
    "-T",
    "ingestion-api",
    "node",
    "/experiment/probe.cjs",
    action,
    ...argument,
  ];
}

async function probe(action) {
  const { stdout } = await compose(probeCommand(action));
  return JSON.parse(stdout);
}

async function readQueues() {
  const { stdout } = await compose([
    "exec",
    "-T",
    "rabbitmq",
    "rabbitmqctl",
    "-q",
    "list_queues",
    "name",
    "messages_ready",
    "messages_unacknowledged",
    "consumers",
    "--formatter",
    "json",
    "--timeout",
    "8",
  ]);
  const rows = JSON.parse(stdout);
  return {
    ingest: rows.find(({ name }) => name === ingestQueue),
    dlq: rows.find(({ name }) => name === deadLetterQueue),
  };
}

async function waitFor(description, timeout, condition) {
  const until = performance.now() + timeout;
  let lastError;
  while (performance.now() < until) {
    if (interrupted) throw new Error(`Interrupted by ${interrupted}`);
    try {
      const value = await condition();
      if (value && performance.now() <= until) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${description}`, { cause: lastError });
}

async function waitForDrain() {
  return waitFor(
    "an active consumer with zero ready and unacknowledged deliveries",
    90_000,
    async () => {
      const { ingest } = await readQueues();
      return (
        ingest?.consumers === 1 &&
        ingest.messages_ready === 0 &&
        ingest.messages_unacknowledged === 0 &&
        performance.now()
      );
    },
  );
}

function message(id, speedMps = 12) {
  return {
    messageId: `reliability-${id}`,
    deviceId: "reliability-truck",
    recordedAt: "2026-01-01T00:00:00.000Z",
    readings: [{ offsetMs: 0, lat: 52, lng: 13, speedMps }],
  };
}

const before = [message("before-normal"), message("before-speed", 50)];
const during = [
  message("during-1"),
  message("during-2", 50),
  message("during-3"),
  message("during-4"),
];
const after = [message("after-normal"), message("after-speed", 50)];

async function publish(phase, payloads) {
  const batch = payloads.map((payload, index) => ({
    phase,
    payload,
    attemptId: `${phase}-${index + 1}`,
  }));
  attempts.push(...batch);
  const result = await compose(
    probeCommand("publish", [JSON.stringify(batch)]),
    30_000,
  ).catch((error) => error);
  for (const line of (result.stdout ?? "").trim().split("\n").filter(Boolean)) {
    const event = JSON.parse(line);
    if (event.event === "sent") sent.add(event.attemptId);
    if (event.event === "confirmed") {
      confirmed.set(event.attemptId, event.routed);
      console.log(
        JSON.stringify({
          ...event,
          messageId: batch.find((a) => a.attemptId === event.attemptId).payload
            .messageId,
        }),
      );
    }
  }
  if (result instanceof Error) throw result;
  if (batch.some(({ attemptId }) => confirmed.get(attemptId) !== true)) {
    throw new Error(`Missing routed publisher confirm in phase ${phase}`);
  }
}

async function verifyMongoStopped() {
  const { stdout } = await compose(["ps", "--status", "running", "--services"]);
  const running = stdout.trim().split(/\s+/);
  if (
    running.includes("mongo") ||
    !running.includes("ingestion-api") ||
    !running.includes("rabbitmq")
  ) {
    throw new Error(
      `Expected MongoDB stopped with API and broker running. Running: ${running.join(", ")}`,
    );
  }
}

async function run() {
  console.log(`Starting isolated Compose project ${project}`);
  const { stderr } = await compose(
    ["up", "--build", "--detach", "--wait", "--wait-timeout", "180"],
    600_000,
  );
  if (stderr) process.stderr.write(stderr);
  await waitFor("both unique indexes", 60_000, () => probe("indexes"));
  await waitFor("the telemetry consumer", 60_000, async () => {
    const snapshot = await readQueues();
    return snapshot.ingest?.consumers === 1 && snapshot.dlq && snapshot;
  });
  deliveryLimit = await waitFor(
    "the queue declaration in RabbitMQ management",
    30_000,
    () => probe("limit"),
  );
  if (deliveryLimit !== 5) {
    throw new Error(
      "Experiment expected the current broker delivery limit of five",
    );
  }

  await publish("before", before);
  await waitForDrain();
  const first = await probe("records");
  if (
    first.batches.length !== 2 ||
    first.alerts.length !== 1 ||
    !before.every(({ messageId }) =>
      first.batches.some((row) => row.messageId === messageId),
    ) ||
    first.alerts[0].messageId !== before[1].messageId
  ) {
    throw new Error("Baseline writes did not match the before-outage fixtures");
  }

  await compose(["stop", "--timeout", "10", "mongo"], 25_000);
  mongoStoppedAt = performance.now();
  await verifyMongoStopped();
  console.log("MongoDB stopped. RabbitMQ and the API are still running.");
  await publish("during", during);
  outageEvidence = await waitFor(
    "a retry for a confirmed outage message while MongoDB is stopped",
    40_000,
    async () => {
      const { stdout } = await compose(["logs", "--no-color", "ingestion-api"]);
      const retry = stdout
        .split("\n")
        .find((line) =>
          during.some(({ messageId }) =>
            line.includes(`Requeueing message ${messageId}:`),
          ),
        );
      if (!retry) return false;
      await verifyMongoStopped();
      const { ingest } = await readQueues();
      return ingest?.consumers === 1 && retry.trim();
    },
  );
  console.log(outageEvidence);
  await sleep(Math.max(0, outageMs - (performance.now() - mongoStoppedAt)));
  if (interrupted) throw new Error(`Interrupted by ${interrupted}`);
  await verifyMongoStopped();
  actualOutageMs = Math.round(performance.now() - mongoStoppedAt);
  await compose(["start", "mongo"], 25_000);
  mongoReadyAt = await waitFor(
    "a successful MongoDB ping from the API container",
    60_000,
    async () => {
      const result = await probe("ping");
      return result.ok === 1 && performance.now();
    },
  );
  console.log(
    "MongoDB ping succeeded. Sending the post-outage messages and replays.",
  );
  await publish("after", [...after, ...before, message("before-normal", 50)]);
  drainedAt = await waitFor(
    "all confirmed IDs accounted for and the source queue drained",
    90_000,
    async () => {
      queues = await readQueues();
      if (
        queues.ingest?.consumers !== 1 ||
        queues.ingest.messages_ready !== 0 ||
        queues.ingest.messages_unacknowledged !== 0
      )
        return false;
      [records, dlq] = await Promise.all([probe("records"), probe("dlq")]);
      return report().unexplainedIds.length === 0 && performance.now();
    },
  );
}

function report() {
  const unique = new Map();
  for (const { attemptId, phase, payload } of attempts) {
    if (!confirmed.has(attemptId)) continue;
    const { messageId } = payload;
    if (!unique.has(messageId)) {
      unique.set(messageId, {
        messageId,
        phase,
        expectedAlertsIfStored: Number(payload.readings[0].speedMps > 33.3),
        confirmedAttempts: [],
      });
    }
    unique
      .get(messageId)
      .confirmedAttempts.push({ attemptId, routed: confirmed.get(attemptId) });
  }

  const perId = Array.from(unique.values(), (row) => ({
    ...row,
    batches:
      records?.batches.filter((item) => item.messageId === row.messageId)
        .length ?? null,
    alertTypes:
      records?.alerts
        .filter((item) => item.messageId === row.messageId)
        .map(({ type }) => type) ?? null,
    deadLetters:
      dlq?.filter((item) => item.messageId === row.messageId) ?? null,
  }));
  const unexplained = perId.filter(
    (row) => !row.batches && !row.deadLetters?.length,
  );
  const ready = queues?.ingest?.messages_ready ?? null;
  const unacknowledged = queues?.ingest?.messages_unacknowledged ?? null;
  const storedIds = new Set(records?.batches.map((row) => row.messageId));
  const expectedDlq = ({ messageId, attemptId, sourceQueue, reason }) => {
    const original = perId.find((row) => row.messageId === messageId);
    return (
      original?.phase === "during" &&
      original.confirmedAttempts.some(
        (attempt) => attempt.attemptId === attemptId,
      ) &&
      sourceQueue === ingestQueue &&
      reason === "delivery_limit"
    );
  };
  const valid = Boolean(
    !failure &&
      records &&
      dlq &&
      ready === 0 &&
      unacknowledged === 0 &&
      confirmed.size === 11 &&
      unique.size === 8 &&
      unexplained.length === 0 &&
      [...records.batches, ...records.alerts].every(({ messageId }) =>
        unique.has(messageId),
      ) &&
      dlq.every(expectedDlq) &&
      new Set(dlq.map(({ attemptId }) => attemptId)).size === dlq.length &&
      perId.every(
        (row) =>
          row.batches === Number(storedIds.has(row.messageId)) &&
          (row.phase === "during" || row.batches === 1) &&
          row.alertTypes.length === row.batches * row.expectedAlertsIfStored &&
          row.alertTypes.every((type) => type === "overspeed") &&
          !(row.batches && row.deadLetters.length),
      ),
  );

  return {
    project,
    valid,
    failure: failure?.message ?? null,
    deliveryLimit: deliveryLimit ?? null,
    plannedOutageMs: outageMs,
    outageBeforeRestartMs: actualOutageMs ?? null,
    outageEvidence: outageEvidence ?? null,
    recoveryMs: valid ? Math.round(drainedAt - mongoReadyAt) : null,
    attemptsSent: sent.size,
    publisherConfirms: confirmed.size,
    uniqueConfirmedIds: unique.size,
    repeatedConfirmedAttempts: confirmed.size - unique.size,
    identicalReplayConfirms: ["after-3", "after-4"].filter((id) =>
      confirmed.has(id),
    ).length,
    changedPayloadReplayConfirms: Number(confirmed.has("after-5")),
    storedBatches: records?.batches.length ?? null,
    storedAlerts: records?.alerts.length ?? null,
    duplicateBatchRecords: records
      ? records.batches.length - storedIds.size
      : null,
    dlqMessages: dlq?.length ?? null,
    ready,
    unacknowledged,
    unexplainedIds: unexplained.map(({ messageId }) => messageId),
    perId: perId.map((row) => ({
      ...row,
      alerts: row.alertTypes?.length ?? null,
    })),
  };
}

try {
  await run();
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  if (failure) {
    for (const [key, read] of [
      ["queues", readQueues],
      ["records", () => probe("records")],
      ["dlq", () => probe("dlq")],
    ]) {
      try {
        const result = await read();
        if (key === "queues") queues = result;
        if (key === "records") records = result;
        if (key === "dlq") dlq = result;
      } catch (error) {
        console.error(`Could not read ${key}: ${error.message}`);
      }
    }
  }
  try {
    await compose(
      ["down", "--volumes", "--rmi", "local", "--timeout", "10"],
      90_000,
    );
  } catch (error) {
    failure ??= error;
    console.error(`Cleanup failed for project ${project}: ${error.message}`);
  }
  const result = report();
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}
