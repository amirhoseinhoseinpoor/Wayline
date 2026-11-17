import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { AmqpConnectionManager, ChannelWrapper, connect } from 'amqp-connection-manager';
import type { Channel } from 'amqplib';
import { randomUUID } from 'node:crypto';
import type { SimulatorConfig } from './config';
import { assertTopology, routingKeyFor, TELEMETRY_EXCHANGE } from './topology';
import { SimulatedVehicle } from './vehicle';

export const SIMULATOR_CONFIG = Symbol('SIMULATOR_CONFIG');

export interface TelemetryMessage {
  messageId: string;
  deviceId: string;
  recordedAt: string;
  readings: ReturnType<SimulatedVehicle['sampleBatch']>;
}

/**
 * Drives a small fleet of simulated vehicles and publishes one telemetry batch
 * per vehicle per interval. Publishing uses confirm channels, so a batch counts
 * as sent only once the broker has accepted it; while the broker is away,
 * amqp-connection-manager buffers messages and reconnects.
 */
@Injectable()
export class SimulatorService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SimulatorService.name);
  private readonly vehicles: SimulatedVehicle[];
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;
  private timer?: NodeJS.Timeout;

  constructor(@Inject(SIMULATOR_CONFIG) private readonly config: SimulatorConfig) {
    this.vehicles = Array.from({ length: config.deviceCount }, (_, i) => {
      const deviceId = `vehicle-${String(i + 1).padStart(3, '0')}`;
      return new SimulatedVehicle(deviceId, {
        lat: config.originLat + (Math.random() - 0.5) * 0.04,
        lng: config.originLng + (Math.random() - 0.5) * 0.06,
        headingDeg: Math.random() * 360,
        speedMps: 5 + Math.random() * 10,
      });
    });
  }

  onApplicationBootstrap() {
    this.connection = connect([this.config.amqpUrl], { reconnectTimeInSeconds: 5 });
    this.connection.on('connect', () => this.logger.log('Connected to RabbitMQ'));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`Disconnected from RabbitMQ: ${err?.message ?? 'unknown reason'}`),
    );

    this.channel = this.connection.createChannel({
      json: false,
      setup: (channel: Channel) => assertTopology(channel),
    });

    this.timer = setInterval(() => void this.publishAll(), this.config.publishIntervalMs);
    this.logger.log(
      `Simulating ${this.vehicles.length} vehicles, one batch each every ${this.config.publishIntervalMs} ms`,
    );
  }

  buildMessage(vehicle: SimulatedVehicle, now = new Date()): TelemetryMessage {
    const intervalMs = Math.floor(this.config.publishIntervalMs / this.config.readingsPerBatch);
    return {
      messageId: randomUUID(),
      deviceId: vehicle.deviceId,
      recordedAt: now.toISOString(),
      readings: vehicle.sampleBatch(this.config.readingsPerBatch, intervalMs),
    };
  }

  private async publishAll(): Promise<void> {
    const channel = this.channel;
    if (!channel) return;

    await Promise.all(
      this.vehicles.map(async (vehicle) => {
        const message = this.buildMessage(vehicle);
        try {
          await channel.publish(
            TELEMETRY_EXCHANGE,
            routingKeyFor(vehicle.deviceId),
            Buffer.from(JSON.stringify(message)),
            {
              persistent: true,
              contentType: 'application/json',
              messageId: message.messageId,
              timestamp: Math.floor(Date.now() / 1000),
            },
          );
          this.logger.debug(`Published ${message.messageId} for ${vehicle.deviceId}`);
        } catch (error) {
          this.logger.error(
            `Publish failed for ${vehicle.deviceId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.channel?.close();
    await this.connection?.close();
  }
}
