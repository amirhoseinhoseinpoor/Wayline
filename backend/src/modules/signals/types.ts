export interface DeviceTelemetryData {
  time: number;
  data: [number, [number, number, number]][]; // [timestamp, [lat, long, speed]]
}

export interface TelemetryPayload {
  [deviceId: string]: DeviceTelemetryData;
}

export interface SignalFilter {
  deviceId?: string;
  minTime?: string; // from query, strings first
  maxTime?: string;
}
