import type { StageSquadPacket } from "./squad-loader.js";
import type { EffortLevel, PromptBundle, RunMode, RunStage, SoftwareFactoryConfig, WorkflowArtifactSnapshot } from "./types.js";

function effortTemplate(effort: EffortLevel) {
  if (effort === "lite") {
    return [
      "Token budget mode: lite.",
      "Reuse existing artifacts, avoid repeating context, keep sections compact, and propose only the smallest correct task set.",
    ].join(" ");
  }

  if (effort === "deep") {
    return [
      "Token budget mode: deep.",
      "Allow deeper analysis, but keep artifacts structured and avoid decorative repetition.",
    ].join(" ");
  }

  return [
    "Token budget mode: balanced.",
    "Prefer concise but complete artifacts, enough detail to execute without waste.",
  ].join(" ");
}

function stageTemplate(stage: RunStage, mode: RunMode) {
  if (stage === "review" || mode === "review") {
    return [
      "Stage: review.",
      "Focus on evidence, findings by severity, accepted risks, and explicit gate recommendation.",
      "When listing findings, prefer one issue per line using: severity | file | line | title | recommendation.",
    ].join(" ");
  }

  if (stage === "autonomy" || mode === "autonomy") {
    return [
      "Stage: autonomy.",
      "Produce a short backlog, durable workflow memory, next cycle objective, and first handoff.",
    ].join(" ");
  }

  if (stage === "prd") {
    return [
      "Stage: prd.",
      "Produce only route decision, questions or assumptions, and the PRD artifact.",
    ].join(" ");
  }

  if (stage === "techspec") {
    return [
      "Stage: techspec.",
      "Produce only inputs considered, questions or assumptions, and the tech spec artifact.",
    ].join(" ");
  }

  if (stage === "tasks") {
    return [
      "Stage: tasks.",
      "Break the scope into small independently executable tasks with owner, dependencies, deliverables, and evidence.",
      "Do not create testing-only tasks; embed tests into each task.",
    ].join(" ");
  }

  return [
    "Stage: full-run.",
    "Produce route decision, PRD, tech spec, task breakdown, design gate, implementation plan, quality gate, and final recommendation.",
  ].join(" ");
}

export function buildPrompt(
  config: SoftwareFactoryConfig,
  brief: string,
  mode: RunMode,
  stage: RunStage,
  effort: EffortLevel,
  workspaceDir: string,
  squadPacket: StageSquadPacket,
  workflowSnapshot: WorkflowArtifactSnapshot,
  workflowName?: string,
): PromptBundle {
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
    effortTemplate(effort),
    "Always separate facts, assumptions, risks, evidence, and recommendation.",
    "Always keep output fit for markdown artifacts and CLI logs.",
    "Prefer references to existing artifacts over reprinting long context.",
    "Tasks must be small, vertical, independently executable, and cheaper to run than large ambiguous workstreams.",
    stageTemplate(stage, mode),
  ].join(" ");

  const user = [
    `Workspace: ${workspaceDir}`,
    `Workflow: ${workflowName || "auto"}`,
    `Run mode: ${mode}`,
    `Run stage: ${stage}`,
    `Effort level: ${effort}`,
    "Loaded squad context:",
    renderSquadPacket(squadPacket),
    "Loaded workflow artifacts:",
    renderWorkflowSnapshot(stage, workflowSnapshot),
    "Mandatory squad rules:",
    "- UX and design agent must draw screens in Pencil before the site is implemented.",
    "- When images are necessary, use Gemini Imagen as the image generation path.",
    "- Prompt quality must improve every round.",
    "- If ambiguity blocks a safe next step, ask concise questions.",
    "- Prefer reading local artifacts instead of asking to restate known context.",
    "- Keep token usage low by not repeating the same explanation in multiple sections.",
    "Requested brief:",
    brief.trim(),
    "Return markdown only.",
  ].join("\n\n");

  return { system, user };
}

function renderSquadPacket(squadPacket: StageSquadPacket) {
  const stepLines = squadPacket.relevantSteps.length
    ? squadPacket.relevantSteps
        .map((step) => {
          const owner = step.agent ? ` | owner: ${step.agent}` : "";
          const activation = step.activation ? ` | activation: ${step.activation}` : "";
          return `- ${step.id}: ${step.name || step.type}${owner}${activation}`;
        })
        .join("\n")
    : "- no dedicated pipeline steps for this stage";

  const agentLines = squadPacket.relevantAgents.length
    ? squadPacket.relevantAgents
        .map((agent) => {
          const principles = agent.principles.slice(0, 3).join("; ");
          const process = agent.process.slice(0, 3).join("; ");
          return [
            `- ${agent.icon} ${agent.name} (${agent.id})`,
            `  role: ${agent.roleSummary || agent.title}`,
            `  communication: ${agent.communicationStyle || "not specified"}`,
            `  principles: ${principles || "not specified"}`,
            `  process: ${process || "not specified"}`,
          ].join("\n");
        })
        .join("\n")
    : "- no dedicated agent packet for this stage";

  return [
    `Stage summary: ${squadPacket.summary}`,
    "Relevant pipeline steps:",
    stepLines,
    "Relevant agents:",
    agentLines,
    "Runner expectations:",
    squadPacket.runnerSummary.map((line) => `- ${line}`).join("\n"),
  ].join("\n");
}

function renderWorkflowSnapshot(stage: RunStage, workflowSnapshot: WorkflowArtifactSnapshot) {
  const orderedFields: Array<[string, string | null]> =
    stage === "prd"
      ? [
          ["Workflow brief", workflowSnapshot.brief],
          ["Workflow summary", workflowSnapshot.summary],
          ["Shared memory", workflowSnapshot.sharedMemory],
          ["Task memory", workflowSnapshot.taskMemory],
        ]
      : stage === "techspec"
        ? [
            ["Workflow brief", workflowSnapshot.brief],
            ["Current PRD", workflowSnapshot.prd],
            ["Workflow summary", workflowSnapshot.summary],
            ["Shared memory", workflowSnapshot.sharedMemory],
            ["Task memory", workflowSnapshot.taskMemory],
          ]
        : stage === "tasks"
          ? [
              ["Workflow brief", workflowSnapshot.brief],
              ["Current PRD", workflowSnapshot.prd],
              ["Current Tech Spec", workflowSnapshot.techspec],
              ["Workflow summary", workflowSnapshot.summary],
              ["Task memory", workflowSnapshot.taskMemory],
            ]
          : stage === "review"
            ? [
                ["Workflow brief", workflowSnapshot.brief],
                ["Current PRD", workflowSnapshot.prd],
                ["Current Tech Spec", workflowSnapshot.techspec],
                ["Current Tasks", workflowSnapshot.tasks],
                ["Workflow summary", workflowSnapshot.summary],
                ["Shared memory", workflowSnapshot.sharedMemory],
                ["Latest review meta", workflowSnapshot.latestReviewMeta],
                ["Latest review summary", workflowSnapshot.latestReviewSummary],
              ]
            : stage === "autonomy"
              ? [
                  ["Workflow summary", workflowSnapshot.summary],
                  ["Shared memory", workflowSnapshot.sharedMemory],
                  ["Task memory", workflowSnapshot.taskMemory],
                  ["Latest review meta", workflowSnapshot.latestReviewMeta],
                  ["Latest review summary", workflowSnapshot.latestReviewSummary],
                ]
              : [
                  ["Workflow brief", workflowSnapshot.brief],
                  ["Current PRD", workflowSnapshot.prd],
                  ["Current Tech Spec", workflowSnapshot.techspec],
                  ["Current Tasks", workflowSnapshot.tasks],
                  ["Workflow summary", workflowSnapshot.summary],
                  ["Shared memory", workflowSnapshot.sharedMemory],
                  ["Task memory", workflowSnapshot.taskMemory],
                  ["Latest review summary", workflowSnapshot.latestReviewSummary],
                ];

  const artifactLines = orderedFields
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `### ${label}\n${value}`)
    .join("\n\n");

  const taskFileLines = workflowSnapshot.taskFiles.length
    ? workflowSnapshot.taskFiles.map((task) => `- ${task.fileName}: ${task.title}`).join("\n")
    : "- no individual task files yet";

  return [
    `Workflow name: ${workflowSnapshot.workflowName}`,
    artifactLines || "No prior workflow artifacts available yet.",
    "### Individual task files",
    taskFileLines,
    "Use existing workflow artifacts as the source of truth and evolve them instead of contradicting them.",
  ].join("\n\n");
}
