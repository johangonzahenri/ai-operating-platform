import assert from 'node:assert/strict';
import test from 'node:test';
import { TeamResourceBudget } from '../../src/domain/organization/index.js';
import { SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.js';
import { SqliteTeamResourceBudgetRepository } from '../../src/infrastructure/persistence/sqlite/sqlite-team-resource-budget-repository.js';
import { unlinkSync, existsSync } from 'node:fs';

test('Budget Race Condition Injection Tests', async (t) => {
  const dbPath = 'data/test-budget-race-injection.db';
  if (existsSync(dbPath)) unlinkSync(dbPath);

  const dbManager = new SqliteDatabase({ dbPath });
  const repo = new SqliteTeamResourceBudgetRepository(dbManager);

  t.after(() => {
    dbManager.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  await t.test('Two concurrent consumption requests on same budget -> only one succeeds', async () => {
    const raceBudget = TeamResourceBudget.create({
      id: 'trb_race-team-inj',
      teamId: 'race-team-inj',
      organizationId: 'org-1',
      tenantId: 'tenant-1',
      limits: {
        maxExecutions: 1,
        maxModelCalls: 10,
        maxToolCalls: 10,
        maxAutonomousSteps: 10,
        maxDurationMs: 10000,
      },
    });
    await repo.save(raceBudget);

    const [res1, res2] = await Promise.all([
      repo.consumeAtomic('race-team-inj', 'tenant-1', { executions: 1 }),
      repo.consumeAtomic('race-team-inj', 'tenant-1', { executions: 1 }),
    ]);

    const successes = [res1, res2].filter((r) => r.success);
    const failures = [res1, res2].filter((r) => !r.success);

    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
  });

  await t.test('Budget exhausted mid-operation -> operation transitions to BUDGET_EXHAUSTED', async () => {
    const budget = await repo.findByTeamId('race-team-inj', 'tenant-1');
    assert.equal(budget?.status, 'EXHAUSTED');
    assert.equal(budget?.isExhausted(), true);
  });

  await t.test('Rapid sequential consumptions don\'t overshoot hard limits', async () => {
    const seqBudget = TeamResourceBudget.create({
      id: 'trb_seq-team-inj',
      teamId: 'seq-team-inj',
      organizationId: 'org-1',
      tenantId: 'tenant-1',
      limits: {
        maxExecutions: 5,
        maxModelCalls: 10,
        maxToolCalls: 10,
        maxAutonomousSteps: 10,
        maxDurationMs: 10000,
      },
    });
    await repo.save(seqBudget);

    const promises = Array.from({ length: 10 }).map(() => 
      repo.consumeAtomic('seq-team-inj', 'tenant-1', { executions: 1 })
    );

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    assert.equal(successes.length, 5);
    assert.equal(failures.length, 5);

    const finalBudget = await repo.findByTeamId('seq-team-inj', 'tenant-1');
    assert.equal(finalBudget?.consumed.executions, 5);
  });
});
