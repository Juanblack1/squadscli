import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "./default-config.js";
import { buildPrompt } from "./prompt-builder.js";

describe("buildPrompt", () => {
  it("enforces Pencil and Gemini rules in full-run mode", () => {
    const prompt = buildPrompt(
      DEFAULT_CONFIG,
      "Criar dashboard de onboarding",
      "full-run",
      "full-run",
      "balanced",
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
      "review",
      "balanced",
      "C:/repo",
    );

    expect(prompt.system).toContain("Stage: review.");
    expect(prompt.system).toContain("findings by severity");
  });

  it("embeds exact PRD and task headings for full-run mode", () => {
    const prompt = buildPrompt(DEFAULT_CONFIG, "Criar feature", "full-run", "full-run", "lite", "C:/repo");

    expect(prompt.system).toContain("Stage: full-run.");
    expect(prompt.user).toContain("Run mode: full-run");
    expect(prompt.user).toContain("Effort level: lite");
  });
});
