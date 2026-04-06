import fs from "node:fs/promises";
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
    briefPath: path.join(workflowDir, "_brief.md"),
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

  await writeText(paths.briefPath, `${brief.trim()}\n`);
}

function extractSection(content: string, heading: string) {
  const sections = parseMarkdownSections(content);
  return (sections.get(heading) || []).join("\n").trim();
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

function parseTaskListValue(value: string) {
  if (!value || value.toLowerCase() === "nenhuma") {
    return [] as string[];
  }

  return value
    .split(/,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseTaskBlock(block: string) {
  const lines = block.split("\n");
  const title = lines[0]?.replace(/^###\s*/, "").trim() || "Task";
  const metadata = new Map<string, string>();
  const bodyLines: string[] = [];

  for (const line of lines.slice(1)) {
    const metadataMatch = line.match(/^-\s+([^:]+):\s*(.+)$/);

    if (metadataMatch) {
      metadata.set(metadataMatch[1].trim().toLowerCase(), metadataMatch[2].trim());
      continue;
    }

    bodyLines.push(line);
  }

  return {
    title,
    owner: metadata.get("owner") || "unassigned",
    domain: metadata.get("dominio") || metadata.get("domain") || "feature",
    complexity: metadata.get("complexidade") || metadata.get("complexity") || "medium",
    dependencies: parseTaskListValue(metadata.get("dependencias") || metadata.get("dependencies") || ""),
    deliverables: parseTaskListValue(metadata.get("entregaveis") || metadata.get("deliverables") || ""),
    evidence: parseTaskListValue(metadata.get("testes e evidencias") || metadata.get("evidence") || ""),
    body: bodyLines.join("\n").trim(),
  };
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

function parsePipeIssue(line: string) {
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
}

function parseHeadingIssues(findingsSection: string) {
  const regex = /###\s*([^|\n]+)\|\s*([^|\n]+)\|\s*([^|\n]+)\|\s*([^\n]+)\n([\s\S]*?)(?=\n###\s*[^|\n]+\||$)/g;
  const issues: Array<{
    severity: string;
    file: string;
    line: string;
    title: string;
    recommendation: string;
  }> = [];

  for (const match of findingsSection.matchAll(regex)) {
    issues.push({
      severity: match[1].trim(),
      file: match[2].trim(),
      line: match[3].trim(),
      title: match[4].trim(),
      recommendation: match[5].trim() || "No recommendation provided.",
    });
  }

  return issues;
}

function parseReviewIssues(findingsSection: string) {
  const pipeIssues = findingsSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^-\s*/, ""))
    .map((line) => parsePipeIssue(line))
    .filter(Boolean) as Array<{
    severity: string;
    file: string;
    line: string;
    title: string;
    recommendation: string;
  }>;

  return pipeIssues.length > 0 ? pipeIssues : parseHeadingIssues(findingsSection);
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

function parseMarkdownSections(content: string) {
  const lines = content.replace(/\r/g, "").split("\n");
  const sections = new Map<string, string[]>();
  let current = "__root__";

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);

    if (match) {
      current = match[1].trim();
      if (!sections.has(current)) {
        sections.set(current, []);
      }
      continue;
    }

    if (!sections.has(current)) {
      sections.set(current, []);
    }

    sections.get(current)?.push(line);
  }

  return sections;
}

function uniqueNonEmptyLines(lines: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const line of lines.map((entry) => entry.trimEnd())) {
    const normalized = line.trim();

    if (!normalized) {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(line);
  }

  return output;
}

function mergeMemoryContent(existing: string, incomingSection: string, targetHeading: string) {
  const sections = parseMarkdownSections(existing);
  const incomingLines = uniqueNonEmptyLines(incomingSection.split("\n"));
  const currentLines = uniqueNonEmptyLines(sections.get(targetHeading) || []);
  const mergedLines = uniqueNonEmptyLines([...currentLines, ...incomingLines]);
  sections.set(targetHeading, mergedLines);

  const orderedHeadings = ["Decisoes duraveis", "Riscos ativos", "Handoffs reutilizaveis", "Preferencias aprovadas"];

  return [
    "# Workflow Memory",
    "",
    ...orderedHeadings.flatMap((heading) => [
      `## ${heading}`,
      "",
      ...(sections.get(heading) && sections.get(heading)?.length ? sections.get(heading)! : ["- none"]),
      "",
    ]),
  ].join("\n").trimEnd() + "\n";
}

function nextStepForStage(stage: RunStage) {
  if (stage === "prd") return "create-techspec";
  if (stage === "techspec") return "create-tasks";
  if (stage === "tasks") return "run";
  if (stage === "review") return "run --mode autonomy";
  if (stage === "autonomy") return "create-prd or run";
  return "run --mode review";
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
      : "# Workflow Memory\n\n## Decisoes duraveis\n\n## Riscos ativos\n\n## Handoffs reutilizaveis\n\n## Preferencias aprovadas\n";
    const durableMemory = extractSection(responseText, "Durable Workflow Memory") || responseText;
    const firstHandoff = extractSection(responseText, "First Handoff");
    const merged = mergeMemoryContent(existingMemory, durableMemory, "Decisoes duraveis");
    const mergedWithHandoff = firstHandoff
      ? mergeMemoryContent(merged, firstHandoff, "Handoffs reutilizaveis")
      : merged;
    await writeText(paths.sharedMemoryPath, mergedWithHandoff);
  }
}
