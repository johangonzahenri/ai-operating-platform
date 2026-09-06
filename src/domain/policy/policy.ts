export interface PolicyDecision { readonly allowed: boolean; readonly reason?: string; }
export interface PolicyEvaluator { evaluate(subject: string, action: string): PolicyDecision; }
