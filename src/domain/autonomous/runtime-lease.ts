/**
 * AI Operating Platform - Runtime Lease Entity
 * 
 * Manages distributed or multi-instance execution leases for Executive Cycles and Triggers.
 * Enforces mutual exclusion, lease renewal, and deterministic expiration without double execution.
 */

import { AutonomousRuntimeValidationError } from "./autonomous-runtime-errors.js";

export interface RuntimeLeaseProps {
  readonly leaseId: string;
  readonly resourceId: string;
  readonly tenantId: string;
  readonly ownerRuntimeId: string;
  readonly acquiredAt: Date;
  readonly expiresAt: Date;
  readonly version: number;
}

export interface CreateRuntimeLeaseProps {
  readonly leaseId: string;
  readonly resourceId: string;
  readonly tenantId: string;
  readonly ownerRuntimeId: string;
  readonly ttlMs?: number | undefined;
}

export class RuntimeLease {
  readonly leaseId: string;
  readonly resourceId: string;
  readonly tenantId: string;
  readonly ownerRuntimeId: string;
  readonly acquiredAt: Date;
  readonly expiresAt: Date;
  readonly version: number;

  private constructor(props: RuntimeLeaseProps) {
    this.leaseId = props.leaseId;
    this.resourceId = props.resourceId;
    this.tenantId = props.tenantId;
    this.ownerRuntimeId = props.ownerRuntimeId;
    this.acquiredAt = props.acquiredAt;
    this.expiresAt = props.expiresAt;
    this.version = props.version;
    Object.freeze(this);
  }

  static create(props: CreateRuntimeLeaseProps, now = new Date()): RuntimeLease {
    if (!props.leaseId || typeof props.leaseId !== "string" || !props.leaseId.trim()) {
      throw new AutonomousRuntimeValidationError("RuntimeLease requires a non-empty leaseId");
    }
    if (!props.resourceId || typeof props.resourceId !== "string" || !props.resourceId.trim()) {
      throw new AutonomousRuntimeValidationError("RuntimeLease requires a non-empty resourceId");
    }
    if (!props.tenantId || typeof props.tenantId !== "string" || !props.tenantId.trim()) {
      throw new AutonomousRuntimeValidationError("RuntimeLease requires a non-empty tenantId");
    }
    if (!props.ownerRuntimeId || typeof props.ownerRuntimeId !== "string" || !props.ownerRuntimeId.trim()) {
      throw new AutonomousRuntimeValidationError("RuntimeLease requires a non-empty ownerRuntimeId");
    }

    const ttl = Math.max(props.ttlMs ?? 60000, 1000);
    const expiresAt = new Date(now.getTime() + ttl);

    return new RuntimeLease({
      leaseId: props.leaseId.trim(),
      resourceId: props.resourceId.trim(),
      tenantId: props.tenantId.trim(),
      ownerRuntimeId: props.ownerRuntimeId.trim(),
      acquiredAt: now,
      expiresAt,
      version: 1,
    });
  }

  static rehydrate(props: RuntimeLeaseProps): RuntimeLease {
    return new RuntimeLease(props);
  }

  isExpired(now = new Date()): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  isHeldBy(runtimeId: string, now = new Date()): boolean {
    return !this.isExpired(now) && this.ownerRuntimeId === runtimeId;
  }

  renew(ttlMs: number, requestingRuntimeId: string, now = new Date()): RuntimeLease {
    if (this.isExpired(now)) {
      throw new AutonomousRuntimeValidationError(`Cannot renew expired lease '${this.leaseId}'`);
    }
    if (this.ownerRuntimeId !== requestingRuntimeId) {
      throw new AutonomousRuntimeValidationError(
        `Runtime '${requestingRuntimeId}' cannot renew lease owned by '${this.ownerRuntimeId}'`
      );
    }

    const ttl = Math.max(ttlMs, 1000);
    const newExpiresAt = new Date(now.getTime() + ttl);

    return new RuntimeLease({
      leaseId: this.leaseId,
      resourceId: this.resourceId,
      tenantId: this.tenantId,
      ownerRuntimeId: this.ownerRuntimeId,
      acquiredAt: this.acquiredAt,
      expiresAt: newExpiresAt,
      version: this.version + 1,
    });
  }
}
