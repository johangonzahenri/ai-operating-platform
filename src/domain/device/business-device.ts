import { deepFreeze, sanitizeBoundedValue, DEFAULT_BOUNDED_DATA_LIMITS } from "../context/bounded-data.js";

export type DeviceType = "PRINTER" | "SCANNER" | "PAYMENT_TERMINAL" | "POS_DISPLAY" | "SCALE" | "CAMERA" | "SENSOR";

export type DeviceStatus = "READY" | "DEGRADED" | "UNAVAILABLE" | "UNCONFIGURED" | "FAILED" | "BUSY";

export type DeviceConnectionType = "USB" | "NETWORK_IP" | "BLUETOOTH" | "SERIAL" | "CLOUD" | "SPOOLER";

export type CapabilitySupportStatus = "SUPPORTED" | "UNSUPPORTED" | "AVAILABLE" | "UNAVAILABLE" | "CONFIGURED" | "UNCONFIGURED" | "UNKNOWN";

export type DeviceCapability =
  | "device.health"
  | "device.status"
  | "device.print"
  | "device.consumables"
  | "device.job_status"
  | "device.job_cancel";

export interface DeviceConnection {
  readonly type: DeviceConnectionType;
  readonly address?: string | undefined;
  readonly port?: string | number | undefined;
  readonly driverName?: string | undefined;
  readonly spoolerName?: string | undefined;
}

export interface DeviceCapabilitiesMap {
  readonly [capability: string]: CapabilitySupportStatus;
}

export interface ConsumableStatus {
  readonly name: string;
  readonly type: "TONER" | "INK" | "PAPER" | "BATTERY" | "MAINTENANCE";
  readonly levelPercent?: number | undefined;
  readonly status: CapabilitySupportStatus;
  readonly details?: string | undefined;
}

export interface BusinessDeviceProps {
  readonly id: string;
  readonly name: string;
  readonly type: DeviceType;
  readonly vendor: string;
  readonly model: string;
  readonly connection: DeviceConnection;
  readonly capabilities: DeviceCapabilitiesMap;
  readonly tenantId: string;
  readonly applicationId?: string | undefined;
  readonly status: DeviceStatus;
  readonly lastSeen: Date;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class BusinessDevice {
  public readonly id: string;
  public readonly name: string;
  public readonly type: DeviceType;
  public readonly vendor: string;
  public readonly model: string;
  public readonly connection: Readonly<DeviceConnection>;
  public readonly capabilities: Readonly<DeviceCapabilitiesMap>;
  public readonly tenantId: string;
  public readonly applicationId?: string | undefined;
  public readonly status: DeviceStatus;
  public readonly lastSeen: Date;
  public readonly metadata: Readonly<Record<string, unknown>>;

  private constructor(props: BusinessDeviceProps) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.vendor = props.vendor;
    this.model = props.model;
    this.connection = Object.freeze({ ...props.connection });
    this.capabilities = Object.freeze({ ...props.capabilities });
    this.tenantId = props.tenantId;
    this.applicationId = props.applicationId;
    this.status = props.status;
    this.lastSeen = new Date(props.lastSeen.getTime());
    this.metadata = sanitizeBoundedValue(props.metadata, DEFAULT_BOUNDED_DATA_LIMITS, 0) as Readonly<Record<string, unknown>>;
    deepFreeze(this);
  }

  public static create(props: BusinessDeviceProps): BusinessDevice {
    if (!props.id || typeof props.id !== "string" || !props.id.trim()) {
      throw new Error("BusinessDevice id must be a non-empty string.");
    }
    if (!props.name || typeof props.name !== "string" || !props.name.trim()) {
      throw new Error("BusinessDevice name must be a non-empty string.");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new Error("BusinessDevice tenantId must be a non-empty string.");
    }

    return new BusinessDevice({
      ...props,
      id: props.id.trim(),
      name: props.name.trim(),
      tenantId: props.tenantId.trim(),
      applicationId: props.applicationId?.trim(),
      lastSeen: props.lastSeen ?? new Date(),
    });
  }

  public withStatus(status: DeviceStatus, lastSeen: Date = new Date()): BusinessDevice {
    return new BusinessDevice({
      ...this,
      status,
      lastSeen,
    });
  }

  public isCapabilitySupported(capability: DeviceCapability | string): boolean {
    const stat = this.capabilities[capability];
    return stat === "SUPPORTED" || stat === "AVAILABLE";
  }
}
