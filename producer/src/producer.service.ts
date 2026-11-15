import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';

type Reading = [number, [number, number, number]]; // [offsetMs, [lat, long, speed]]

@Injectable()
export class ProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProducerService.name);
  private timer?: NodeJS.Timeout;

  async onModuleInit() {
    const uri = process.env.RABBITMQ_URI ?? 'amqp://localhost:5672';
    const queue = process.env.QUEUE_NAME ?? 'telemetry_queue';
    const intervalMs = Number(process.env.PUBLISH_INTERVAL_MS ?? 5000);
    const deviceCount = Number(process.env.DEVICE_COUNT ?? 3);

    const connection = await this.connectWithRetry(uri);
    const channel = await connection.createChannel();
    await channel.assertQueue(queue);

    this.timer = setInterval(() => {
      for (let i = 1; i <= deviceCount; i++) {
        const deviceId = `device-${i}`;
        const payload = { [deviceId]: { time: Date.now(), data: this.sampleReadings() } };
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
          persistent: true,
        });
        this.logger.log(`Published signal for ${deviceId}`);
      }
    }, intervalMs);

    this.logger.log(`Publishing to RabbitMQ queue: ${queue} every ${intervalMs} ms`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Simulates a short burst of GPS readings: [offsetMs, [lat, long, speed]]. */
  private sampleReadings(count = 10): Reading[] {
    const readings: Reading[] = [];
    let lat = 51.339764;
    let long = 12.339223;
    for (let i = 0; i < count; i++) {
      lat += (Math.random() - 0.5) * 0.001;
      long += (Math.random() - 0.5) * 0.001;
      const speed = Math.round(Math.random() * 300) / 100;
      readings.push([i * 1000, [lat, long, speed]]);
    }
    return readings;
  }

  private async connectWithRetry(uri: string, retries = 10, delay = 3000) {
    for (let i = 0; i < retries; i++) {
      try {
        return await amqp.connect(uri);
      } catch {
        this.logger.warn(`RabbitMQ connection failed. Retry ${i + 1}/${retries}...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw new Error('Unable to connect to RabbitMQ after retries');
  }
}
