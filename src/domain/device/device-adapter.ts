import { BusinessDevice, ConsumableStatus, DeviceCapabilitiesMap, DeviceStatus } from "./business-device.js";
import { PrintJob } from "./print-job.js";

export interface DeviceHealthResult {
  readonly deviceId: string;
  readonly status: DeviceStatus;
  readonly reachable: boolean;
  readonly message?: string | undefined;
  readonly checkedAt: Date;
}

export interface BusinessDeviceAdapter {
  readonly deviceId: string;
  readonly vendor: string;
  readonly model: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<DeviceHealthResult>;
  getCapabilities(): Promise<DeviceCapabilitiesMap>;
  getStatus(): Promise<DeviceStatus>;
  getConsumables(): Promise<readonly ConsumableStatus[]>;
  submitJob(job: PrintJob): Promise<{ readonly accepted: boolean; readonly jobId: string; readonly message?: string }>;
  getJobStatus(jobId: string): Promise<{ readonly status: string; readonly message?: string }>;
  cancelJob(jobId: string): Promise<{ readonly cancelled: boolean; readonly message?: string }>;
}
