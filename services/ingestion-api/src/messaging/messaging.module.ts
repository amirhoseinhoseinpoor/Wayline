import { Module } from '@nestjs/common';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { AMQP_CONNECTION, amqpConnectionProvider } from './amqp-connection.provider';
import { TelemetryConsumer } from './telemetry.consumer';

@Module({
  imports: [TelemetryModule],
  providers: [amqpConnectionProvider, TelemetryConsumer],
  exports: [AMQP_CONNECTION],
})
export class MessagingModule {}
