const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "../..");
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Stub out @opentelemetry/api used by @supabase/postgrest-js
// to prevent Hermes from choking on raw dynamic import() expressions.
config.resolver.extraNodeModules = {
  "@opentelemetry/api": path.resolve(__dirname, "lib/opentelemetry-stub.js"),
};

module.exports = config;
