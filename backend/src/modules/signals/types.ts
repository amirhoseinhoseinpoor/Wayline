export interface DeviceXrayData {
  time: number;
  data: [number, [number, number, number]][]; // [timestamp, [lat, long, speed]]
}

export interface XrayPayload {
  [deviceId: string]: DeviceXrayData;
}

export interface SignalFilter {
  deviceId?: string;
  minTime?: string; // from query, strings first
  maxTime?: string;
}
