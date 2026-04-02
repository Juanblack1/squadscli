import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

import { DEFAULT_CONFIG } from "./default-config.js";
import { fileExists } from "./fs-utils.js";
import type { ProviderName, SoftwareFactoryConfig } from "./types.js";

const configSchema = z.object({
  version: z.string(),
  name: z.string(),
  outputDir: z.string(),
  defaultProvider: z.enum(["openai", "openai-compatible", "opencode"]),
  promptPolicy: z.object({
    askWhenBlocked: z.boolean(),
    improvePrompts: z.boolean(),
    requirePencilBeforeFrontend: z.boolean(),
    useGeminiForImages: z.boolean(),
  }),
});

export async function loadEnvironment(workspaceDir: string) {
  loadDotEnv({ quiet: true });
  loadDotEnv({ path: path.join(workspaceDir, ".env"), override: false, quiet: true });
}

export async function loadSoftwareFactoryConfig(workspaceDir: string): Promise<SoftwareFactoryConfig> {
  const configPath = path.join(workspaceDir, DEFAULT_CONFIG.outputDir, "software-factory.config.json");

  if (!(await fileExists(configPath))) {
    return DEFAULT_CONFIG;
  }

  const raw = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(configPath, "utf8")));
  return configSchema.parse(raw);
}

export function resolveProvider(preferred?: string, fallback?: ProviderName): ProviderName {
  const candidate = preferred ?? process.env.SF_PROVIDER ?? fallback ?? DEFAULT_CONFIG.defaultProvider;

  if (candidate === "opencode") {
    return "opencode";
  }

  if (candidate === "openai-compatible") {
    return "openai-compatible";
  }

  return "openai";
}
