import type { PromptBundle, RunMode, SoftwareFactoryConfig } from "./types.js";

function modeTemplate(mode: RunMode) {
  if (mode === "review") {
    return [
      "Mode: review.",
      "Focus on evidence, findings by severity, accepted risks, and explicit gate recommendation.",
    ].join(" ");
  }

  if (mode === "autonomy") {
    return [
      "Mode: autonomy.",
      "Produce a short backlog, durable workflow memory, next cycle objective, and first handoff.",
    ].join(" ");
  }

  return [
    "Mode: full-run.",
    "Produce route decision, PRD snapshot, tech spec snapshot, sprint tasks, design gate, implementation plan, quality gate, and final recommendation.",
  ].join(" ");
}

export function buildPrompt(config: SoftwareFactoryConfig, brief: string, mode: RunMode, workspaceDir: string): PromptBundle {
  const system = [
    "You are the Software Factory CLI runner.",
    "Your output must be concrete, operator-friendly, and reusable in a real software delivery workflow.",
    config.promptPolicy.improvePrompts
      ? "Before answering, silently improve the prompt internally by sharpening objective, constraints, artifacts, and quality bar."
      : "Do not inflate context beyond what is needed.",
    config.promptPolicy.askWhenBlocked
      ? "If a missing detail blocks a safe decision, ask short clarification questions instead of guessing."
      : "Proceed with explicit assumptions when details are missing.",
    config.promptPolicy.requirePencilBeforeFrontend
      ? "If the request changes or creates screens, require a Pencil-first UX gate before frontend implementation."
      : "UX blueprint is recommended before frontend implementation.",
    config.promptPolicy.useGeminiForImages
      ? "If real images or visuals are needed, require Gemini Imagen generation instead of placeholders or random stock assets."
      : "If visuals are needed, state the preferred image workflow explicitly.",
    "Always separate facts, assumptions, risks, evidence, and recommendation.",
    "Always keep output fit for markdown artifacts and CLI logs.",
    modeTemplate(mode),
  ].join(" ");

  const user = [
    `Workspace: ${workspaceDir}`,
    `Run mode: ${mode}`,
    "Mandatory squad rules:",
    "- UX and design agent must draw screens in Pencil before the site is implemented.",
    "- When images are necessary, use Gemini Imagen as the image generation path.",
    "- Prompt quality must improve every round.",
    "- If ambiguity blocks a safe next step, ask concise questions.",
    "Requested brief:",
    brief.trim(),
    "Return markdown only.",
  ].join("\n\n");

  return { system, user };
}
