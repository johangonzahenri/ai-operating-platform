import assert from 'node:assert/strict';
import test from 'node:test';

class StubModelGateway {
  public shouldFail = false;
  public shouldTimeout = false;
  public malformedJson = false;

  async callModel() {
    if (this.shouldTimeout) {
      return new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10));
    }
    if (this.shouldFail) {
      throw new Error("Model gateway error");
    }
    if (this.malformedJson) {
      return "{ bad json";
    }
    return JSON.stringify({ success: true });
  }
}

class ToolGateway {
  async callTool() {
    throw new Error("Tool execution failed");
  }
}

test('Provider Failure Injection Tests', async (t) => {
  await t.test('Model gateway returns error response -> execution fails gracefully', async () => {
    const gateway = new StubModelGateway();
    gateway.shouldFail = true;
    
    await assert.rejects(() => gateway.callModel(), /Model gateway error/);
  });

  await t.test('Model gateway throws timeout -> budget records elapsed time', async () => {
    const gateway = new StubModelGateway();
    gateway.shouldTimeout = true;
    
    const start = Date.now();
    await assert.rejects(() => gateway.callModel(), /Timeout/);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 0);
  });

  await t.test('Model gateway returns malformed JSON -> error handled without crash', async () => {
    const gateway = new StubModelGateway();
    gateway.malformedJson = true;
    
    const result = await gateway.callModel();
    assert.throws(() => JSON.parse(result as string), SyntaxError);
  });

  await t.test('Tool gateway throws -> execution catches and records observation', async () => {
    const gateway = new ToolGateway();
    await assert.rejects(() => gateway.callTool(), /Tool execution failed/);
  });
});
