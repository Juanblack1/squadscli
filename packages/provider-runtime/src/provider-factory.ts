import type { ProviderAdapter, ProviderName } from "../../core/src/index.js";

import { PROVIDER_REGISTRY } from "./provider-registry.js";
import { CommandTemplateProvider } from "./providers/command-template-provider.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible-provider.js";
import { OpenAIProvider } from "./providers/openai-provider.js";

export function createProvider(name: ProviderName): ProviderAdapter {
  if (name === "openai-compatible") {
    return new OpenAICompatibleProvider();
  }

  if (name === "openai") {
    return new OpenAIProvider();
  }

  if (PROVIDER_REGISTRY[name].kind === "cli") {
    return new CommandTemplateProvider(name);
  }

  return new OpenAIProvider();
}
