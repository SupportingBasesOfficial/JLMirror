// @ai-context: .zero-error/architecture-map.md#state-store
// Central re-export for all Drizzle schema modules.
//
// PHASE 1 SCOPE (per refactor rollout plan): core identity/tenant modules
// PHASE 2 SCOPE: middleware + auth routes refactored to use Drizzle
// PHASE 3 SCOPE: Zabbix, Metrics (TimescaleDB hypertables), Logs (partitioned)
//
// Remaining tables from ideal_schema.sql will be migrated incrementally in
// later phases (see /refactor-blueprint/orm_and_types_blueprint.ts Section 13).
export * from "./tenant";
export * from "./auth";
export * from "./rbac";
export * from "./zabbix";
export * from "./metrics";
export * from "./logs";
