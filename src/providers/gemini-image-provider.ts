import fs from "node:fs/promises";
import path from "node:path";

import { GoogleGenAI } from "@google/genai";

import { ensureDir } from "../fs-utils.js";

export async function generateGeminiImage(options: {
  prompt: string;
  outputPath: string;
  aspectRatio: string;
  model?: string;
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY nao definido.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = options.model || process.env.GEMINI_IMAGE_MODEL || "imagen-4.0-generate-001";

  const result = await ai.models.generateImages({
    model,
    prompt: options.prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: options.aspectRatio,
    },
  });

  const imageBytes = result.generatedImages?.[0]?.image?.imageBytes;

  if (!imageBytes) {
    throw new Error("Gemini Imagen nao retornou bytes de imagem.");
  }

  const buffer = Buffer.from(imageBytes, "base64");
  await ensureDir(path.dirname(options.outputPath));
  await fs.writeFile(options.outputPath, buffer);

  const metaPath = `${options.outputPath}.json`;
  await fs.writeFile(
    metaPath,
    JSON.stringify(
      {
        provider: "gemini",
        model,
        aspectRatio: options.aspectRatio,
        prompt: options.prompt,
        outputPath: options.outputPath,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    outputPath: options.outputPath,
    metaPath,
    bytes: buffer.length,
    model,
  };
}
