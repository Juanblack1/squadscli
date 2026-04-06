import OpenAI from "openai";

import type { PromptBundle, ProviderAdapter, ProviderResult, RunRequest } from "../types.js";

export class OpenAIProvider implements ProviderAdapter {
  name = "openai" as const;

  async invoke(prompt: PromptBundle, request: RunRequest): Promise<ProviderResult> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY nao definido.");
    }

    const client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });

    const response = await client.responses.create({
      model: request.model || process.env.OPENAI_MODEL || "gpt-5.4",
      instructions: prompt.system,
      input: prompt.user,
    });

    const text = response.output_text?.trim();

    if (!text) {
      throw new Error("Resposta vazia do provider OpenAI.");
    }

    return {
      text,
      raw: response,
    } satisfies ProviderResult;
  }
}
