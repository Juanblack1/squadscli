import { PROVIDER_REGISTRY } from "./provider-registry.js";
import type { ProviderName } from "./types.js";

export function resolveModelForProvider(provider: ProviderName, explicitModel?: string) {
  if (explicitModel?.trim()) {
    return explicitModel.trim();
  }

  if (process.env.SF_MODEL?.trim()) {
    return process.env.SF_MODEL.trim();
  }

  const envKey = PROVIDER_REGISTRY[provider].modelEnvKey;
  if (envKey && process.env[envKey]?.trim()) {
    return process.env[envKey]!.trim();
  }

  return undefined;
}
