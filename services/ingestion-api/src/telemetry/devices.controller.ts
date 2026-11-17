import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TelemetryService } from './telemetry.service';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get()
  @ApiOperation({ summary: 'Fleet overview: activity totals and last position per device' })
  list() {
    return this.telemetry.listDevices();
  }
}
