import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { IngestTelemetryDto } from './dto/ingest-telemetry.dto';
import { ListTelemetryQuery } from './dto/list-telemetry.query';
import { TelemetryService } from './telemetry.service';

@ApiTags('telemetry')
@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Post()
  @ApiOperation({
    summary: 'Ingest a telemetry batch over HTTP',
    description:
      'Alternative to the AMQP path for devices that cannot hold a broker connection. ' +
      'Returns 201 for a new batch and 200 when the messageId was already ingested.',
  })
  @ApiCreatedResponse({ description: 'Batch stored' })
  @ApiOkResponse({ description: 'Batch with this messageId already exists' })
  async ingest(@Body() dto: IngestTelemetryDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.telemetry.ingest(dto);
    res.status(result.status === 'created' ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'List telemetry batches (newest first, without raw readings)' })
  list(@Query() query: ListTelemetryQuery) {
    return this.telemetry.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one batch including its raw readings' })
  @ApiNotFoundResponse()
  findOne(@Param('id') id: string) {
    return this.telemetry.findById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a batch' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id') id: string) {
    return this.telemetry.remove(id);
  }
}
