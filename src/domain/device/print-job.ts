import { deepFreeze, sanitizeBoundedValue, DEFAULT_BOUNDED_DATA_LIMITS } from "../context/bounded-data.js";

export type PrintJobStatus =
  | "CREATED"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "UNAVAILABLE";

export type DocumentType =
  | "REPORT"
  | "INVOICE"
  | "RECEIPT"
  | "ORDER"
  | "LABEL"
  | "DELIVERY_NOTE"
  | "INVENTORY_REPORT"
  | "SYSTEM_REPORT"
  | "CUSTOM";

export interface PrintDocument {
  readonly documentId: string;
  readonly type: DocumentType;
  readonly title: string;
  readonly content: string; // Plain text or formatted payload
  readonly format?: "PLAIN_TEXT" | "RAW_ESCP" | "POSTSCRIPT" | "PDF" | "MARKDOWN" | undefined;
  readonly pageCount?: number | undefined;
  readonly copies?: number | undefined;
}

export interface PrintJobProps {
  readonly id: string;
  readonly deviceId: string;
  readonly tenantId: string;
  readonly applicationId?: string | undefined;
  readonly principalId?: string | undefined;
  readonly document: PrintDocument;
  readonly status: PrintJobStatus;
  readonly createdAt: Date;
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly failedAt?: Date | undefined;
  readonly failureReason?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export class PrintJob {
  public readonly id: string;
  public readonly deviceId: string;
  public readonly tenantId: string;
  public readonly applicationId?: string | undefined;
  public readonly principalId?: string | undefined;
  public readonly document: Readonly<PrintDocument>;
  public readonly status: PrintJobStatus;
  public readonly createdAt: Date;
  public readonly startedAt?: Date | undefined;
  public readonly completedAt?: Date | undefined;
  public readonly failedAt?: Date | undefined;
  public readonly failureReason?: string | undefined;
  public readonly correlationId?: string | undefined;
  public readonly idempotencyKey?: string | undefined;
  public readonly metadata: Readonly<Record<string, unknown>>;

  private constructor(props: PrintJobProps) {
    this.id = props.id;
    this.deviceId = props.deviceId;
    this.tenantId = props.tenantId;
    this.applicationId = props.applicationId;
    this.principalId = props.principalId;
    this.document = Object.freeze({ ...props.document });
    this.status = props.status;
    this.createdAt = new Date(props.createdAt.getTime());
    this.startedAt = props.startedAt ? new Date(props.startedAt.getTime()) : undefined;
    this.completedAt = props.completedAt ? new Date(props.completedAt.getTime()) : undefined;
    this.failedAt = props.failedAt ? new Date(props.failedAt.getTime()) : undefined;
    this.failureReason = props.failureReason;
    this.correlationId = props.correlationId;
    this.idempotencyKey = props.idempotencyKey;
    this.metadata = sanitizeBoundedValue(props.metadata, DEFAULT_BOUNDED_DATA_LIMITS, 0) as Readonly<Record<string, unknown>>;
    deepFreeze(this);
  }

  public static create(props: Omit<PrintJobProps, "status" | "createdAt"> & {
    readonly status?: PrintJobStatus | undefined;
    readonly createdAt?: Date | undefined;
  }): PrintJob {
    if (!props.id || !props.id.trim()) {
      throw new Error("PrintJob id must be a non-empty string.");
    }
    if (!props.deviceId || !props.deviceId.trim()) {
      throw new Error("PrintJob deviceId must be a non-empty string.");
    }
    if (!props.tenantId || !props.tenantId.trim()) {
      throw new Error("PrintJob tenantId must be a non-empty string.");
    }
    if (!props.document || !props.document.content) {
      throw new Error("PrintJob document must contain non-empty content.");
    }

    return new PrintJob({
      ...props,
      status: props.status ?? "CREATED",
      createdAt: props.createdAt ?? new Date(),
    });
  }

  public transitionTo(
    newStatus: PrintJobStatus,
    options?: {
      readonly failureReason?: string | undefined;
      readonly timestamp?: Date | undefined;
    }
  ): PrintJob {
    const ts = options?.timestamp ?? new Date();

    if (this.status === "COMPLETED" || this.status === "FAILED" || this.status === "CANCELLED") {
      throw new Error(`Cannot transition terminal PrintJob '${this.id}' from '${this.status}' to '${newStatus}'.`);
    }

    return new PrintJob({
      ...this,
      status: newStatus,
      startedAt: newStatus === "PROCESSING" && !this.startedAt ? ts : this.startedAt,
      completedAt: newStatus === "COMPLETED" ? ts : this.completedAt,
      failedAt: newStatus === "FAILED" || newStatus === "UNAVAILABLE" ? ts : this.failedAt,
      failureReason: options?.failureReason ?? this.failureReason,
    });
  }
}
