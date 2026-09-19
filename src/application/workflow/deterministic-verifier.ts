import {
  VerificationVerdict,
  VerificationMethod,
  WorkflowStepVerificationRule,
  ExpectedFieldType,
} from "../../domain/workflow/verification-result.js";

export interface EvaluationOutcome {
  readonly verdict: VerificationVerdict;
  readonly method: VerificationMethod;
  readonly reason?: string | undefined;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export class DeterministicVerifier {
  static evaluate(
    output: unknown,
    rule?: WorkflowStepVerificationRule
  ): EvaluationOutcome {
    const method: VerificationMethod = rule?.method ?? "DETERMINISTIC";
    const evidence: Record<string, unknown> = {
      evaluatedAt: new Date().toISOString(),
      ruleApplied: rule ? { ...rule } : "default-presence-check",
    };

    // 1. Output presence check
    if (output === undefined || output === null) {
      return {
        verdict: "MISSING",
        method,
        reason: "Output payload is absent or null",
        evidence: { ...evidence, actualOutput: null },
      };
    }

    if (typeof output !== "object") {
      return {
        verdict: "MALFORMED",
        method,
        reason: `Output must be a structured object, received ${typeof output}`,
        evidence: { ...evidence, actualType: typeof output },
      };
    }

    const outputObj = output as Record<string, unknown>;
    evidence.outputKeys = Object.keys(outputObj);

    // Check for explicit conflict flags in output
    if (outputObj.conflict === true || outputObj.hasConflict === true || outputObj.status === "CONFLICT") {
      return {
        verdict: "CONFLICT",
        method,
        reason: typeof outputObj.conflictReason === "string" ? outputObj.conflictReason : "Conflict detected in execution output assertions",
        evidence: { ...evidence, output: outputObj },
      };
    }

    // Check for explicit ambiguous flags in output
    if (outputObj.ambiguous === true || outputObj.isAmbiguous === true || outputObj.status === "AMBIGUOUS") {
      return {
        verdict: "AMBIGUOUS",
        method,
        reason: typeof outputObj.ambiguousReason === "string" ? outputObj.ambiguousReason : "Execution output is ambiguous or indeterminate",
        evidence: { ...evidence, output: outputObj },
      };
    }

    // If no explicit rule provided, standard presence & non-empty pass
    if (!rule) {
      return {
        verdict: "PASS",
        method: "DETERMINISTIC",
        reason: "Default deterministic output presence verified",
        evidence,
      };
    }

    // 2. Required Fields Check
    if (rule.requiredFields && Array.isArray(rule.requiredFields)) {
      for (const field of rule.requiredFields) {
        if (!(field in outputObj) || outputObj[field] === undefined) {
          return {
            verdict: "MISSING",
            method: rule.method ?? "SCHEMA",
            reason: `Required field '${field}' is missing from step output`,
            evidence: { ...evidence, missingField: field },
          };
        }
      }
    }

    // 3. Field Types Check
    if (rule.fieldTypes) {
      for (const [field, expectedType] of Object.entries(rule.fieldTypes)) {
        if (field in outputObj && outputObj[field] !== undefined) {
          const val = outputObj[field];
          const actualType = DeterministicVerifier.resolveType(val);
          if (actualType !== expectedType) {
            return {
              verdict: "MALFORMED",
              method: rule.method ?? "SCHEMA",
              reason: `Field '${field}' expected type '${expectedType}', got '${actualType}'`,
              evidence: { ...evidence, field, expectedType, actualType, actualValue: val },
            };
          }
        }
      }
    }

    // 4. Allowed Values Check
    if (rule.allowedValues) {
      for (const [field, allowedList] of Object.entries(rule.allowedValues)) {
        if (field in outputObj && outputObj[field] !== undefined) {
          const val = outputObj[field];
          if (!allowedList.includes(val)) {
            return {
              verdict: "FAIL",
              method: rule.method ?? "RULE",
              reason: `Field '${field}' value '${String(val)}' is not in allowed set: [${allowedList.map(String).join(", ")}]`,
              evidence: { ...evidence, field, allowedList, actualValue: val },
            };
          }
        }
      }
    }

    // 5. Numeric Ranges Check
    if (rule.numericRanges) {
      for (const [field, range] of Object.entries(rule.numericRanges)) {
        if (field in outputObj && typeof outputObj[field] === "number") {
          const numVal = outputObj[field] as number;
          if (range.min !== undefined && numVal < range.min) {
            return {
              verdict: "FAIL",
              method: rule.method ?? "INVARIANT",
              reason: `Field '${field}' value ${numVal} is below minimum allowed ${range.min}`,
              evidence: { ...evidence, field, min: range.min, actualValue: numVal },
            };
          }
          if (range.max !== undefined && numVal > range.max) {
            return {
              verdict: "FAIL",
              method: rule.method ?? "INVARIANT",
              reason: `Field '${field}' value ${numVal} exceeds maximum allowed ${range.max}`,
              evidence: { ...evidence, field, max: range.max, actualValue: numVal },
            };
          }
        }
      }
    }

    // 6. Custom Invariants Check
    if (rule.customInvariants && Array.isArray(rule.customInvariants)) {
      for (const inv of rule.customInvariants) {
        if (inv === "non-empty-object" && Object.keys(outputObj).length === 0) {
          return {
            verdict: "FAIL",
            method: rule.method ?? "INVARIANT",
            reason: "Output object must not be empty",
            evidence: { ...evidence, invariant: inv },
          };
        }
        if (inv === "no-null-fields") {
          for (const [k, v] of Object.entries(outputObj)) {
            if (v === null) {
              return {
                verdict: "MALFORMED",
                method: rule.method ?? "INVARIANT",
                reason: `Field '${k}' must not be null`,
                evidence: { ...evidence, invariant: inv, nullField: k },
              };
            }
          }
        }
      }
    }

    return {
      verdict: "PASS",
      method,
      reason: "All deterministic verification rules satisfied",
      evidence: { ...evidence, verifiedFieldsCount: Object.keys(outputObj).length },
    };
  }

  private static resolveType(val: unknown): ExpectedFieldType | "null" | "undefined" {
    if (val === null) return "null";
    if (val === undefined) return "undefined";
    if (Array.isArray(val)) return "array";
    const t = typeof val;
    if (t === "string" || t === "number" || t === "boolean" || t === "object") {
      return t as ExpectedFieldType;
    }
    return "object";
  }
}
