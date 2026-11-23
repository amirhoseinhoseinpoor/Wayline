// Runs inside the API container with its production dependencies and topology.
const { createRequire } = require("node:module");
const appRequire = createRequire("/app/package.json");
const amqp = appRequire("amqplib");
const { MongoClient } = appRequire("mongoose").mongo;
const {
  TELEMETRY_EXCHANGE,
  TELEMETRY_QUEUE,
  DEAD_LETTER_QUEUE,
  routingKeyFor,
} = appRequire("./dist/messaging/topology");

async function withMongo(operation) {
  const client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 1500,
    timeoutMS: 4000,
  });
  try {
    return await operation(client.db());
  } finally {
    await client.close();
  }
}

async function withBroker(operation) {
  const connection = await amqp.connect(process.env.AMQP_URL, {
    timeout: 4000,
  });
  try {
    return await operation(connection);
  } finally {
    await connection.close();
  }
}

async function publish(attempts) {
  await withBroker(async (connection) => {
    const channel = await connection.createConfirmChannel();
    const returned = new Set();
    channel.on("return", (message) =>
      returned.add(message.properties.correlationId),
    );
    for (const { attemptId, payload } of attempts) {
      console.log(JSON.stringify({ event: "sent", attemptId }));
      await new Promise((resolve, reject) => {
        channel.publish(
          TELEMETRY_EXCHANGE,
          routingKeyFor(payload.deviceId),
          Buffer.from(JSON.stringify(payload)),
          {
            mandatory: true,
            persistent: true,
            contentType: "application/json",
            messageId: payload.messageId,
            correlationId: attemptId,
          },
          (error) => {
            if (error) reject(error);
            else {
              // RabbitMQ sends basic.return before the confirm for an unroutable publish.
              const routed = !returned.has(attemptId);
              console.log(
                JSON.stringify({ event: "confirmed", attemptId, routed }),
              );
              if (routed) resolve();
              else reject(new Error(`Unroutable publish ${attemptId}`));
            }
          },
        );
      });
    }
    await channel.close();
  });
}

async function readDlq() {
  return withBroker(async (connection) => {
    const channel = await connection.createChannel();
    const items = [];
    // Leave fetched deliveries unacked so closing the channel returns them to the DLQ.
    for (let entry; (entry = await channel.get(DEAD_LETTER_QUEUE)); ) {
      const death = entry.properties.headers?.["x-death"]?.[0];
      items.push({
        messageId: entry.properties.messageId,
        attemptId: entry.properties.correlationId,
        reason: death?.reason,
        sourceQueue: death?.queue,
      });
    }
    await channel.close();
    return items;
  });
}

async function main(action, argument) {
  if (action === "publish") return publish(JSON.parse(argument));
  if (action === "dlq") return readDlq();
  if (action === "limit") {
    const broker = new URL(process.env.AMQP_URL);
    const credentials = Buffer.from(
      `${broker.username}:${broker.password}`,
    ).toString("base64");
    const response = await fetch(
      `http://${broker.hostname}:15672/api/queues/%2F/${TELEMETRY_QUEUE}`,
      {
        headers: { Authorization: `Basic ${credentials}` },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok)
      throw new Error(`RabbitMQ management returned ${response.status}`);
    const queue = await response.json();
    return queue.arguments["x-delivery-limit"];
  }
  return withMongo(async (db) => {
    if (action === "ping") return db.command({ ping: 1 });
    const batches = db.collection("telemetry_batches");
    const alerts = db.collection("alerts");
    if (action === "records") {
      return {
        batches: await batches
          .find({}, { projection: { _id: 0, messageId: 1 } })
          .toArray(),
        alerts: await alerts
          .find({}, { projection: { _id: 0, messageId: 1, type: 1 } })
          .toArray(),
      };
    }
    if (action === "indexes") {
      const hasUniqueKey = (indexes, keys) =>
        indexes.some(
          ({ unique, key }) => unique && Object.keys(key).join(",") === keys,
        );
      return (
        hasUniqueKey(await batches.indexes(), "messageId") &&
        hasUniqueKey(await alerts.indexes(), "messageId,type,detectedAt")
      );
    }
    throw new Error(`Unknown probe action ${action}`);
  });
}

main(process.argv[2], process.argv[3])
  .then((result) => {
    if (result !== undefined) console.log(JSON.stringify(result));
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
