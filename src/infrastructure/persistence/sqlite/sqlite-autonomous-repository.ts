/**
 * AI Operating Platform - SQLite Autonomous Repositories
 * 
 * Persistent SQLite storage for AutonomousTrigger, RuntimeLease, and AutonomousRuntimeState.
 * Uses node:sqlite DatabaseSync with WAL mode, compound indexes, and OCC.
 */

import { DatabaseSync } from "node:sqlite";
import { AutonomousTrigger, TriggerType, TriggerStatus } from "../../../domain/autonomous/autonomous-trigger.js";
import { RuntimeLease } from "../../../domain/autonomous/runtime-lease.js";
import { AutonomousRuntimeState, AutonomousRuntimeStatus } from "../../../domain/autonomous/autonomous-runtime-state.js";
import {
  AutonomousTriggerRepositoryPort,
  RuntimeLeaseRepositoryPort,
  AutonomousRuntimeStateRepositoryPort,
} from "../../../application/ports/autonomous-runtime-port.js";
import { SqliteDatabase } from "./sqlite-database.js";
import {
  AutonomousRuntimeValidationError,
  RuntimeLeaseConflictError,
} from "../../../domain/autonomous/autonomous-runtime-errors.js";
import { AutonomyLevel } from "../../../domain/business/autonomy-level.js";

export class SqliteAutonomousTriggerRepository implements AutonomousTriggerRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS autonomous_triggers (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        enterprise_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        trigger_type TEXT NOT NULL,
        status TEXT NOT NULL,
        target_objective_id TEXT,
        target_initiative_id TEXT,
        autonomy_level TEXT NOT NULL,
        schedule_config TEXT,
        event_config TEXT,
        threshold_config TEXT,
        fire_count INTEGER NOT NULL DEFAULT 0,
        last_fired_at TEXT,
        last_fired_cycle_id TEXT,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_auto_trig_tenant ON autonomous_triggers(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_auto_trig_ent ON autonomous_triggers(enterprise_id, tenant_id);
      CREATE INDEX IF NOT EXISTS idx_auto_trig_status ON autonomous_triggers(status, tenant_id);
    `);
  }

  async save(trigger: AutonomousTrigger): Promise<void> {
    const existing = await this.findById(trigger.id, trigger.tenantId);
    if (existing && existing.concurrencyVersion >= trigger.concurrencyVersion) {
      throw new AutonomousRuntimeValidationError(
        `OCC conflict on trigger '${trigger.id}': existing version ${existing.concurrencyVersion} >= ${trigger.concurrencyVersion}`
      );
    }

    const stmt = this.db.prepare(`
      INSERT INTO autonomous_triggers (
        id, tenant_id, enterprise_id, name, description, trigger_type, status,
        target_objective_id, target_initiative_id, autonomy_level, schedule_config,
        event_config, threshold_config, fire_count, last_fired_at, last_fired_cycle_id,
        concurrency_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id, tenant_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        trigger_type = excluded.trigger_type,
        status = excluded.status,
        target_objective_id = excluded.target_objective_id,
        target_initiative_id = excluded.target_initiative_id,
        autonomy_level = excluded.autonomy_level,
        schedule_config = excluded.schedule_config,
        event_config = excluded.event_config,
        threshold_config = excluded.threshold_config,
        fire_count = excluded.fire_count,
        last_fired_at = excluded.last_fired_at,
        last_fired_cycle_id = excluded.last_fired_cycle_id,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      trigger.id,
      trigger.tenantId,
      trigger.enterpriseId,
      trigger.name,
      trigger.description ?? null,
      trigger.triggerType,
      trigger.status,
      trigger.targetObjectiveId ?? null,
      trigger.targetInitiativeId ?? null,
      trigger.autonomyLevel,
      trigger.scheduleConfig ? JSON.stringify(trigger.scheduleConfig) : null,
      trigger.eventConfig ? JSON.stringify(trigger.eventConfig) : null,
      trigger.thresholdConfig ? JSON.stringify(trigger.thresholdConfig) : null,
      trigger.fireCount,
      trigger.lastFiredAt ? trigger.lastFiredAt.toISOString() : null,
      trigger.lastFiredCycleId ?? null,
      trigger.concurrencyVersion,
      trigger.createdAt.toISOString(),
      trigger.updatedAt.toISOString()
    );
  }

  async findById(id: string, tenantId: string): Promise<AutonomousTrigger | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM autonomous_triggers WHERE id = ? AND tenant_id = ?
    `);
    const row = stmt.get(id, tenantId) as any;
    if (!row) return undefined;
    return this.mapRowToTrigger(row);
  }

  async listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly AutonomousTrigger[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM autonomous_triggers WHERE enterprise_id = ? AND tenant_id = ? ORDER BY created_at DESC
    `);
    const rows = stmt.all(enterpriseId, tenantId) as any[];
    return Object.freeze(rows.map((r) => this.mapRowToTrigger(r)));
  }

  async listByTenant(tenantId: string): Promise<readonly AutonomousTrigger[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM autonomous_triggers WHERE tenant_id = ? ORDER BY created_at DESC
    `);
    const rows = stmt.all(tenantId) as any[];
    return Object.freeze(rows.map((r) => this.mapRowToTrigger(r)));
  }

  async listActive(tenantId: string): Promise<readonly AutonomousTrigger[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM autonomous_triggers WHERE tenant_id = ? AND status = 'ENABLED' ORDER BY created_at DESC
    `);
    const rows = stmt.all(tenantId) as any[];
    return Object.freeze(rows.map((r) => this.mapRowToTrigger(r)));
  }

  async delete(id: string, tenantId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      DELETE FROM autonomous_triggers WHERE id = ? AND tenant_id = ?
    `);
    const res = stmt.run(id, tenantId);
    return res.changes > 0;
  }

  private mapRowToTrigger(row: any): AutonomousTrigger {
    const sched = row.schedule_config ? JSON.parse(row.schedule_config) : undefined;
    return AutonomousTrigger.rehydrate({
      id: row.id,
      tenantId: row.tenant_id,
      enterpriseId: row.enterprise_id,
      name: row.name,
      description: row.description ?? undefined,
      triggerType: row.trigger_type as TriggerType,
      status: row.status as TriggerStatus,
      targetObjectiveId: row.target_objective_id ?? undefined,
      targetInitiativeId: row.target_initiative_id ?? undefined,
      autonomyLevel: row.autonomy_level as AutonomyLevel,
      scheduleConfig: sched
        ? {
            intervalMs: sched.intervalMs,
            lastFiredAt: sched.lastFiredAt ? new Date(sched.lastFiredAt) : undefined,
            nextRunAt: new Date(sched.nextRunAt),
          }
        : undefined,
      eventConfig: row.event_config ? JSON.parse(row.event_config) : undefined,
      thresholdConfig: row.threshold_config ? JSON.parse(row.threshold_config) : undefined,
      fireCount: row.fire_count,
      lastFiredAt: row.last_fired_at ? new Date(row.last_fired_at) : undefined,
      lastFiredCycleId: row.last_fired_cycle_id ?? undefined,
      concurrencyVersion: row.concurrency_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}

export class SqliteRuntimeLeaseRepository implements RuntimeLeaseRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS autonomous_runtime_leases (
        lease_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        owner_runtime_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        version INTEGER NOT NULL,
        PRIMARY KEY (resource_id, tenant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_runtime_leases_exp ON autonomous_runtime_leases(expires_at, tenant_id);
    `);
  }

  async acquire(lease: RuntimeLease): Promise<boolean> {
    const existing = await this.findByResource(lease.resourceId, lease.tenantId);
    const now = new Date();

    if (existing && !existing.isExpired(now) && existing.ownerRuntimeId !== lease.ownerRuntimeId) {
      return false;
    }

    const stmt = this.db.prepare(`
      INSERT INTO autonomous_runtime_leases (
        lease_id, resource_id, tenant_id, owner_runtime_id, acquired_at, expires_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(resource_id, tenant_id) DO UPDATE SET
        lease_id = excluded.lease_id,
        owner_runtime_id = excluded.owner_runtime_id,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at,
        version = excluded.version
    `);

    stmt.run(
      lease.leaseId,
      lease.resourceId,
      lease.tenantId,
      lease.ownerRuntimeId,
      lease.acquiredAt.toISOString(),
      lease.expiresAt.toISOString(),
      lease.version
    );
    return true;
  }

  async findByResource(resourceId: string, tenantId: string): Promise<RuntimeLease | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM autonomous_runtime_leases WHERE resource_id = ? AND tenant_id = ?
    `);
    const row = stmt.get(resourceId, tenantId) as any;
    if (!row) return undefined;

    const lease = RuntimeLease.rehydrate({
      leaseId: row.lease_id,
      resourceId: row.resource_id,
      tenantId: row.tenant_id,
      ownerRuntimeId: row.owner_runtime_id,
      acquiredAt: new Date(row.acquired_at),
      expiresAt: new Date(row.expires_at),
      version: row.version,
    });

    if (lease.isExpired()) {
      return undefined;
    }
    return lease;
  }

  async renew(lease: RuntimeLease): Promise<boolean> {
    const existing = await this.findByResource(lease.resourceId, lease.tenantId);
    const now = new Date();

    if (!existing || existing.isExpired(now) || existing.ownerRuntimeId !== lease.ownerRuntimeId) {
      return false;
    }

    const stmt = this.db.prepare(`
      UPDATE autonomous_runtime_leases
      SET expires_at = ?, version = version + 1
      WHERE resource_id = ? AND tenant_id = ? AND owner_runtime_id = ?
    `);

    const res = stmt.run(lease.expiresAt.toISOString(), lease.resourceId, lease.tenantId, lease.ownerRuntimeId);
    return res.changes > 0;
  }

  async release(resourceId: string, ownerRuntimeId: string, tenantId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      DELETE FROM autonomous_runtime_leases
      WHERE resource_id = ? AND tenant_id = ? AND owner_runtime_id = ?
    `);
    const res = stmt.run(resourceId, tenantId, ownerRuntimeId);
    return res.changes > 0;
  }

  async clearExpired(tenantId: string, now = new Date()): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM autonomous_runtime_leases
      WHERE tenant_id = ? AND expires_at <= ?
    `);
    const res = stmt.run(tenantId, now.toISOString());
    return Number(res.changes);
  }
}

export class SqliteAutonomousRuntimeStateRepository implements AutonomousRuntimeStateRepositoryPort {
  private readonly db: DatabaseSync;

  constructor(database: SqliteDatabase) {
    this.db = database.open();
    this.ensureTables();
  }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS autonomous_runtime_state (
        tenant_id TEXT NOT NULL PRIMARY KEY,
        status TEXT NOT NULL,
        runtime_instance_id TEXT NOT NULL,
        active_cycle_ids TEXT NOT NULL,
        consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
        max_consecutive_failures INTEGER NOT NULL DEFAULT 5,
        safety_halt_reason TEXT,
        last_heartbeat_at TEXT NOT NULL,
        concurrency_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  async save(state: AutonomousRuntimeState): Promise<void> {
    const existing = await this.findByTenant(state.tenantId);
    if (existing && existing.concurrencyVersion >= state.concurrencyVersion) {
      throw new AutonomousRuntimeValidationError(
        `OCC conflict on runtime state '${state.tenantId}': existing ${existing.concurrencyVersion} >= ${state.concurrencyVersion}`
      );
    }

    const stmt = this.db.prepare(`
      INSERT INTO autonomous_runtime_state (
        tenant_id, status, runtime_instance_id, active_cycle_ids, consecutive_failure_count,
        max_consecutive_failures, safety_halt_reason, last_heartbeat_at, concurrency_version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id) DO UPDATE SET
        status = excluded.status,
        runtime_instance_id = excluded.runtime_instance_id,
        active_cycle_ids = excluded.active_cycle_ids,
        consecutive_failure_count = excluded.consecutive_failure_count,
        max_consecutive_failures = excluded.max_consecutive_failures,
        safety_halt_reason = excluded.safety_halt_reason,
        last_heartbeat_at = excluded.last_heartbeat_at,
        concurrency_version = excluded.concurrency_version,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      state.tenantId,
      state.status,
      state.runtimeInstanceId,
      JSON.stringify(state.activeCycleIds),
      state.consecutiveFailureCount,
      state.maxConsecutiveFailures,
      state.safetyHaltReason ?? null,
      state.lastHeartbeatAt.toISOString(),
      state.concurrencyVersion,
      state.createdAt.toISOString(),
      state.updatedAt.toISOString()
    );
  }

  async findByTenant(tenantId: string): Promise<AutonomousRuntimeState | undefined> {
    const stmt = this.db.prepare(`
      SELECT * FROM autonomous_runtime_state WHERE tenant_id = ?
    `);
    const row = stmt.get(tenantId) as any;
    if (!row) return undefined;

    return AutonomousRuntimeState.rehydrate({
      tenantId: row.tenant_id,
      status: row.status as AutonomousRuntimeStatus,
      runtimeInstanceId: row.runtime_instance_id,
      activeCycleIds: JSON.parse(row.active_cycle_ids),
      consecutiveFailureCount: row.consecutive_failure_count,
      maxConsecutiveFailures: row.max_consecutive_failures,
      safetyHaltReason: row.safety_halt_reason ?? undefined,
      lastHeartbeatAt: new Date(row.last_heartbeat_at),
      concurrencyVersion: row.concurrency_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}
