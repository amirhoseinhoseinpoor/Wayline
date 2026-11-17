import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DevicesController } from './devices.controller';
import { TelemetryBatch, TelemetryBatchSchema } from './telemetry-batch.schema';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TelemetryBatch.name, schema: TelemetryBatchSchema }]),
  ],
  controllers: [TelemetryController, DevicesController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
