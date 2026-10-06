/**
 * index.ts
 * PROJ-03 Fleet Management & Logistics — Satellite Persistence Barrel Export
 */

export * from './sqlite/fleet-sqlite-errors.js';
export * from './sqlite/fleet-sqlite-database.js';
export * from './sqlite/fleet-sqlite-schema.js';
export * from './sqlite/fleet-mapper.js';
export * from './sqlite/sqlite-vehicle-repository.js';
export * from './sqlite/sqlite-telemetry-repository.js';

export * from './in-memory/in-memory-vehicle-repository.js';
export * from './in-memory/in-memory-telemetry-repository.js';
