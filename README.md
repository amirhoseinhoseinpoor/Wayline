# IoT Signal Ingestion Pipeline

A small message-driven backend that ingests location and speed readings from IoT
devices. Devices (simulated by the `producer` service) publish signals to a RabbitMQ
queue. The `backend` service consumes them, computes summary fields, stores them in
MongoDB and exposes a REST API to query them.

```
producer (NestJS) ──▶ RabbitMQ queue ──▶ backend (NestJS) ──▶ MongoDB
                                             │
                                             └── REST API  /signals
```

## Why a queue

The producer and the consumer are separate services that only share the queue, so
either side can be restarted or scaled without the other. A message is acknowledged
only after the signal has been saved, so a crash in the consumer does not lose data:
the broker redelivers the message.

## Services

| Service    | Tech                              | Role                                              |
| ---------- | --------------------------------- | ------------------------------------------------- |
| `producer` | NestJS, TypeScript, amqplib       | Publishes simulated device signals on an interval |
| `backend`  | NestJS, TypeScript, Mongoose      | Consumes the queue, stores and serves signals     |
| `rabbitmq` | RabbitMQ 3 (management UI :15672) | Message broker                                    |
| `mongo`    | MongoDB 6                         | Storage                                           |

## Message format

```json
{
  "device-1": {
    "time": 1735683480000,
    "data": [[0, [51.339764, 12.339223, 1.2]], [1000, [51.339777, 12.339211, 1.5]]]
  }
}
```

Each entry in `data` is `[offsetMs, [latitude, longitude, speed]]`. For every device
the backend stores `deviceId`, `time`, `dataLength`, `dataVolume` and the raw `data`.

## Run

Requirements: Docker.

```bash
docker compose up --build
```

- API: http://localhost:3000/signals
- RabbitMQ management UI: http://localhost:15672 (guest / guest)

To run a service without Docker, copy its `.env.example` to `.env`, then
`npm install` and `npm run start:dev` inside the service folder.

## API

| Method | Path           | Description                                               |
| ------ | -------------- | --------------------------------------------------------- |
| GET    | `/signals`     | List signals. Filters: `deviceId`, `minTime`, `maxTime`   |
| GET    | `/signals/:id` | Get one signal                                            |
| POST   | `/signals`     | Ingest a payload directly, without the queue              |
| PUT    | `/signals/:id` | Update a signal                                           |
| DELETE | `/signals/:id` | Delete a signal                                           |

## Known limitations

- The consumer retries its broker connection only at startup (5 attempts).
- Delivery is at-least-once: a redelivered message is stored twice. Making the
  consumer idempotent is the next step.
- A message that fails to process is left unacknowledged rather than routed to a
  dead-letter queue.
