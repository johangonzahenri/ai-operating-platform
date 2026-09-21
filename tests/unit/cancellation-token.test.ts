import test from 'node:test';
import * as assert from 'node:assert/strict';
import { PlatformCancellationToken, CancellationReason } from '../../src/domain/execution/cancellation.js';

test('PlatformCancellationToken', async (t) => {
  await t.test('1. New token is not cancelled', () => {
    const token = new PlatformCancellationToken();
    assert.equal(token.isCancelled, false);
    assert.equal(token.signal.aborted, false);
    assert.equal(token.reason, undefined);
  });

  await t.test('2. Cancel sets isCancelled = true', () => {
    const token = new PlatformCancellationToken();
    const reason: CancellationReason = { source: 'operator', message: 'Test cancel', timestamp: new Date(), propagationPath: ['test'] };
    token.cancel(reason);
    assert.equal(token.isCancelled, true);
  });

  await t.test('3. Cancel records reason with source, message, timestamp', () => {
    const token = new PlatformCancellationToken();
    const timestamp = new Date();
    const reason: CancellationReason = { source: 'operator', message: 'Test cancel', timestamp, propagationPath: ['test'] };
    token.cancel(reason);
    assert.deepEqual(token.reason, reason);
  });

  await t.test('4. Signal is aborted after cancel', () => {
    const token = new PlatformCancellationToken();
    const reason: CancellationReason = { source: 'operator', message: 'Test cancel', timestamp: new Date(), propagationPath: ['test'] };
    token.cancel(reason);
    assert.equal(token.signal.aborted, true);
    assert.equal(token.signal.reason, 'Test cancel');
  });

  await t.test('5. Double cancel is idempotent (reason preserved from first cancel)', () => {
    const token = new PlatformCancellationToken();
    const reason1: CancellationReason = { source: 'operator', message: 'First cancel', timestamp: new Date(), propagationPath: ['test'] };
    const reason2: CancellationReason = { source: 'system', message: 'Second cancel', timestamp: new Date(), propagationPath: ['test2'] };
    token.cancel(reason1);
    token.cancel(reason2);
    assert.deepEqual(token.reason, reason1);
  });

  await t.test('6. Child token cancels when parent cancels', () => {
    const parent = new PlatformCancellationToken();
    const child = PlatformCancellationToken.createChild(parent);
    assert.equal(child.isCancelled, false);
    
    parent.cancel({ source: 'operator', message: 'Parent cancel', timestamp: new Date(), propagationPath: ['root'] });
    assert.equal(child.isCancelled, true);
    assert.equal(child.reason?.source, 'parent');
    assert.equal(child.reason?.message, 'Parent cancel');
  });

  await t.test('7. Child token is independent if parent not cancelled', () => {
    const parent = new PlatformCancellationToken();
    const child = PlatformCancellationToken.createChild(parent);
    
    child.cancel({ source: 'operator', message: 'Child cancel', timestamp: new Date(), propagationPath: ['child'] });
    
    assert.equal(child.isCancelled, true);
    assert.equal(parent.isCancelled, false);
  });

  await t.test('8. Pre-cancelled parent creates pre-cancelled child', () => {
    const parent = new PlatformCancellationToken();
    parent.cancel({ source: 'operator', message: 'Pre-cancelled', timestamp: new Date(), propagationPath: ['root'] });
    
    const child = PlatformCancellationToken.createChild(parent);
    
    assert.equal(child.isCancelled, true);
    assert.equal(child.reason?.message, 'Pre-cancelled');
  });

  await t.test('9. Propagation path tracks hierarchy', () => {
    const parent = new PlatformCancellationToken();
    const child1 = PlatformCancellationToken.createChild(parent);
    const child2 = PlatformCancellationToken.createChild(child1);
    
    parent.cancel({ source: 'operator', message: 'Root cancel', timestamp: new Date(), propagationPath: ['root'] });
    
    assert.deepEqual(parent.reason?.propagationPath, ['root']);
    assert.deepEqual(child1.reason?.propagationPath, ['root', 'child']);
    assert.deepEqual(child2.reason?.propagationPath, ['root', 'child', 'child']);
  });
});
