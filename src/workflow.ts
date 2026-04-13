import fs from "node:fs/promises";
import path from "node:path";

import {
  extractMarkdownSection,
  parseReviewIssues,
  parseTaskBlock,
  splitTaskBlocks,
} from "../packages/artifact-engine/src/index.js";
import { buildEmptyWorkflowMemory, mergeMemoryContent } from "../packages/memory-engine/src/index.js";
import type { WorkflowExecutionState, WorkflowExecutionStep } from "../packages/core/src/index.js";
import { ensureDir, fileExists, writeText } from "./fs-utils.js";
import type { RunStage, WorkflowPaths } from "./types.js";

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "workflow";
}

export function resolveWorkflowName(brief: string, providedName?: string) {
  return slugify(providedName || brief);
}

export function getWorkflowPaths(stateDir: string, workflowName: string, runId: string): WorkflowPaths {
  const rootDir = path.join(stateDir, "workflows");
  const workflowDir = path.join(rootDir, workflowName);
  const memoryDir = path.join(workflowDir, "memory");
  const reviewsDir = path.join(workflowDir, "reviews");
  const currentRunDir = path.join(workflowDir, "runs", runId);

  return {
    rootDir,
    workflowDir,
    memoryDir,
    reviewsDir,
    currentRunDir,
    briefPath: path.join(workflowDir, "_brief.md"),
    prdPath: path.join(workflowDir, "_prd.md"),
    techspecPath: path.join(workflowDir, "_techspec.md"),
    tasksPath: path.join(workflowDir, "_tasks.md"),
    summaryPath: path.join(workflowDir, "summary.md"),
    statePath: path.join(workflowDir, "state.json"),
    sharedMemoryPath: path.join(memoryDir, "MEMORY.md"),
    taskMemoryPath: path.join(memoryDir, `${workflowName}.md`),
  };
}

export async function initializeWorkflow(paths: WorkflowPaths, brief: string) {
  await ensureDir(paths.workflowDir);
  await ensureDir(paths.memoryDir);
  await ensureDir(paths.reviewsDir);
  await ensureDir(paths.currentRunDir);

  if (!(await fileExists(paths.sharedMemoryPath))) {
    await writeText(paths.sharedMemoryPath, `${buildEmptyWorkflowMemory()}\n`);
  }

  if (!(await fileExists(paths.taskMemoryPath))) {
    await writeText(
      paths.taskMemoryPath,
      `# Task Memory\n\n## Objetivo atual\n\n${brief.trim()}\n\n## Arquivos tocados\n\n## Aprendizados\n\n## Proximo passo\n`,
    );
  }

  await writeText(paths.briefPath, `${brief.trim()}\n`);
}

function extractSection(content: string, heading: string) {
  return extractMarkdownSection(content, heading);
}

function normalizeTaskFileName(index: number) {
  return `task_${String(index).padStart(2, "0")}.md`;
}

async function writeTaskFiles(paths: WorkflowPaths, taskSection: string) {
  const blocks = splitTaskBlocks(taskSection);

  if (blocks.length === 0) {
    return;
  }

  for (const [index, block] of blocks.entries()) {
    const parsed = parseTaskBlock(block);
    const fileName = normalizeTaskFileName(index + 1);
    const dependencyLines = parsed.dependencies.length
      ? parsed.dependencies.map((dependency) => `  - ${dependency}`)
      : ["  - none"];
    const deliverableLines = parsed.deliverables.length
      ? parsed.deliverables.map((deliverable) => `- ${deliverable}`).join("\n")
      : "- Pendente de detalhamento.";
    const evidenceLines = parsed.evidence.length
      ? parsed.evidence.map((item) => `- ${item}`).join("\n")
      : "- Pendente de detalhamento.";

    await writeText(
      path.join(paths.workflowDir, fileName),
      [
        "---",
        "status: pending",
        `owner: ${parsed.owner}`,
        `domain: ${parsed.domain}`,
        'type: implementation',
        'scope: targeted',
        `complexity: ${parsed.complexity}`,
        "dependencies:",
        ...dependencyLines,
        "---",
        "",
        `# ${parsed.title}`,
        "",
        "## Deliverables",
        "",
        deliverableLines,
        "",
        "## Evidence",
        "",
        evidenceLines,
        "",
        "## Notes",
        "",
        parsed.body || "Pendente de detalhamento.",
      ].join("\n"),
    );
  }
}

async function writeReviewIssueFiles(reviewRoundDir: string, findingsSection: string) {
  const issues = parseReviewIssues(findingsSection);

  for (const [index, issue] of issues.entries()) {
    const issueNumber = String(index + 1).padStart(3, "0");
    await writeText(
      path.join(reviewRoundDir, `issue_${issueNumber}.md`),
      [
        "---",
        "status: pending",
        `file: ${issue.file}`,
        `line: ${issue.line}`,
        `severity: ${issue.severity}`,
        "author: software-factory-cli",
        "provider_ref:",
        "---",
        "",
        `# Issue ${issueNumber}: ${issue.title}`,
        "",
        "## Review Comment",
        "",
        issue.recommendation,
        "",
        "## Triage",
        "",
        "- Decision: `UNREVIEWED`",
        "- Notes:",
      ].join("\n"),
    );
  }
}

function nextStepForStage(stage: RunStage) {
  if (stage === "prd") return "create-techspec";
  if (stage === "techspec") return "create-tasks";
  if (stage === "tasks") return "run";
  if (stage === "review") return "run --mode autonomy";
  if (stage === "autonomy") return "create-prd or run";
  return "run --mode review";
}

export function createWorkflowExecutionState(options: {
  runId: string;
  workflowName: string;
  mode: RunStage | "full-run" | "review" | "autonomy";
  stage: RunStage;
  effort: string;
  provider: string;
  model: string | null;
  status: "dry-run" | "running" | "completed" | "failed";
  sharedMemoryExcerpt?: string | null;
  taskMemoryExcerpt?: string | null;
  steps: WorkflowExecutionStep[];
}): WorkflowExecutionState {
  return {
    runId: options.runId,
    workflowName: options.workflowName,
    mode: options.mode as WorkflowExecutionState["mode"],
    stage: options.stage,
    status: options.status,
    effort: options.effort as WorkflowExecutionState["effort"],
    provider: options.provider as WorkflowExecutionState["provider"],
    model: options.model,
    updatedAt: new Date().toISOString(),
    nextAction: nextStepForStage(options.stage),
    sharedMemoryExcerpt: options.sharedMemoryExcerpt || null,
    taskMemoryExcerpt: options.taskMemoryExcerpt || null,
    steps: options.steps,
  };
}

export async function writeExecutionState(paths: WorkflowPaths, execution: WorkflowExecutionState, runDir: string, currentDir: string) {
  const content = `${JSON.stringify(execution, null, 2)}\n`;
  await writeText(paths.statePath, content);
  await writeText(path.join(paths.currentRunDir, "state.json"), content);
  await writeText(path.join(runDir, "state.json"), content);
  await writeText(path.join(currentDir, "state.json"), content);
}

async function updateTaskMemory(paths: WorkflowPaths, stage: RunStage, responseText: string) {
  const current = (await fileExists(paths.taskMemoryPath)) ? await fs.readFile(paths.taskMemoryPath, "utf8") : "";
  const objective = (await fileExists(paths.briefPath)) ? await fs.readFile(paths.briefPath, "utf8") : "";
  const summarySource =
    extractSection(responseText, "Final Recommendation") ||
    extractSection(responseText, "Gate Recommendation") ||
    extractSection(responseText, "Task Breakdown") ||
    extractSection(responseText, "Tech Spec") ||
    extractSection(responseText, "PRD") ||
    responseText;

  const touchedArtifacts =
    stage === "prd"
      ? ["_brief.md", "_prd.md"]
      : stage === "techspec"
        ? ["_brief.md", "_prd.md", "_techspec.md"]
        : stage === "tasks"
          ? ["_brief.md", "_prd.md", "_techspec.md", "_tasks.md", "task_*.md"]
          : stage === "review"
            ? ["reviews/reviews-*/summary.md", "reviews/reviews-*/issue_*.md"]
            : stage === "autonomy"
              ? ["memory/MEMORY.md", `memory/${path.basename(paths.workflowDir)}.md`]
              : ["_brief.md", "_prd.md", "_techspec.md", "_tasks.md", "summary.md"];

  const nextStep = nextStepForStage(stage);
  const content = [
    "# Task Memory",
    "",
    "## Objetivo atual",
    "",
    objective.trim() || "Pendente.",
    "",
    "## Ultimo estagio",
    "",
    stage,
    "",
    "## Arquivos tocados",
    "",
    ...touchedArtifacts.map((artifact) => `- ${artifact}`),
    "",
    "## Aprendizados",
    "",
    summarySource.trim() || "Pendente.",
    "",
    "## Proximo passo",
    "",
    nextStep,
  ].join("\n");

  if (current.trim() === content.trim()) {
    return;
  }

  await writeText(paths.taskMemoryPath, `${content.trim()}\n`);
}

export async function writeWorkflowArtifacts(
  paths: WorkflowPaths,
  responseText: string,
  stage: RunStage,
  runId: string,
) {
  await writeText(path.join(paths.currentRunDir, "response.md"), `${responseText.trim()}\n`);
  await updateTaskMemory(paths, stage, responseText);

  if (stage === "prd") {
    const prd = extractSection(responseText, "PRD");
    await writeText(paths.prdPath, `# PRD\n\n${prd || responseText.trim()}\n`);
    return;
  }

  if (stage === "techspec") {
    const techspec = extractSection(responseText, "Tech Spec");
    await writeText(paths.techspecPath, `# Tech Spec\n\n${techspec || responseText.trim()}\n`);
    return;
  }

  if (stage === "tasks") {
    const tasks = extractSection(responseText, "Task Breakdown");
    await writeText(paths.tasksPath, `# Tasks\n\n${tasks || responseText.trim()}\n`);
    await writeTaskFiles(paths, tasks || responseText);
    return;
  }

  if (stage === "full-run") {
    const prd = extractSection(responseText, "PRD");
    const techspec = extractSection(responseText, "Tech Spec");
    const tasks = extractSection(responseText, "Task Breakdown");
    const uxGate = extractSection(responseText, "UX And Design Gate");
    const impl = extractSection(responseText, "Implementation Plan");
    const quality = extractSection(responseText, "Quality And Review Gate");
    const verdict = extractSection(responseText, "Final Recommendation");

    await writeText(paths.prdPath, `# PRD\n\n${prd || "Pendente de consolidacao."}\n`);
    await writeText(paths.techspecPath, `# Tech Spec\n\n${techspec || "Pendente de consolidacao."}\n`);
    await writeText(paths.tasksPath, `# Tasks\n\n${tasks || "Pendente de consolidacao."}\n`);
    await writeTaskFiles(paths, tasks);
    await writeText(
      paths.summaryPath,
      [
        "# Workflow Summary",
        "",
        `- Run: ${runId}`,
        `- UX Gate: ${uxGate || "Nao informado"}`,
        `- Implementation: ${impl || "Nao informado"}`,
        `- Quality: ${quality || "Nao informado"}`,
        `- Recommendation: ${verdict || "Nao informado"}`,
      ].join("\n"),
    );
    return;
  }

  if (stage === "review") {
    const reviewRoundDir = path.join(paths.reviewsDir, `reviews-${String(Date.now()).slice(-6)}`);
    await ensureDir(reviewRoundDir);

    const findings = extractSection(responseText, "Findings By Severity");
    const acceptedRisks = extractSection(responseText, "Accepted Risks");
    const recommendation = extractSection(responseText, "Gate Recommendation");

    await writeText(path.join(reviewRoundDir, "summary.md"), `${responseText.trim()}\n`);
    await writeReviewIssueFiles(reviewRoundDir, findings);
    await writeText(
      path.join(reviewRoundDir, "_meta.md"),
      [
        "# Review Round Meta",
        "",
        `- Run: ${runId}`,
        `- Findings: ${findings ? "sim" : "nao"}`,
        `- Accepted risks: ${acceptedRisks ? "sim" : "nao"}`,
        `- Recommendation: ${recommendation || "nao informado"}`,
      ].join("\n"),
    );
    return;
  }

  if (stage === "autonomy") {
    const existingMemory = (await fileExists(paths.sharedMemoryPath))
      ? await fs.readFile(paths.sharedMemoryPath, "utf8")
      : `${buildEmptyWorkflowMemory()}\n`;
    const durableMemory = extractSection(responseText, "Durable Workflow Memory") || responseText;
    const firstHandoff = extractSection(responseText, "First Handoff");
    const merged = mergeMemoryContent(existingMemory, durableMemory, "Decisoes duraveis");
    const mergedWithHandoff = firstHandoff
      ? mergeMemoryContent(merged, firstHandoff, "Handoffs reutilizaveis")
      : merged;
    await writeText(paths.sharedMemoryPath, mergedWithHandoff);
  }
}
