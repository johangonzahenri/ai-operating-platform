/**
 * AI Operating Platform — PROJ-01: Tentaciones AI Commerce
 * 
 * Frame Temporal Synchronizer & Generation Control.
 * 
 * Invariants:
 * 1. Monotonic Temporal Progression: Sequence numbers and generation epochs strictly increase.
 * 2. Strict Stale Rejection: Results corresponding to older sequence numbers or previous generations
 *    are mathematically identified and rejected (STALE / SUPERSEDED) to avoid visual regression.
 * 3. Out-of-Order Safety: If Frame 12 completes before Frames 10 and 11, Frame 12 is accepted;
 *    when Frames 10 and 11 arrive later, they are classified as STALE and discarded.
 * 4. Bounded In-Flight Window: In-flight and historical records are strictly bounded to prevent memory leaks.
 * 5. Deterministic Classification: Every result receives an unambiguous classification:
 *    CURRENT | STALE | SUPERSEDED | DUPLICATE | UNKNOWN.
 */

import { VideoFrameInput } from "./frame-protocol.js";

export type ResultClassification =
  | "CURRENT"
  | "STALE"
  | "SUPERSEDED"
  | "DUPLICATE"
  | "UNKNOWN";

export interface TemporalSyncRecord {
  readonly frameId: string;
  readonly sequenceNumber: number;
  readonly generation: number;
  readonly acquisitionTimestampMs: number;
  readonly processingStartedAtMs: number;
  processingCompletedAtMs?: number | undefined;
  isSuperseded: boolean;
  isCancelled: boolean;
}

export interface TemporalSynchronizerConfig {
  readonly maxRecordWindowSize?: number | undefined;
}

export class TemporalSynchronizer {
  private _nextSequenceNumber: number = 1;
  private _currentGeneration: number = 1;
  private _latestCommittedSequenceNumber: number = 0;
  private _latestCommittedGeneration: number = 0;
  private readonly _records: Map<number, TemporalSyncRecord> = new Map();
  private readonly _maxRecordWindowSize: number;

  constructor(config?: TemporalSynchronizerConfig) {
    this._maxRecordWindowSize = config?.maxRecordWindowSize ?? 100;
  }

  /**
   * Registers an incoming video frame, allocating a monotonic sequence number and tracking generation.
   */
  public registerFrame(frame: VideoFrameInput): {
    readonly generation: number;
    readonly sequenceNumber: number;
    readonly syncRecord: TemporalSyncRecord;
  } {
    const sequenceNumber = frame.metadata.timestamp?.sequenceNumber > 0
      ? frame.metadata.timestamp.sequenceNumber
      : this._nextSequenceNumber++;

    if (sequenceNumber >= this._nextSequenceNumber) {
      this._nextSequenceNumber = sequenceNumber + 1;
    }

    const generation = this._currentGeneration++;
    const now = Date.now();

    const syncRecord: TemporalSyncRecord = {
      frameId: frame.frameId,
      sequenceNumber,
      generation,
      acquisitionTimestampMs: frame.metadata.timestamp?.acquisitionTimestampMs ?? now,
      processingStartedAtMs: now,
      isSuperseded: false,
      isCancelled: false,
    };

    this._records.set(sequenceNumber, syncRecord);
    this._pruneOldRecords();

    return {
      generation,
      sequenceNumber,
      syncRecord,
    };
  }

  /**
   * Classifies an incoming processing result based on generation, sequence order, and superseding state.
   */
  public classifyResult(generation: number, sequenceNumber: number): ResultClassification {
    const record = this._records.get(sequenceNumber);

    if (record && record.isCancelled) {
      return "SUPERSEDED";
    }

    if (record && record.isSuperseded) {
      return "SUPERSEDED";
    }

    // Exact duplicate check
    if (sequenceNumber === this._latestCommittedSequenceNumber && this._latestCommittedSequenceNumber > 0) {
      return "DUPLICATE";
    }

    // Stale check: older sequence or older generation than what is already committed
    if (sequenceNumber < this._latestCommittedSequenceNumber) {
      return "STALE";
    }

    if (generation < this._latestCommittedGeneration) {
      return "STALE";
    }

    // If record exists and is valid for commit
    if (record) {
      return "CURRENT";
    }

    // Sequence not found in active window: if larger than latest, treat as CURRENT; else UNKNOWN
    if (sequenceNumber > this._latestCommittedSequenceNumber) {
      return "CURRENT";
    }

    return "UNKNOWN";
  }

  /**
   * Commits a valid result, advancing the latest committed sequence and generation markers.
   * Returns true if successfully committed, or false if rejected as stale/superseded.
   */
  public commitResult(generation: number, sequenceNumber: number): boolean {
    const classification = this.classifyResult(generation, sequenceNumber);
    if (classification !== "CURRENT") {
      return false;
    }

    this._latestCommittedSequenceNumber = Math.max(this._latestCommittedSequenceNumber, sequenceNumber);
    this._latestCommittedGeneration = Math.max(this._latestCommittedGeneration, generation);

    const record = this._records.get(sequenceNumber);
    if (record) {
      record.processingCompletedAtMs = Date.now();
    }

    // Mark any preceding in-flight records as superseded
    this.supersedePendingBefore(sequenceNumber);

    return true;
  }

  /**
   * Marks all in-flight frames before the designated sequence number as superseded.
   */
  public supersedePendingBefore(sequenceNumber: number): number {
    let supersededCount = 0;
    for (const [seq, record] of this._records.entries()) {
      if (seq < sequenceNumber && !record.processingCompletedAtMs && !record.isSuperseded) {
        record.isSuperseded = true;
        supersededCount++;
      }
    }
    return supersededCount;
  }

  /**
   * Marks a specific frame sequence as superseded (e.g. coalesced in queue).
   */
  public markSuperseded(sequenceNumber: number): boolean {
    const record = this._records.get(sequenceNumber);
    if (record) {
      record.isSuperseded = true;
      return true;
    }
    return false;
  }

  /**
   * Marks a specific frame sequence as cancelled (e.g. AbortSignal triggered).
   */
  public markCancelled(sequenceNumber: number): boolean {
    const record = this._records.get(sequenceNumber);
    if (record) {
      record.isCancelled = true;
      return true;
    }
    return false;
  }

  public getLatestCommittedSequence(): number {
    return this._latestCommittedSequenceNumber;
  }

  public getLatestCommittedGeneration(): number {
    return this._latestCommittedGeneration;
  }

  public getCurrentGeneration(): number {
    return this._currentGeneration;
  }

  public getActiveInFlightCount(): number {
    let count = 0;
    for (const record of this._records.values()) {
      if (!record.processingCompletedAtMs && !record.isSuperseded && !record.isCancelled) {
        count++;
      }
    }
    return count;
  }

  public getRecord(sequenceNumber: number): TemporalSyncRecord | undefined {
    return this._records.get(sequenceNumber);
  }

  public reset(): void {
    this._nextSequenceNumber = 1;
    this._currentGeneration = 1;
    this._latestCommittedSequenceNumber = 0;
    this._latestCommittedGeneration = 0;
    this._records.clear();
  }

  private _pruneOldRecords(): void {
    if (this._records.size <= this._maxRecordWindowSize) {
      return;
    }
    const cutoff = this._nextSequenceNumber - this._maxRecordWindowSize;
    for (const seq of this._records.keys()) {
      if (seq < cutoff) {
        this._records.delete(seq);
      }
    }
  }
}
