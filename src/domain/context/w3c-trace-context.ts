/**
 * AI Operating Platform - W3C Trace Context Domain Primitives
 * 
 * Formal domain models and parser/serializer for:
 * - W3C traceparent (version-traceid-parentid-traceflags)
 * - W3C tracestate (vendor key-value list members)
 * 
 * Invariants:
 * 1. Conforms to W3C Trace Context recommendation (2020/2021).
 * 2. traceparent syntax: 2 hex version - 32 hex trace-id - 16 hex parent-id - 2 hex flags.
 * 3. All-zero trace-id (00000000000000000000000000000000) is strictly invalid.
 * 4. All-zero parent-id (0000000000000000) is strictly invalid.
 * 5. Version 'ff' is forbidden by W3C specification.
 * 6. tracestate max length 512 characters, max 32 list members.
 * 7. Trace Context is strictly observability metadata and CANNOT modify or influence
 *    tenantId, principalId, roles, permissions, or security boundaries.
 */

export interface W3CTraceparent {
  readonly version: string;
  readonly traceId: string;
  readonly parentId: string;
  readonly traceFlags: string;
}

export interface W3CTracestateEntry {
  readonly key: string;
  readonly value: string;
}

export class W3CTraceContextError extends Error {
  readonly code = "W3C_TRACE_CONTEXT_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "W3CTraceContextError";
  }
}

const TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ALL_ZERO_TRACE_ID = "00000000000000000000000000000000";
const ALL_ZERO_PARENT_ID = "0000000000000000";

// W3C tracestate key: simple key ([a-z0-9_*/-]{1,256}) or multi-tenant (tenantId@vendorId)
const TRACESTATE_KEY_REGEX = /^[a-z0-9_*/-]{1,256}(?:@[a-z0-9_*/-]{1,241})?$/;
// W3C tracestate value: 0 to 256 ASCII characters excluding comma, equals, and controls
const TRACESTATE_VAL_REGEX = /^[\x21-\x2b\x2d-\x3c\x3e-\x7e]{0,256}$/;

export class W3CTraceContext {
  readonly traceparent: W3CTraceparent;
  readonly tracestate?: string | undefined;
  readonly tracestateEntries: readonly W3CTracestateEntry[];

  private constructor(
    traceparent: W3CTraceparent,
    tracestate?: string,
    tracestateEntries: readonly W3CTracestateEntry[] = []
  ) {
    this.traceparent = Object.freeze({ ...traceparent });
    this.tracestate = tracestate;
    this.tracestateEntries = Object.freeze([...tracestateEntries]);
    Object.freeze(this);
  }

  get traceId(): string {
    return this.traceparent.traceId;
  }

  get parentId(): string {
    return this.traceparent.parentId;
  }

  get traceFlags(): string {
    return this.traceparent.traceFlags;
  }

  get isSampled(): boolean {
    // Bit 0 of traceFlags is the recorded/sampled flag
    const flagsNum = parseInt(this.traceparent.traceFlags, 16);
    return (flagsNum & 1) === 1;
  }

  /**
   * Parses a W3C traceparent header string.
   * Throws W3CTraceContextError if invalid.
   */
  static parseTraceparent(raw: string): W3CTraceparent {
    if (typeof raw !== "string") {
      throw new W3CTraceContextError("traceparent must be a string");
    }
    const trimmed = raw.trim().toLowerCase();
    const match = TRACEPARENT_REGEX.exec(trimmed);
    if (!match) {
      throw new W3CTraceContextError(`Invalid traceparent format: '${raw}'`);
    }

    const version = match[1]!;
    const traceId = match[2]!;
    const parentId = match[3]!;
    const traceFlags = match[4]!;

    if (version === "ff") {
      throw new W3CTraceContextError("traceparent version 'ff' is forbidden by W3C specification");
    }

    if (traceId === ALL_ZERO_TRACE_ID) {
      throw new W3CTraceContextError("traceparent trace-id cannot be all zeros");
    }

    if (parentId === ALL_ZERO_PARENT_ID) {
      throw new W3CTraceContextError("traceparent parent-id cannot be all zeros");
    }

    return Object.freeze({
      version,
      traceId,
      parentId,
      traceFlags,
    });
  }

  /**
   * Serializes a W3CTraceparent object to canonical header string.
   */
  static serializeTraceparent(tp: W3CTraceparent): string {
    return `${tp.version}-${tp.traceId}-${tp.parentId}-${tp.traceFlags}`;
  }

  /**
   * Parses a W3C tracestate header string.
   * Invalid entries are discarded or throw based on strictness.
   */
  static parseTracestate(raw?: string): { readonly raw?: string; readonly entries: readonly W3CTracestateEntry[] } {
    if (!raw || typeof raw !== "string" || raw.trim() === "") {
      return { raw: undefined, entries: [] };
    }

    const trimmed = raw.trim();
    if (trimmed.length > 512) {
      throw new W3CTraceContextError("tracestate exceeds maximum allowed length of 512 characters");
    }

    const members = trimmed.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    if (members.length > 32) {
      throw new W3CTraceContextError("tracestate exceeds maximum allowed 32 list members");
    }

    const entries: W3CTracestateEntry[] = [];
    const seenKeys = new Set<string>();

    for (const member of members) {
      const eqIdx = member.indexOf("=");
      if (eqIdx === -1) {
        throw new W3CTraceContextError(`Malformed tracestate list member without '=': '${member}'`);
      }
      const key = member.slice(0, eqIdx).trim();
      const val = member.slice(eqIdx + 1).trim();

      if (!TRACESTATE_KEY_REGEX.test(key)) {
        throw new W3CTraceContextError(`Invalid tracestate key format: '${key}'`);
      }
      if (!TRACESTATE_VAL_REGEX.test(val)) {
        throw new W3CTraceContextError(`Invalid tracestate value characters for key '${key}'`);
      }

      if (seenKeys.has(key)) {
        throw new W3CTraceContextError(`Duplicate tracestate key detected: '${key}'`);
      }
      seenKeys.add(key);
      entries.push(Object.freeze({ key, value: val }));
    }

    return {
      raw: trimmed,
      entries: Object.freeze(entries),
    };
  }

  /**
   * Serializes an array of tracestate entries into header string.
   */
  static serializeTracestate(entries: readonly W3CTracestateEntry[]): string | undefined {
    if (!entries || entries.length === 0) return undefined;
    const serialized = entries.map((e) => `${e.key}=${e.value}`).join(",");
    return serialized.length > 0 ? serialized : undefined;
  }

  /**
   * Creates a W3CTraceContext from parsed elements or headers.
   */
  static create(traceparentStr: string, tracestateStr?: string): W3CTraceContext {
    const tp = W3CTraceContext.parseTraceparent(traceparentStr);
    const ts = W3CTraceContext.parseTracestate(tracestateStr);
    return new W3CTraceContext(tp, ts.raw, ts.entries);
  }

  /**
   * Generates a new fresh root W3CTraceContext with a 16-byte random traceId and 8-byte parentId.
   */
  static generate(sampled = true): W3CTraceContext {
    // 16 bytes = 32 hex characters
    const traceBytes = new Uint8Array(16);
    // 8 bytes = 16 hex characters
    const parentBytes = new Uint8Array(8);

    // Use globalThis.crypto if available, fallback to deterministic non-zero
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(traceBytes);
      globalThis.crypto.getRandomValues(parentBytes);
    } else {
      for (let i = 0; i < 16; i++) traceBytes[i] = Math.floor(Math.random() * 255) + 1;
      for (let i = 0; i < 8; i++) parentBytes[i] = Math.floor(Math.random() * 255) + 1;
    }

    // Ensure non-zero
    traceBytes[0] = traceBytes[0] === 0 ? 1 : traceBytes[0]!;
    parentBytes[0] = parentBytes[0] === 0 ? 1 : parentBytes[0]!;

    const hex = (buf: Uint8Array) => Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
    const traceId = hex(traceBytes);
    const parentId = hex(parentBytes);
    const traceFlags = sampled ? "01" : "00";

    return new W3CTraceContext({
      version: "00",
      traceId,
      parentId,
      traceFlags,
    });
  }

  /**
   * Safely tries to parse incoming headers (fail-open or discard strategy).
   * If traceparent is missing or invalid, returns undefined without throwing.
   */
  static tryParseHeaders(headers: Record<string, string | string[] | undefined>): W3CTraceContext | undefined {
    const getH = (name: string): string | undefined => {
      const val = headers[name.toLowerCase()] ?? headers[name];
      if (Array.isArray(val)) return val[0]?.trim();
      if (typeof val === "string") return val.trim();
      return undefined;
    };

    const rawTraceparent = getH("traceparent");
    if (!rawTraceparent) {
      return undefined;
    }

    try {
      const rawTracestate = getH("tracestate");
      return W3CTraceContext.create(rawTraceparent, rawTracestate);
    } catch {
      // W3C spec: when incoming traceparent is invalid, discard it
      return undefined;
    }
  }

  /**
   * Creates a child span context under this trace, generating a new parentId (spanId).
   */
  createChildSpan(newSpanId?: string): W3CTraceContext {
    let spanHex = newSpanId?.trim().toLowerCase();
    if (!spanHex || spanHex.length !== 16 || !/^[0-9a-f]{16}$/.test(spanHex) || spanHex === ALL_ZERO_PARENT_ID) {
      const spanBytes = new Uint8Array(8);
      if (typeof globalThis.crypto?.getRandomValues === "function") {
        globalThis.crypto.getRandomValues(spanBytes);
      } else {
        for (let i = 0; i < 8; i++) spanBytes[i] = Math.floor(Math.random() * 255) + 1;
      }
      spanBytes[0] = spanBytes[0] === 0 ? 1 : spanBytes[0]!;
      spanHex = Array.from(spanBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    return new W3CTraceContext(
      {
        version: this.traceparent.version,
        traceId: this.traceparent.traceId,
        parentId: spanHex,
        traceFlags: this.traceparent.traceFlags,
      },
      this.tracestate,
      this.tracestateEntries
    );
  }

  /**
   * Updates or prepends a vendor entry into tracestate as mandated by W3C.
   */
  withTracestateEntry(key: string, value: string): W3CTraceContext {
    const trimmedKey = key.trim().toLowerCase();
    const trimmedVal = value.trim();

    if (!TRACESTATE_KEY_REGEX.test(trimmedKey)) {
      throw new W3CTraceContextError(`Invalid tracestate key: '${key}'`);
    }
    if (!TRACESTATE_VAL_REGEX.test(trimmedVal)) {
      throw new W3CTraceContextError(`Invalid tracestate value: '${value}'`);
    }

    // Prepend (new or updated entries MUST be moved to the beginning of the list)
    const filtered = this.tracestateEntries.filter((e) => e.key !== trimmedKey);
    const updatedEntries = [Object.freeze({ key: trimmedKey, value: trimmedVal }), ...filtered];

    if (updatedEntries.length > 32) {
      updatedEntries.pop(); // discard oldest to maintain <= 32 limit
    }

    const newRaw = W3CTraceContext.serializeTracestate(updatedEntries);
    if (newRaw && newRaw.length > 512) {
      throw new W3CTraceContextError("Updated tracestate exceeds 512 characters");
    }

    return new W3CTraceContext(this.traceparent, newRaw, updatedEntries);
  }

  /**
   * Serializes this context to HTTP headers.
   */
  toHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      traceparent: W3CTraceContext.serializeTraceparent(this.traceparent),
    };
    if (this.tracestate) {
      headers.tracestate = this.tracestate;
    }
    return Object.freeze(headers);
  }
}
