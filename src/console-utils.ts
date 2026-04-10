import fs from "node:fs/promises";
import path from "node:path";

import { loadSoftwareFactoryConfig } from "./config.js";
import { SOFTWARE_FACTORY_BUNDLE } from "./generated/software-factory-bundle.js";
import { loadWorkflowArtifactSnapshot } from "./workflow-context.js";
import { getWorkflowPaths } from "./workflow.js";

export interface WorkflowSummary {
  workflowName: string;
  currentStage: "full-run" | "prd" | "techspec" | "tasks" | "review" | "autonomy";
  updatedAt: string;
}

export interface RecentRunSummary {
  runId: string;
  workflowName: string;
  stage: string;
  provider: string;
  model: string | null;
  updatedAt: string;
}

export function extractSquadSkills(squadYaml = SOFTWARE_FACTORY_BUNDLE.squadYaml) {
  const match = squadYaml.match(/\nskills:\n([\s\S]*?)\n\n[a-z]+:/);

  if (!match) {
    return [];
  }

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

export function parseSkillSelection(input?: string | null) {
  if (!input) {
    return [];
  }

  const seen = new Set<string>();
  const values: string[] = [];

  for (const item of input.split(/[\n,]/)) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    values.push(normalized);
  }

  return values;
}

function inferCurrentStage(snapshot: Awaited<ReturnType<typeof loadWorkflowArtifactSnapshot>>) {
  if (snapshot.latestReviewSummary) return "review" as const;
  if (snapshot.tasks || snapshot.taskFiles.length > 0) return "tasks" as const;
  if (snapshot.techspec) return "techspec" as const;
  if (snapshot.prd) return "prd" as const;
  return "full-run" as const;
}

export async function listWorkflowSummaries(workspaceDir: string): Promise<WorkflowSummary[]> {
  const config = await loadSoftwareFactoryConfig(workspaceDir);
  const workflowsDir = path.join(workspaceDir, config.outputDir, "workflows");

  try {
    const entries = await fs.readdir(workflowsDir, { withFileTypes: true });
    const workflowDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

    return await Promise.all(
      workflowDirs.map(async (workflowName) => {
        const workflowDir = path.join(workflowsDir, workflowName);
        const stats = await fs.stat(workflowDir);
        const snapshot = await loadWorkflowArtifactSnapshot(
          getWorkflowPaths(path.join(workspaceDir, config.outputDir), workflowName, "console-view"),
        );

        return {
          workflowName,
          currentStage: inferCurrentStage(snapshot),
          updatedAt: stats.mtime.toISOString(),
        } satisfies WorkflowSummary;
      }),
    );
  } catch {
    return [];
  }
}

export async function listRecentRuns(workspaceDir: string, limit = 10): Promise<RecentRunSummary[]> {
  const config = await loadSoftwareFactoryConfig(workspaceDir);
  const runsDir = path.join(workspaceDir, config.outputDir, "runs");

  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    const runDirs = entries
      .filter((entry) => entry.isDirectory() && entry.name !== "current")
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .slice(0, limit);

    const runs = await Promise.all(
      runDirs.map(async (runId) => {
        try {
          const metaPath = path.join(runsDir, runId, "meta.json");
          const raw = JSON.parse(await fs.readFile(metaPath, "utf8")) as {
            workflowName?: string;
            stage?: string;
            provider?: string;
            model?: string | null;
          };
          const stats = await fs.stat(metaPath);

          return {
            runId,
            workflowName: raw.workflowName || "unknown",
            stage: raw.stage || "unknown",
            provider: raw.provider || "unknown",
            model: raw.model || null,
            updatedAt: stats.mtime.toISOString(),
          } satisfies RecentRunSummary;
        } catch {
          return null;
        }
      }),
    );

    return runs.filter((run): run is RecentRunSummary => Boolean(run));
  } catch {
    return [];
  }
}
