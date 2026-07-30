/**
 * Feature flags — sistema simples baseado em env vars.
 *
 * Defina flags no .env:
 *   FEATURE_NEW_DASHBOARD=true
 *   FEATURE_BETA_API=false
 *
 * Uso:
 *   import { featureFlags } from "@/lib/feature-flags";
 *   if (featureFlags.newDashboard) { ... }
 */

type BooleanEnv = "true" | "false" | undefined;

function parseFlag(value: BooleanEnv): boolean {
  return value === "true";
}

export const featureFlags = {
  newDashboard: parseFlag(process.env.FEATURE_NEW_DASHBOARD as BooleanEnv),
  betaApi: parseFlag(process.env.FEATURE_BETA_API as BooleanEnv),
  enablePpr: parseFlag(process.env.ENABLE_PPR as BooleanEnv),
  enableReactCompiler: parseFlag(
    process.env.ENABLE_REACT_COMPILER as BooleanEnv,
  ),
} as const;

export type FeatureFlag = keyof typeof featureFlags;
