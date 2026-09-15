import crypto from "node:crypto";

export interface WebhookSubscription {
  readonly id: string;
  readonly tenantId: string;
  readonly targetUrl: string;
  readonly secretKey: string;
  readonly subscribedEvents: readonly string[]; // e.g. ["order.placed", "ar.tryon_completed", "agent.alert"]
  readonly active: boolean;
  readonly createdAt: string;
}

export interface WebhookPayload {
  readonly eventId: string;
  readonly eventType: string;
  readonly timestamp: string;
  readonly tenantId: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface DispatchResult {
  readonly subscriptionId: string;
  readonly targetUrl: string;
  readonly status: number;
  readonly success: boolean;
  readonly durationMs: number;
  readonly attempt: number;
  readonly error?: string | undefined;
}

export class WebhookDispatcher {
  private readonly subscriptions: Map<string, WebhookSubscription> = new Map();
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn?: typeof fetch) {
    this.fetchFn = fetchFn || globalThis.fetch;
  }

  registerSubscription(sub: WebhookSubscription): void {
    if (!sub.targetUrl || !sub.targetUrl.startsWith("http")) {
      throw new Error("Invalid webhook target URL: must be valid HTTP/HTTPS URL");
    }
    if (!sub.secretKey || sub.secretKey.length < 16) {
      throw new Error("Webhook secret key must be at least 16 characters for cryptographic security");
    }
    this.subscriptions.set(sub.id, sub);
  }

  getSubscription(id: string): WebhookSubscription | undefined {
    return this.subscriptions.get(id);
  }

  listSubscriptions(tenantId?: string): readonly WebhookSubscription[] {
    const list = Array.from(this.subscriptions.values());
    return tenantId ? list.filter((s) => s.tenantId === tenantId) : list;
  }

  deleteSubscription(id: string): boolean {
    return this.subscriptions.delete(id);
  }

  static generateSignature(payloadString: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
  }

  static verifySignature(payloadString: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }

  async dispatchEvent(payload: WebhookPayload, maxRetries = 3): Promise<readonly DispatchResult[]> {
    const results: DispatchResult[] = [];
    const subs = Array.from(this.subscriptions.values()).filter(
      (s) => s.active && (s.subscribedEvents.includes("*") || s.subscribedEvents.includes(payload.eventType))
    );

    for (const sub of subs) {
      const payloadStr = JSON.stringify(payload);
      const signature = WebhookDispatcher.generateSignature(payloadStr, sub.secretKey);
      let attempt = 0;
      let lastErr: string | undefined;
      let status = 0;
      let success = false;
      const startTime = Date.now();

      while (attempt < maxRetries && !success) {
        attempt++;
        try {
          const res = await this.fetchFn(sub.targetUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Platform-Signature-256": signature,
              "X-Platform-Event-Type": payload.eventType,
              "X-Platform-Event-Id": payload.eventId,
              "X-Platform-Timestamp": payload.timestamp,
            },
            body: payloadStr,
          });
          status = res.status;
          if (res.ok) {
            success = true;
          } else {
            lastErr = `HTTP ${res.status}: ${await res.text().catch(() => "")}`;
          }
        } catch (err: any) {
          lastErr = err.message || String(err);
        }
      }

      results.push({
        subscriptionId: sub.id,
        targetUrl: sub.targetUrl,
        status,
        success,
        durationMs: Date.now() - startTime,
        attempt,
        error: success ? undefined : lastErr,
      });
    }

    return results;
  }
}
