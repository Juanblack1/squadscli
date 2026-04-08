import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "./default-config.js";
import { buildPrompt } from "./prompt-builder.js";
import { retrieveStageContext } from "../packages/retrieval/src/index.js";
import { getStageSquadPacket } from "./squad-loader.js";
import type { WorkflowArtifactSnapshot } from "./types.js";

const workflowSnapshot: WorkflowArtifactSnapshot = {
  workflowName: "test-workflow",
  brief: "# Brief\n\nCriar dashboard de onboarding.",
  prd: "# PRD\n\nFluxo atual do produto.",
  techspec: "# Tech Spec\n\nDetalhes tecnicos.",
  tasks: "# Tasks\n\n### T01 - Implementar onboarding",
  summary: "# Summary\n\nResumo da rodada.",
  sharedMemory: "# Memory\n\nDecisao duravel A.",
  taskMemory: "# Task Memory\n\nProximo passo.",
  latestReviewMeta: "# Review Round Meta\n\n- Recommendation: liberar",
  latestReviewSummary: "# Review\n\nTudo certo.",
  taskFiles: [{ fileName: "task_01.md", title: "T01 - Implementar onboarding" }],
};

describe("buildPrompt", () => {
  it("enforces Pencil and Gemini rules in full-run mode", () => {
    const retrieved = retrieveStageContext({
      stage: "full-run",
      brief: "Criar dashboard de onboarding",
      workflowSnapshot,
      squadPacket: getStageSquadPacket("full-run"),
    });
    const prompt = buildPrompt(
      DEFAULT_CONFIG,
      "Criar dashboard de onboarding",
      "full-run",
      "full-run",
      "balanced",
      "C:/repo",
      getStageSquadPacket("full-run"),
      workflowSnapshot,
      retrieved,
      "test-workflow",
    );

    expect(prompt.system).toContain("Pencil-first UX gate");
    expect(prompt.system).toContain("Gemini Imagen");
    expect(prompt.user).toContain("UX and design agent must draw screens in Pencil");
  });

  it("changes instruction block for review mode", () => {
    const retrieved = retrieveStageContext({
      stage: "review",
      brief: "Revisar a feature atual",
      workflowSnapshot,
      squadPacket: getStageSquadPacket("review"),
    });
    const prompt = buildPrompt(
      DEFAULT_CONFIG,
      "Revisar a feature atual",
      "review",
      "review",
      "balanced",
      "C:/repo",
      getStageSquadPacket("review"),
      workflowSnapshot,
      retrieved,
      "test-workflow",
    );

    expect(prompt.system).toContain("Stage: review.");
    expect(prompt.system).toContain("findings by severity");
  });

  it("embeds exact PRD and task headings for full-run mode", () => {
    const retrieved = retrieveStageContext({
      stage: "full-run",
      brief: "Criar feature",
      workflowSnapshot,
      squadPacket: getStageSquadPacket("full-run"),
    });
    const prompt = buildPrompt(
      DEFAULT_CONFIG,
      "Criar feature",
      "full-run",
      "full-run",
      "lite",
      "C:/repo",
      getStageSquadPacket("full-run"),
      workflowSnapshot,
      retrieved,
      "test-workflow",
    );

    expect(prompt.system).toContain("Stage: full-run.");
    expect(prompt.user).toContain("Run mode: full-run");
    expect(prompt.user).toContain("Effort level: lite");
    expect(prompt.user).toContain("Loaded workflow artifacts:");
    expect(prompt.user).toContain("### Current PRD");
    expect(prompt.user).toContain("### Individual task files");
  });
});
