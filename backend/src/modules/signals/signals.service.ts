import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Signal, SignalDocument } from './signal.schema';
import { SignalFilter, TelemetryPayload } from './types';

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(
    @InjectModel(Signal.name)
    private signalModel: Model<SignalDocument>,
  ) {}

  async processAndSave(payload: TelemetryPayload): Promise<void> {
    for (const deviceId in payload) {
      const deviceData = payload[deviceId];
      const { time, data } = deviceData;

      const dataLength = data.length;
      const dataVolume = JSON.stringify(data).length;

      const newSignal = new this.signalModel({
        deviceId,
        time,
        dataLength,
        dataVolume,
        data,
      });

      await newSignal.save();
      this.logger.log(`Signal saved for device ${deviceId}`);
    }
  }

  async findAll(filter: SignalFilter) {
    const query: {
      deviceId?: string;
      time?: { $gte?: number; $lte?: number };
    } = {};

    if (filter.deviceId) query.deviceId = filter.deviceId;

    if (filter.minTime) {
      const existingTime = query.time ?? {};
      query.time = { ...existingTime, $gte: Number(filter.minTime) };
    }

    if (filter.maxTime) {
      const existingTime = query.time ?? {};
      query.time = { ...existingTime, $lte: Number(filter.maxTime) };
    }

    return this.signalModel.find(query).exec();
  }

  async findOne(id: string) {
    return this.signalModel.findById(id).exec();
  }

  async update(id: string, body: TelemetryPayload) {
    return this.signalModel.findByIdAndUpdate(id, body, { new: true }).exec();
  }

  async remove(id: string) {
    return this.signalModel.findByIdAndDelete(id).exec();
  }
}
