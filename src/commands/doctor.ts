import { spawnSync } from "node:child_process";
import path from "node:path";

import { loadEnvironment, loadSoftwareFactoryConfig, resolveProvider } from "../config.js";
import { fileExists } from "../fs-utils.js";
import { PROVIDER_COMMAND_TEMPLATES, PROVIDER_REGISTRY } from "../provider-registry.js";

function detectBinary(commandTemplate: string | null) {
  if (!commandTemplate) {
    return null;
  }

  const binary = commandTemplate.trim().split(/\s+/)[0]?.replaceAll('"', "");

  if (!binary) {
    return null;
  }

  const locator = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(locator, [binary], { encoding: "utf8" });

  return {
    binary,
    available: result.status === 0,
    resolvedPath: result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null,
  };
}

export async function runDoctorCommand(workspaceDir: string, preferredProvider?: string) {
  await loadEnvironment(workspaceDir);

  const config = await loadSoftwareFactoryConfig(workspaceDir);
  const provider = resolveProvider(preferredProvider, config.defaultProvider);
  const configPath = path.join(workspaceDir, config.outputDir, "software-factory.config.json");
  const profile = PROVIDER_REGISTRY[provider];
  const commandTemplateKey = `${provider.toUpperCase().replaceAll("-", "_")}_COMMAND_TEMPLATE`;
  const commandTemplate = profile.kind === "cli" ? process.env[commandTemplateKey] || PROVIDER_COMMAND_TEMPLATES[provider] || null : null;

  const checks = {
    workspaceDir,
    provider,
    providerKind: profile.kind,
    configPath,
    hasConfig: await fileExists(configPath),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasOpenAiCompatibleKey: Boolean(process.env.OPENAI_COMPATIBLE_API_KEY),
    hasOpenAiCompatibleBaseUrl: Boolean(process.env.OPENAI_COMPATIBLE_BASE_URL),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    commandTemplate,
    commandBinary: detectBinary(commandTemplate),
    requiredEnvKeys: profile.envKeys,
    designRule: config.promptPolicy.requirePencilBeforeFrontend,
    imageRule: config.promptPolicy.useGeminiForImages,
  };

  return checks;
}
