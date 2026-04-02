import path from "node:path";

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

function splitTaskBlocks(taskSection: string) {
  const blocks = taskSection
    .split(/\n(?=###\s+)/g)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.filter((block) => block.startsWith("### "));
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
    const lines = block.split("\n");
    const title = lines[0]?.replace(/^###\s*/, "").trim() || `Task ${index + 1}`;
    const body = lines.slice(1).join("\n").trim();
    const fileName = normalizeTaskFileName(index + 1);

    await writeText(
      path.join(paths.workflowDir, fileName),
      [
        "---",
        "status: pending",
        'domain: feature',
        'type: implementation',
        'scope: targeted',
        'complexity: medium',
        'dependencies: []',
        "---",
        "",
        `# ${title}`,
        "",
        body || "Pendente de detalhamento.",
      ].join("\n"),
    );
  }
}

function parseReviewIssues(findingsSection: string) {
  return findingsSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s*/, ""))
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());

      if (parts.length < 5) {
        return null;
      }

      return {
        severity: parts[0],
        file: parts[1],
        line: parts[2],
        title: parts[3],
        recommendation: parts.slice(4).join(" | "),
      };
    })
    .filter(Boolean) as Array<{
    severity: string;
    file: string;
    line: string;
    title: string;
    recommendation: string;
  }>;
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

export async function writeWorkflowArtifacts(
  paths: WorkflowPaths,
  responseText: string,
  stage: RunStage,
  runId: string,
) {
  await writeText(path.join(paths.currentRunDir, "response.md"), `${responseText.trim()}\n`);

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
    await writeText(paths.sharedMemoryPath, `${responseText.trim()}\n`);
  }
}
