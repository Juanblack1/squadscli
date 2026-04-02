import path from "node:path";

import { loadEnvironment, loadSoftwareFactoryConfig, resolveProvider } from "../config.js";
import { fileExists } from "../fs-utils.js";
import { PROVIDER_COMMAND_TEMPLATES, PROVIDER_REGISTRY } from "../provider-registry.js";

export async function runDoctorCommand(workspaceDir: string, preferredProvider?: string) {
  await loadEnvironment(workspaceDir);

  const config = await loadSoftwareFactoryConfig(workspaceDir);
  const provider = resolveProvider(preferredProvider, config.defaultProvider);
  const configPath = path.join(workspaceDir, config.outputDir, "software-factory.config.json");
  const profile = PROVIDER_REGISTRY[provider];
  const commandTemplateKey = `${provider.toUpperCase().replaceAll("-", "_")}_COMMAND_TEMPLATE`;

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
    commandTemplate: profile.kind === "cli" ? process.env[commandTemplateKey] || PROVIDER_COMMAND_TEMPLATES[provider] || null : null,
    requiredEnvKeys: profile.envKeys,
    designRule: config.promptPolicy.requirePencilBeforeFrontend,
    imageRule: config.promptPolicy.useGeminiForImages,
  };

  return checks;
}
