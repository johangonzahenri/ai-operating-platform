-- PostgreSQL Portable Schema for AI Operating Platform Cloud Deployment
-- Version: 1.1.0

CREATE TABLE IF NOT EXISTS platform_tenants (
  tenant_id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(64) NOT NULL DEFAULT 'FREE',
  status VARCHAR(64) NOT NULL DEFAULT 'ACTIVE',
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_tasks (
  task_id VARCHAR(128) PRIMARY KEY,
  trace_id VARCHAR(128) NOT NULL,
  tenant_id VARCHAR(128) NOT NULL DEFAULT 'default-tenant',
  agent_id VARCHAR(128) NOT NULL,
  status VARCHAR(64) NOT NULL,
  input JSONB NOT NULL,
  result JSONB,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_platform_tasks_trace ON platform_tasks(trace_id);
CREATE INDEX IF NOT EXISTS idx_platform_tasks_tenant ON platform_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_tasks_status ON platform_tasks(status);

CREATE TABLE IF NOT EXISTS platform_events (
  sequence_num BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(128) UNIQUE NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  trace_id VARCHAR(128) NOT NULL,
  tenant_id VARCHAR(128) NOT NULL DEFAULT 'default-tenant',
  aggregate_id VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_events_type ON platform_events(event_type);
CREATE INDEX IF NOT EXISTS idx_platform_events_trace ON platform_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_platform_events_tenant ON platform_events(tenant_id);

CREATE TABLE IF NOT EXISTS platform_usage_records (
  record_id VARCHAR(128) PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  metric VARCHAR(64) NOT NULL,
  quantity NUMERIC NOT NULL,
  period VARCHAR(64) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_period ON platform_usage_records(tenant_id, period);
