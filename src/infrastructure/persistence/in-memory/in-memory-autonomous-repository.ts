/**
 * AI Operating Platform - In-Memory Autonomous Repositories
 * 
 * In-memory thread-safe persistence for AutonomousTrigger, RuntimeLease, and AutonomousRuntimeState.
 */

import { AutonomousTrigger } from "../../../domain/autonomous/autonomous-trigger.js";
import { RuntimeLease } from "../../../domain/autonomous/runtime-lease.js";
import { AutonomousRuntimeState } from "../../../domain/autonomous/autonomous-runtime-state.js";
import {
  AutonomousTriggerRepositoryPort,
  RuntimeLeaseRepositoryPort,
  AutonomousRuntimeStateRepositoryPort,
} from "../../../application/ports/autonomous-runtime-port.js";
import {
  AutonomousRuntimeValidationError,
  RuntimeLeaseConflictError,
} from "../../../domain/autonomous/autonomous-runtime-errors.js";

export class InMemoryAutonomousTriggerRepository implements AutonomousTriggerRepositoryPort {
  private readonly items = new Map<string, AutonomousTrigger>();

  private key(id: string, tenantId: string): string {
    return `${tenantId}::${id}`;
  }

  async save(trigger: AutonomousTrigger): Promise<void> {
    const k = this.key(trigger.id, trigger.tenantId);
    const existing = this.items.get(k);
    if (existing && existing.concurrencyVersion >= trigger.concurrencyVersion) {
      throw new AutonomousRuntimeValidationError(
        `OCC conflict on trigger '${trigger.id}': existing version ${existing.concurrencyVersion} >= ${trigger.concurrencyVersion}`
      );
    }
    this.items.set(k, trigger);
  }

  async findById(id: string, tenantId: string): Promise<AutonomousTrigger | undefined> {
    return this.items.get(this.key(id, tenantId));
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly AutonomousTrigger[]> {
    const res: AutonomousTrigger[] = [];
    for (const t of this.items.values()) {
      if (t.tenantId === tenantId && t.enterpriseId === enterpriseId) {
        res.push(t);
      }
    }
    return Object.freeze(res);
  }

  async listByTenant(tenantId: string): Promise<readonly AutonomousTrigger[]> {
    const res: AutonomousTrigger[] = [];
    for (const t of this.items.values()) {
      if (t.tenantId === tenantId) {
        res.push(t);
      }
    }
    return Object.freeze(res);
  }

  async listActive(tenantId: string): Promise<readonly AutonomousTrigger[]> {
    const res: AutonomousTrigger[] = [];
    for (const t of this.items.values()) {
      if (t.tenantId === tenantId && t.status === "ENABLED") {
        res.push(t);
      }
    }
    return Object.freeze(res);
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    return this.items.delete(this.key(id, tenantId));
  }
}

export class InMemoryRuntimeLeaseRepository implements RuntimeLeaseRepositoryPort {
  private readonly leases = new Map<string, RuntimeLease>();

  private key(resourceId: string, tenantId: string): string {
    return `${tenantId}::${resourceId}`;
  }

  async acquire(lease: RuntimeLease): Promise<boolean> {
    const k = this.key(lease.resourceId, lease.tenantId);
    const existing = this.leases.get(k);
    const now = new Date();

    if (existing && !existing.isExpired(now) && existing.ownerRuntimeId !== lease.ownerRuntimeId) {
      return false;
    }

    this.leases.set(k, lease);
    return true;
  }

  async findByResource(resourceId: string, tenantId: string): Promise<RuntimeLease | undefined> {
    const l = this.leases.get(this.key(resourceId, tenantId));
    if (l && l.isExpired()) {
      return undefined;
    }
    return l;
  }

  async renew(lease: RuntimeLease): Promise<boolean> {
    const k = this.key(lease.resourceId, lease.tenantId);
    const existing = this.leases.get(k);
    const now = new Date();

    if (!existing || existing.isExpired(now) || existing.ownerRuntimeId !== lease.ownerRuntimeId) {
      return false;
    }

    this.leases.set(k, lease);
    return true;
  }

  async release(resourceId: string, ownerRuntimeId: string, tenantId: string): Promise<boolean> {
    const k = this.key(resourceId, tenantId);
    const existing = this.leases.get(k);

    if (existing && existing.ownerRuntimeId === ownerRuntimeId) {
      this.leases.delete(k);
      return true;
    }
    return false;
  }

  async clearExpired(tenantId: string, now = new Date()): Promise<number> {
    let count = 0;
    for (const [k, l] of this.leases.entries()) {
      if (l.tenantId === tenantId && l.isExpired(now)) {
        this.leases.delete(k);
        count++;
      }
    }
    return count;
  }
}

export class InMemoryAutonomousRuntimeStateRepository implements AutonomousRuntimeStateRepositoryPort {
  private readonly states = new Map<string, AutonomousRuntimeState>();

  async save(state: AutonomousRuntimeState): Promise<void> {
    const existing = this.states.get(state.tenantId);
    if (existing && existing.concurrencyVersion >= state.concurrencyVersion) {
      throw new AutonomousRuntimeValidationError(
        `OCC conflict on runtime state '${state.tenantId}': existing ${existing.concurrencyVersion} >= ${state.concurrencyVersion}`
      );
    }
    this.states.set(state.tenantId, state);
  }

  async findByTenant(tenantId: string): Promise<AutonomousRuntimeState | undefined> {
    return this.states.get(tenantId);
  }
}
