import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadWorkflowArtifactSnapshot } from "./workflow-context.js";
import { getWorkflowPaths } from "./workflow.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("workflow-context", () => {
  it("loads existing workflow artifacts and latest review", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sf-cli-"));
    tempDirs.push(root);

    const paths = getWorkflowPaths(path.join(root, ".software-factory"), "onboarding", "run-1");

    await fs.mkdir(paths.workflowDir, { recursive: true });
    await fs.mkdir(paths.memoryDir, { recursive: true });
    await fs.mkdir(paths.currentRunDir, { recursive: true });
    await fs.mkdir(paths.reviewsDir, { recursive: true });
    await fs.mkdir(path.join(paths.reviewsDir, "reviews-999999"), { recursive: true });
    await fs.writeFile(paths.briefPath, "# Brief\n\nBrief atual", "utf8");
    await fs.writeFile(paths.prdPath, "# PRD\n\nPRD atual", "utf8");
    await fs.writeFile(paths.techspecPath, "# Tech Spec\n\nSpec atual", "utf8");
    await fs.writeFile(paths.tasksPath, "# Tasks\n\n### T01 - Algo", "utf8");
    await fs.writeFile(paths.summaryPath, "# Summary\n\nResumo atual", "utf8");
    await fs.writeFile(paths.sharedMemoryPath, "# Memory\n\nDecisao atual", "utf8");
    await fs.writeFile(paths.taskMemoryPath, "# Task Memory\n\nProximo passo", "utf8");
    await fs.writeFile(path.join(paths.workflowDir, "task_01.md"), "# T01 - Algo", "utf8");
    await fs.writeFile(path.join(paths.reviewsDir, "reviews-999999", "_meta.md"), "# Meta\n\n- ok", "utf8");
    await fs.writeFile(path.join(paths.reviewsDir, "reviews-999999", "summary.md"), "# Review\n\nTudo certo", "utf8");

    const snapshot = await loadWorkflowArtifactSnapshot(paths);

    expect(snapshot.workflowName).toBe("onboarding");
    expect(snapshot.prd).toContain("PRD atual");
    expect(snapshot.latestReviewSummary).toContain("Tudo certo");
    expect(snapshot.taskFiles[0]?.fileName).toBe("task_01.md");
  });
});
