/**
 * AI Operating Platform - Autonomous Runtime Repository Ports
 * 
 * Persistence ports for AutonomousTrigger, RuntimeLease, and AutonomousRuntimeState.
 */

import { AutonomousTrigger } from "../../domain/autonomous/autonomous-trigger.js";
import { RuntimeLease } from "../../domain/autonomous/runtime-lease.js";
import { AutonomousRuntimeState } from "../../domain/autonomous/autonomous-runtime-state.js";

export interface AutonomousTriggerRepositoryPort {
  save(trigger: AutonomousTrigger): Promise<void>;
  findById(id: string, tenantId: string): Promise<AutonomousTrigger | undefined>;
  listByEnterprise(enterpriseId: string, tenantId: string): Promise<readonly AutonomousTrigger[]>;
  listByTenant(tenantId: string): Promise<readonly AutonomousTrigger[]>;
  listActive(tenantId: string): Promise<readonly AutonomousTrigger[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}

export interface RuntimeLeaseRepositoryPort {
  acquire(lease: RuntimeLease): Promise<boolean>;
  findByResource(resourceId: string, tenantId: string): Promise<RuntimeLease | undefined>;
  renew(lease: RuntimeLease): Promise<boolean>;
  release(resourceId: string, ownerRuntimeId: string, tenantId: string): Promise<boolean>;
  clearExpired(tenantId: string, now?: Date): Promise<number>;
}

export interface AutonomousRuntimeStateRepositoryPort {
  save(state: AutonomousRuntimeState): Promise<void>;
  findByTenant(tenantId: string): Promise<AutonomousRuntimeState | undefined>;
}
