import path from "node:path";

import { loadEnvironment } from "../config.js";
import { generateGeminiImage } from "../providers/gemini-image-provider.js";

export async function runGenerateImageCommand(options: {
  workspaceDir: string;
  prompt: string;
  outputPath: string;
  aspectRatio: string;
  model?: string;
}) {
  await loadEnvironment(options.workspaceDir);

  const outputPath = path.isAbsolute(options.outputPath)
    ? options.outputPath
    : path.join(options.workspaceDir, options.outputPath);

  return await generateGeminiImage({
    prompt: options.prompt,
    outputPath,
    aspectRatio: options.aspectRatio,
    model: options.model,
  });
}
