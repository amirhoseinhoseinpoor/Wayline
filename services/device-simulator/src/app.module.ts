import { Module } from '@nestjs/common';
import { loadConfig } from './config';
import { SIMULATOR_CONFIG, SimulatorService } from './simulator.service';

@Module({
  providers: [{ provide: SIMULATOR_CONFIG, useFactory: () => loadConfig() }, SimulatorService],
})
export class AppModule {}
