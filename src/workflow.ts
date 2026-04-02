import path from "node:path";

import { ensureDir, fileExists, writeText } from "./fs-utils.js";
import type { RunMode, WorkflowPaths } from "./types.js";

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
    prdPath: path.join(workflowDir, "_prd.md"),
    techspecPath: path.join(workflowDir, "_techspec.md"),
    tasksPath: path.join(workflowDir, "_tasks.md"),
    summaryPath: path.join(workflowDir, "summary.md"),
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
    await writeText(
      paths.sharedMemoryPath,
      `# Workflow Memory\n\n## Decisoes duraveis\n\n## Riscos ativos\n\n## Handoffs reutilizaveis\n\n## Preferencias aprovadas\n`,
    );
  }

  if (!(await fileExists(paths.taskMemoryPath))) {
    await writeText(
      paths.taskMemoryPath,
      `# Task Memory\n\n## Objetivo atual\n\n${brief.trim()}\n\n## Arquivos tocados\n\n## Aprendizados\n\n## Proximo passo\n`,
    );
  }

  const briefPath = path.join(paths.workflowDir, "_brief.md");
  await writeText(briefPath, `${brief.trim()}\n`);
}

function extractSection(content: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`, "m");
  const match = content.match(regex);
  return match?.[1]?.trim() || "";
}

export async function writeWorkflowArtifacts(
  paths: WorkflowPaths,
  responseText: string,
  mode: RunMode,
  runId: string,
) {
  await writeText(path.join(paths.currentRunDir, "response.md"), `${responseText.trim()}\n`);

  if (mode === "full-run") {
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

  if (mode === "review") {
    const reviewRoundDir = path.join(paths.reviewsDir, `reviews-${String(Date.now()).slice(-6)}`);
    await ensureDir(reviewRoundDir);

    const findings = extractSection(responseText, "Findings By Severity");
    const acceptedRisks = extractSection(responseText, "Accepted Risks");
    const recommendation = extractSection(responseText, "Gate Recommendation");

    await writeText(path.join(reviewRoundDir, "summary.md"), `${responseText.trim()}\n`);
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

  if (mode === "autonomy") {
    await writeText(paths.sharedMemoryPath, `${responseText.trim()}\n`);
  }
}
