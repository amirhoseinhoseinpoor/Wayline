// signal.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SignalDocument = Signal & Document;

@Schema()
export class Signal {
  @Prop({ required: true }) deviceId: string;
  @Prop({ required: true }) time: number;
  @Prop({ required: true }) dataLength: number;
  @Prop({ required: true }) dataVolume: number;
  @Prop({ type: [[Number]], required: true }) data: number[][];
}

export const SignalSchema = SchemaFactory.createForClass(Signal);
