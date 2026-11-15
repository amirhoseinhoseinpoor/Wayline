import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProducerService } from './producer.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, ProducerService],
})
export class AppModule { }
