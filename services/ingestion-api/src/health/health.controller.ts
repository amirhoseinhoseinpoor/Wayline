import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { Connection, ConnectionStates } from 'mongoose';
import { AMQP_CONNECTION } from '../messaging/amqp-connection.provider';

type Status = 'up' | 'down';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    @Inject(AMQP_CONNECTION) private readonly amqp: AmqpConnectionManager,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: the process is running' })
  live() {
    return { status: 'up' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: MongoDB and RabbitMQ are reachable (503 otherwise)' })
  ready() {
    const checks: Record<string, Status> = {
      mongo: this.mongo.readyState === ConnectionStates.connected ? 'up' : 'down',
      rabbitmq: this.amqp.isConnected() ? 'up' : 'down',
    };
    const healthy = Object.values(checks).every((s) => s === 'up');
    const body = { status: healthy ? 'up' : 'down', checks };
    if (!healthy) throw new ServiceUnavailableException(body);
    return body;
  }
}
