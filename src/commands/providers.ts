import path from "node:path";

import { loadEnvironment, loadSoftwareFactoryConfig } from "../config.js";
import { PROVIDER_COMMAND_TEMPLATES, PROVIDER_REGISTRY, listProviderNames } from "../provider-registry.js";
import { buildFallbackOrder, detectBinary } from "../provider-utils.js";

function isApiProviderReady(provider: string) {
  if (provider === "openai") {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  if (provider === "openai-compatible") {
    return Boolean(process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_BASE_URL);
  }

  return Boolean(process.env.GEMINI_API_KEY);
}

export async function runProvidersCommand(workspaceDir: string) {
  await loadEnvironment(workspaceDir);

  const config = await loadSoftwareFactoryConfig(workspaceDir);

  return {
    workspaceDir,
    defaultProvider: config.defaultProvider,
    defaultEffort: config.defaultEffort,
    providers: listProviderNames().map((provider) => {
      const profile = PROVIDER_REGISTRY[provider];
      const templateKey = `${provider.toUpperCase().replaceAll("-", "_")}_COMMAND_TEMPLATE`;
      const commandTemplate = profile.kind === "cli" ? process.env[templateKey] || PROVIDER_COMMAND_TEMPLATES[provider] || null : null;
      const commandBinary = detectBinary(commandTemplate);

      return {
        provider,
        kind: profile.kind,
        description: profile.description,
        tokenStrategy: profile.tokenStrategy,
        envKeys: profile.envKeys,
        commandTemplate,
        commandBinary,
        ready: profile.kind === "api" ? isApiProviderReady(provider) : Boolean(commandBinary?.available),
        fallbackProviders: buildFallbackOrder(provider).map((fallback) => ({
          provider: fallback,
          commandTemplate:
            process.env[`${fallback.toUpperCase().replaceAll("-", "_")}_COMMAND_TEMPLATE`] ||
            PROVIDER_COMMAND_TEMPLATES[fallback] ||
            null,
          commandBinary: detectBinary(
            process.env[`${fallback.toUpperCase().replaceAll("-", "_")}_COMMAND_TEMPLATE`] ||
              PROVIDER_COMMAND_TEMPLATES[fallback] ||
              null,
          ),
        })),
      };
    }),
    configPath: path.join(workspaceDir, config.outputDir, "software-factory.config.json"),
  };
}
