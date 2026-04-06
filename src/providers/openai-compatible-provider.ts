import OpenAI from "openai";

import type { PromptBundle, ProviderAdapter, ProviderResult, RunRequest } from "../types.js";

export class OpenAICompatibleProvider implements ProviderAdapter {
  name = "openai-compatible" as const;

  async invoke(prompt: PromptBundle, request: RunRequest): Promise<ProviderResult> {
    const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
    const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL;

    if (!apiKey) {
      throw new Error("OPENAI_COMPATIBLE_API_KEY nao definido.");
    }

    if (!baseURL) {
      throw new Error("OPENAI_COMPATIBLE_BASE_URL nao definido.");
    }

    const client = new OpenAI({ apiKey, baseURL });
    const response = await client.responses.create({
      model: request.model || process.env.OPENAI_COMPATIBLE_MODEL || "gpt-4.1",
      instructions: prompt.system,
      input: prompt.user,
    });

    const text = response.output_text?.trim();

    if (!text) {
      throw new Error("Resposta vazia do provider OpenAI-compatible.");
    }

    return { text, raw: response };
  }
}
