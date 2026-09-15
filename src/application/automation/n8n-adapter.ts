export interface N8nNodeDescriptor {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly version: number;
  readonly defaults: { name: string };
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly properties: readonly any[];
}

export class N8nPlatformAdapter {
  static getIntegrationManifest() {
    return {
      name: "n8n-nodes-ai-operating-platform",
      version: "1.1.0",
      description: "Official n8n community node integration for AI Operating Platform",
      nodes: [
        {
          name: "aiOperatingPlatformTrigger",
          displayName: "AI Operating Platform Trigger",
          description: "Listens for real-time events from AI Operating Platform via HMAC-signed Webhooks",
          version: 1,
          inputs: [],
          outputs: ["main"],
          properties: [
            {
              displayName: "Events",
              name: "events",
              type: "multiOptions",
              options: [
                { name: "Order Placed", value: "order.placed" },
                { name: "AR Fitting Completed", value: "ar.tryon_completed" },
                { name: "Agent Security Alert", value: "agent.security_alert" },
                { name: "Inventory Low", value: "inventory.low" },
              ],
              default: ["order.placed"],
              required: true,
            },
          ],
        },
        {
          name: "aiOperatingPlatformAction",
          displayName: "AI Operating Platform Action",
          description: "Executes governed tasks and agent operations on AI Operating Platform",
          version: 1,
          inputs: ["main"],
          outputs: ["main"],
          properties: [
            {
              displayName: "Resource",
              name: "resource",
              type: "options",
              options: [
                { name: "Agent Operation", value: "operation" },
                { name: "AR Asset", value: "arAsset" },
                { name: "Report", value: "report" },
              ],
              default: "operation",
            },
          ],
        },
      ],
    };
  }
}
