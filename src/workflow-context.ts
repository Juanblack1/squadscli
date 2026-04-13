import fs from "node:fs/promises";
import path from "node:path";

import type { WorkflowArtifactSnapshot, WorkflowPaths } from "./types.js";

async function readOptional(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function excerpt(content: string | null, maxChars = 1400) {
  if (!content) {
    return null;
  }

  const normalized = content.replace(/\r/g, "").trim();

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars).trimEnd()}\n...[truncated]`;
}

async function listTaskFiles(workflowDir: string) {
  try {
    const entries = await fs.readdir(workflowDir);
    const taskFiles = entries.filter((entry) => /^task_\d+\.md$/.test(entry)).sort();

    return await Promise.all(
      taskFiles.map(async (fileName) => {
        const content = await readOptional(path.join(workflowDir, fileName));
        const titleMatch = content?.match(/^#\s+(.+)$/m);

        return {
          fileName,
          title: titleMatch?.[1]?.trim() || fileName,
          content: excerpt(content, 700),
        };
      }),
    );
  } catch {
    return [];
  }
}

async function getLatestReviewArtifact(reviewsDir: string, fileName: "summary.md" | "_meta.md") {
  try {
    const entries = await fs.readdir(reviewsDir, { withFileTypes: true });
    const reviewDirs = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("reviews-"))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    if (reviewDirs.length === 0) {
      return null;
    }

    return await readOptional(path.join(reviewsDir, reviewDirs[0], fileName));
  } catch {
    return null;
  }
}

export async function loadWorkflowArtifactSnapshot(paths: WorkflowPaths): Promise<WorkflowArtifactSnapshot> {
  const [brief, prd, techspec, tasks, summary, sharedMemory, taskMemory, latestReviewMeta, latestReviewSummary, taskFiles] =
    await Promise.all([
      readOptional(paths.briefPath),
      readOptional(paths.prdPath),
      readOptional(paths.techspecPath),
      readOptional(paths.tasksPath),
      readOptional(paths.summaryPath),
      readOptional(paths.sharedMemoryPath),
      readOptional(paths.taskMemoryPath),
      getLatestReviewArtifact(paths.reviewsDir, "_meta.md"),
      getLatestReviewArtifact(paths.reviewsDir, "summary.md"),
      listTaskFiles(paths.workflowDir),
    ]);

  return {
    workflowName: path.basename(paths.workflowDir),
    brief: excerpt(brief),
    prd: excerpt(prd),
    techspec: excerpt(techspec),
    tasks: excerpt(tasks),
    summary: excerpt(summary),
    sharedMemory: excerpt(sharedMemory),
    taskMemory: excerpt(taskMemory),
    latestReviewMeta: excerpt(latestReviewMeta, 1000),
    latestReviewSummary: excerpt(latestReviewSummary, 1200),
    taskFiles,
  };
}
