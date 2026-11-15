import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
} from '@nestjs/common';
import { SignalsService } from './signals.service';
import type { SignalFilter, TelemetryPayload } from './types';

@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Post()
  async create(@Body() data: TelemetryPayload) {
    await this.signalsService.processAndSave(data);
    return { message: 'Signal saved successfully' };
  }

  @Get()
  async findAll(@Query() query: SignalFilter) {
    return this.signalsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.signalsService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: Partial<TelemetryPayload>) {
    return this.signalsService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.signalsService.remove(id);
  }
}
