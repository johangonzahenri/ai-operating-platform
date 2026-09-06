import { PolicyContext, PolicyDecision, PolicyGateway } from "../../domain/policy/policy.js";
export type PolicyRule = (context: PolicyContext) => PolicyDecision;
export class InMemoryPolicyGateway implements PolicyGateway {
  constructor(private readonly rule: PolicyRule = () => ({ allowed: true, policyId: "allow-all" })) {}
  async evaluate(context: PolicyContext): Promise<PolicyDecision> { return this.rule(context); }
}
