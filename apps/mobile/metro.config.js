// Metro config — resolve workspaces do monorepo pnpm
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

// Forca o Metro server root a ser o project root (apps/mobile) em vez do monorepo root.
// Sem isso, o expo export:embed resolve o entry file do monorepo root, falhando
// com "Unable to resolve module ./../../node_modules/expo-router/entry.js".
// A env var EXPO_NO_METRO_WORKSPACE_ROOT desabilita o resolveWorkspaceRoot em @expo/config/paths.
process.env.EXPO_NO_METRO_WORKSPACE_ROOT = "true";

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Forca o projectRoot para o diretorio do app (apps/mobile)
config.projectRoot = projectRoot;

// Monitora arquivos do monorepo inteiro (packages/* compartilhados)
config.watchFolders = [monorepoRoot];

// Resolve node_modules do monorepo (pnpm workspaces)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Suporta platform-specific extensions (.native.ts, .ios.ts, .android.ts)
config.resolver.sourceExts = config.resolver.sourceExts ?? [];
if (!config.resolver.sourceExts.includes("cjs")) {
  config.resolver.sourceExts.push("cjs");
}

module.exports = withNativeWind(config, {
  input: path.resolve(projectRoot, "src/theme/global.css"),
  configPath: path.resolve(projectRoot, "tailwind.config.js"),
});
