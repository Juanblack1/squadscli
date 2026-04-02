import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "./default-config.js";
import { buildPrompt } from "./prompt-builder.js";

describe("buildPrompt", () => {
  it("enforces Pencil and Gemini rules in full-run mode", () => {
    const prompt = buildPrompt(
      DEFAULT_CONFIG,
      "Criar dashboard de onboarding",
      "full-run",
      "C:/repo",
    );

    expect(prompt.system).toContain("Pencil-first UX gate");
    expect(prompt.system).toContain("Gemini Imagen");
    expect(prompt.user).toContain("UX and design agent must draw screens in Pencil");
  });

  it("changes instruction block for review mode", () => {
    const prompt = buildPrompt(
      DEFAULT_CONFIG,
      "Revisar a feature atual",
      "review",
      "C:/repo",
    );

    expect(prompt.system).toContain("Mode: review.");
    expect(prompt.system).toContain("findings by severity");
  });

  it("embeds exact PRD and task headings for full-run mode", () => {
    const prompt = buildPrompt(DEFAULT_CONFIG, "Criar feature", "full-run", "C:/repo");

    expect(prompt.system).toContain("Mode: full-run.");
    expect(prompt.user).toContain("Run mode: full-run");
  });
});
