import { loadEnvironment } from "../config.js";
import { resolveModelForProvider } from "../model-utils.js";
import { PROVIDER_REGISTRY, listProviderNames } from "../provider-registry.js";
import type { ProviderName } from "../types.js";

export async function runModelsCommand(workspaceDir: string, provider?: ProviderName) {
  await loadEnvironment(workspaceDir);

  const providers = provider ? [provider] : listProviderNames();

  return {
    workspaceDir,
    globalModelOverride: process.env.SF_MODEL || null,
    providers: providers.map((name) => {
      const profile = PROVIDER_REGISTRY[name];
      return {
        provider: name,
        kind: profile.kind,
        modelEnvKey: profile.modelEnvKey || null,
        activeModel: resolveModelForProvider(name),
        suggestedModels: profile.suggestedModels || [],
        notes:
          profile.kind === "api"
            ? "Passe --model para sobrescrever o modelo do provider nesta execucao."
            : name === "codex" || name === "claude"
              ? "Passe --model para injetar a flag nativa de modelo neste provider CLI."
              : "Passe --model e ajuste o template do provider se o runner CLI suportar selecao explicita de modelo.",
      };
    }),
  };
}
