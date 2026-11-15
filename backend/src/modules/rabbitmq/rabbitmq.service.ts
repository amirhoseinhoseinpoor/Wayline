import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { SignalsService } from '../signals/signals.service';

@Injectable()
export class RabbitmqService implements OnModuleInit {
  private readonly logger = new Logger(RabbitmqService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly signalsService: SignalsService,
  ) { }

  async onModuleInit() {
    const uri = this.configService.get<string>('RABBITMQ_URI');
    const queue = this.configService.get<string>('QUEUE_NAME');

    const connection = await this.connectWithRetry(uri);
    const channel = await connection.createChannel();
    await channel.assertQueue(queue);

    channel.consume(queue, async (msg) => {
      if (msg !== null) {
        try {
          const xray = JSON.parse(msg.content.toString());
          await this.signalsService.processAndSave(xray);
          channel.ack(msg);
        } catch (err) {
          this.logger.error('Failed to consume message', err);
        }
      }
    });

    this.logger.log(`Listening to RabbitMQ queue: ${queue}`);
  }

  async connectWithRetry(uri: string, retries = 5, delay = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        return await amqp.connect(uri);
      } catch (err) {
        this.logger.warn(`RabbitMQ connection failed. Retry ${i + 1}/${retries}...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
    throw new Error('Unable to connect to RabbitMQ after retries');
  }
}
