import { spawnSync } from "node:child_process";

import type { ProviderName } from "./types.js";

export function extractBinaryFromTemplate(commandTemplate: string | null) {
  if (!commandTemplate) {
    return null;
  }

  const binary = commandTemplate.trim().split(/\s+/)[0]?.replaceAll('"', "");
  return binary || null;
}

export function detectBinary(commandTemplate: string | null) {
  const binary = extractBinaryFromTemplate(commandTemplate);

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

export function buildFallbackOrder(provider: ProviderName) {
  if (provider === "opencode") {
    return ["codex", "claude"] as const;
  }

  if (provider === "gemini") {
    return ["codex", "claude"] as const;
  }

  return [] as const;
}
