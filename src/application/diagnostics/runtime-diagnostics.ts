import { DurableEvent, DurableEventQueryPort } from "../ports/durable-event-port.js";

/**
 * Normalized timeline event node for diagnostic reconstruction.
 */
export interface DiagnosticTraceNode {
  readonly sequenceNumber: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly causationId?: string | undefined;
  readonly occurredAt: Date;
  readonly status?: string | undefined;
  readonly reason?: string | undefined;
  readonly code?: string | undefined;
  readonly message?: string | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * High-level diagnostic summary of an entire operational execution trace.
 */
export interface ExecutionTraceDiagnostic {
  readonly traceId: string;
  readonly rootTaskId?: string | undefined;
  readonly executionId?: string | undefined;
  readonly agentId?: string | undefined;
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED" | "IN_PROGRESS" | "UNKNOWN";
  readonly startedAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly durationMs?: number | undefined;
  readonly failureReason?: string | undefined;
  readonly failureCode?: string | undefined;
  readonly isCrashRecovered: boolean;
  readonly timeline: readonly DiagnosticTraceNode[];
  readonly causalChain: readonly string[];
}

/**
 * Diagnostic record representing a crash reconciliation event executed during startup.
 */
export interface CrashRecoveryDiagnostic {
  readonly eventId: string;
  readonly sequenceNumber: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly traceId: string;
  readonly recoveredAt: Date;
  readonly code: string;
  readonly reason: string;
  readonly terminalStatus: string;
}

/**
 * Application service providing read-only observability and forensic diagnostic reconstruction
 * over the platform's durable event ledger.
 */
export class RuntimeDiagnosticsService {
  constructor(private readonly queryPort: DurableEventQueryPort) {}

  /**
   * Reconstructs a full operational diagnostic report for a specific distributed trace ID.
   * Assembles the chronological timeline, determines terminal resolution, identifies root causes,
   * detects crash recoveries, and outlines the causal lineage.
   */
  getTraceDiagnostics(traceId: string): ExecutionTraceDiagnostic | undefined {
    const events = this.queryPort.getEventsByTrace(traceId);
    if (events.length === 0) {
      return undefined;
    }

    const timeline: DiagnosticTraceNode[] = events.map((e) => {
      const p = e.payload as Record<string, unknown>;
      return {
        sequenceNumber: e.sequenceNumber,
        eventId: e.eventId,
        eventType: e.eventType,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        causationId: e.causationId,
        occurredAt: e.occurredAt,
        status: typeof p.status === "string" ? p.status : undefined,
        reason: typeof p.reason === "string" ? p.reason : undefined,
        code: typeof p.code === "string" ? p.code : undefined,
        message: typeof p.message === "string" ? p.message : undefined,
        payload: e.payload,
      };
    });

    let rootTaskId: string | undefined;
    let executionId: string | undefined;
    let agentId: string | undefined;
    let startedAt: Date | undefined;
    let completedAt: Date | undefined;
    let failureReason: string | undefined;
    let failureCode: string | undefined;
    let isCrashRecovered = false;
    const causalNodes = new Set<string>();

    for (const node of timeline) {
      if (node.aggregateType === "task" && !rootTaskId) {
        rootTaskId = node.aggregateId;
      }
      if (node.aggregateType === "execution" && !executionId) {
        executionId = node.aggregateId;
      }
      const p = node.payload as Record<string, unknown>;
      if (typeof p.agentId === "string" && !agentId) {
        agentId = p.agentId;
      }

      if (node.causationId) {
        causalNodes.add(`${node.causationId} -> ${node.aggregateType}:${node.aggregateId}`);
      } else {
        causalNodes.add(`${node.aggregateType}:${node.aggregateId}`);
      }

      if (
        node.eventType.endsWith(".started") ||
        node.eventType.endsWith(".created") ||
        node.eventType === "context.created"
      ) {
        if (!startedAt) {
          startedAt = node.occurredAt;
        }
      }

      if (
        node.eventType.endsWith(".completed") ||
        node.eventType.endsWith(".failed") ||
        node.eventType.endsWith(".cancelled")
      ) {
        completedAt = node.occurredAt;
        if (node.reason) failureReason = node.reason;
        if (node.code) failureCode = node.code;
        if (node.reason === "crash_recovery" || node.code === "CRASH_RECOVERY") {
          isCrashRecovered = true;
        }
      }
    }

    const lastEvent = timeline[timeline.length - 1];
    let overallStatus: "COMPLETED" | "FAILED" | "CANCELLED" | "IN_PROGRESS" | "UNKNOWN" = "UNKNOWN";
    if (lastEvent) {
      if (lastEvent.eventType.endsWith(".completed")) {
        overallStatus = "COMPLETED";
      } else if (lastEvent.eventType.endsWith(".failed")) {
        overallStatus = "FAILED";
      } else if (lastEvent.eventType.endsWith(".cancelled")) {
        overallStatus = "CANCELLED";
      } else {
        overallStatus = "IN_PROGRESS";
      }
    }

    const durationMs =
      startedAt && completedAt ? Math.max(0, completedAt.getTime() - startedAt.getTime()) : undefined;

    return {
      traceId,
      rootTaskId,
      executionId,
      agentId,
      status: overallStatus,
      startedAt,
      completedAt,
      durationMs,
      failureReason,
      failureCode,
      isCrashRecovered,
      timeline: Object.freeze(timeline),
      causalChain: Object.freeze(Array.from(causalNodes)),
    };
  }

  /**
   * Scans the durable ledger for all historical crash reconciliation occurrences.
   * Returns a structured forensic summary of entities recovered by RestartRecoveryService.
   */
  getCrashRecoveryDiagnostics(): readonly CrashRecoveryDiagnostic[] {
    const allEvents = this.queryPort.getAllEvents();
    const recoveryEvents = allEvents.filter((e) => {
      const p = e.payload as Record<string, unknown>;
      return (
        p.reason === "crash_recovery" ||
        p.code === "CRASH_RECOVERY" ||
        p.reason === "orphan_execution" ||
        p.code === "ORPHAN_EXECUTION" ||
        p.reason === "orphan_task" ||
        p.code === "ORPHAN_TASK"
      );
    });

    return Object.freeze(
      recoveryEvents.map((e) => {
        const p = e.payload as Record<string, unknown>;
        return {
          eventId: e.eventId,
          sequenceNumber: e.sequenceNumber,
          aggregateType: e.aggregateType,
          aggregateId: e.aggregateId,
          traceId: e.traceId,
          recoveredAt: e.occurredAt,
          code: typeof p.code === "string" ? p.code : "CRASH_RECOVERY",
          reason: typeof p.reason === "string" ? p.reason : "crash_recovery",
          terminalStatus: typeof p.status === "string" ? p.status : "FAILED",
        };
      })
    );
  }

  /**
   * Reconstructs the chronological event lifecycle history specifically for a single Task.
   */
  getTaskHistory(taskId: string): readonly DiagnosticTraceNode[] {
    const events = this.queryPort.getEventsByTask(taskId);
    return Object.freeze(
      events.map((e) => {
        const p = e.payload as Record<string, unknown>;
        return {
          sequenceNumber: e.sequenceNumber,
          eventId: e.eventId,
          eventType: e.eventType,
          aggregateType: e.aggregateType,
          aggregateId: e.aggregateId,
          causationId: e.causationId,
          occurredAt: e.occurredAt,
          status: typeof p.status === "string" ? p.status : undefined,
          reason: typeof p.reason === "string" ? p.reason : undefined,
          code: typeof p.code === "string" ? p.code : undefined,
          message: typeof p.message === "string" ? p.message : undefined,
          payload: e.payload,
        };
      })
    );
  }
}
