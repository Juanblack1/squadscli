import path from "node:path";

import {
  DEFAULT_AUTONOMY_PROMPT,
  DEFAULT_CONFIG,
  DEFAULT_FULL_RUN_PROMPT,
  DEFAULT_POLICIES_MD,
  DEFAULT_REVIEW_PROMPT,
} from "../default-config.js";
import { ensureDir, fileExists, writeText } from "../fs-utils.js";

export async function runInitCommand(targetDir: string, force: boolean) {
  const stateDir = path.join(targetDir, DEFAULT_CONFIG.outputDir);
  const configPath = path.join(stateDir, "software-factory.config.json");

  if (!force && (await fileExists(configPath))) {
    throw new Error(`Ja existe configuracao em ${configPath}. Use --force para sobrescrever.`);
  }

  await ensureDir(path.join(stateDir, "prompts"));
  await ensureDir(path.join(stateDir, "runs"));

  await writeText(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  await writeText(path.join(stateDir, "POLICIES.md"), `${DEFAULT_POLICIES_MD}\n`);
  await writeText(path.join(stateDir, "prompts", "full-run.md"), `${DEFAULT_FULL_RUN_PROMPT}\n`);
  await writeText(path.join(stateDir, "prompts", "review.md"), `${DEFAULT_REVIEW_PROMPT}\n`);
  await writeText(path.join(stateDir, "prompts", "autonomy.md"), `${DEFAULT_AUTONOMY_PROMPT}\n`);
}
