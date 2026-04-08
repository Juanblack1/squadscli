import { describe, expect, it } from "vitest";

import { retrieveStageContext } from "../packages/retrieval/src/index.js";
import { getStageSquadPacket } from "./squad-loader.js";
import type { WorkflowArtifactSnapshot } from "./types.js";

const workflowSnapshot: WorkflowArtifactSnapshot = {
  workflowName: "retrieval-flow",
  brief: "# Brief\n\nCriar onboarding com dashboard inicial.",
  prd: "# PRD\n\nO produto precisa de onboarding com dashboard e metricas iniciais.",
  techspec: "# Tech Spec\n\nUsar endpoint /api/onboarding e rota /dashboard.",
  tasks: "# Tasks\n\n### T01 - Criar dashboard inicial",
  summary: "# Summary\n\nFluxo focado em onboarding.",
  sharedMemory: "# Memory\n\nDecisao: priorizar dashboard inicial.",
  taskMemory: "# Task Memory\n\nProximo passo: techspec.",
  latestReviewMeta: null,
  latestReviewSummary: null,
  taskFiles: [{ fileName: "task_01.md", title: "Criar dashboard inicial" }],
};

describe("retrieval", () => {
  it("retrieves relevant workflow and squad chunks for tasks stage", () => {
    const chunks = retrieveStageContext({
      stage: "tasks",
      brief: "Quebrar onboarding em tarefas para dashboard inicial",
      workflowSnapshot,
      squadPacket: getStageSquadPacket("tasks"),
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((chunk) => chunk.source === "workflow")).toBe(true);
    expect(chunks.some((chunk) => chunk.source === "squad-step" || chunk.source === "squad-agent")).toBe(true);
  });
});
