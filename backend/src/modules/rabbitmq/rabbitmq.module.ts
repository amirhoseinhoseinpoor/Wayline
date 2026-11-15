import { Module } from '@nestjs/common';
import { RabbitmqService } from './rabbitmq.service';
import { SignalsModule } from '../signals/signals.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule, SignalsModule],
  providers: [RabbitmqService],
})
export class RabbitmqModule {}
