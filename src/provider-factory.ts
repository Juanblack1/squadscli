import { OpenAICompatibleProvider } from "./providers/openai-compatible-provider.js";
import { OpenCodeProvider } from "./providers/opencode-provider.js";
import { OpenAIProvider } from "./providers/openai-provider.js";
import type { ProviderAdapter, ProviderName } from "./types.js";

export function createProvider(name: ProviderName): ProviderAdapter {
  if (name === "opencode") {
    return new OpenCodeProvider();
  }

  if (name === "openai-compatible") {
    return new OpenAICompatibleProvider();
  }

  return new OpenAIProvider();
}
