import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getWorkflowPaths, resolveWorkflowName, writeWorkflowArtifacts } from "./workflow.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("workflow helpers", () => {
  it("slugifies workflow names safely", () => {
    expect(resolveWorkflowName("Criar Dashboard de Onboarding")).toBe("criar-dashboard-de-onboarding");
  });

  it("builds workflow paths under state dir", () => {
    const paths = getWorkflowPaths("C:/repo/.software-factory", "onboarding", "run-1");

    expect(paths.workflowDir).toContain("workflows");
    expect(paths.prdPath).toContain("_prd.md");
    expect(paths.currentRunDir).toContain("run-1");
  });

  it("writes structured task files from task breakdown", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sf-workflow-"));
    tempDirs.push(root);
    const paths = getWorkflowPaths(path.join(root, ".software-factory"), "tasks-flow", "run-1");

    await fs.mkdir(paths.workflowDir, { recursive: true });
    await fs.mkdir(paths.memoryDir, { recursive: true });
    await fs.mkdir(paths.currentRunDir, { recursive: true });
    await fs.writeFile(paths.briefPath, "Quebrar escopo", "utf8");

    const response = `# Tasks\n\n## Task Breakdown\n\n### T01 - Implementar API\n- Owner: backend-engineer\n- Dominio: backend\n- Complexidade: alta\n- Dependencias: nenhuma\n- Entregaveis: endpoint /api/orders\n- Testes e evidencias: npm test\n\nImplementar endpoint principal.`;

    await writeWorkflowArtifacts(paths, response, "tasks", "run-1");

    const taskFile = await fs.readFile(path.join(paths.workflowDir, "task_01.md"), "utf8");
    expect(taskFile).toContain("owner: backend-engineer");
    expect(taskFile).toContain("domain: backend");
    expect(taskFile).toContain("## Deliverables");
    expect(taskFile).toContain("endpoint /api/orders");
  });

  it("writes review issue files from pipe-based findings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sf-review-"));
    tempDirs.push(root);
    const paths = getWorkflowPaths(path.join(root, ".software-factory"), "review-flow", "run-1");

    await fs.mkdir(paths.workflowDir, { recursive: true });
    await fs.mkdir(paths.memoryDir, { recursive: true });
    await fs.mkdir(paths.currentRunDir, { recursive: true });
    await fs.mkdir(paths.reviewsDir, { recursive: true });
    await fs.writeFile(paths.briefPath, "Revisar escopo", "utf8");

    const response = `# Review\n\n## Findings By Severity\n\n- high | src/app.ts | 42 | Falha no fluxo | Corrigir validacao de entrada.\n\n## Accepted Risks\n\nNenhum.\n\n## Gate Recommendation\n\nSegurar.`;

    await writeWorkflowArtifacts(paths, response, "review", "run-1");

    const reviewDirs = await fs.readdir(paths.reviewsDir);
    const issueFiles = await fs.readdir(path.join(paths.reviewsDir, reviewDirs[0]));
    expect(issueFiles).toContain("issue_001.md");
    const issueFile = await fs.readFile(path.join(paths.reviewsDir, reviewDirs[0], "issue_001.md"), "utf8");
    expect(issueFile).toContain("severity: high");
    expect(issueFile).toContain("Corrigir validacao de entrada.");
  });

  it("merges autonomy output into workflow memory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sf-memory-"));
    tempDirs.push(root);
    const paths = getWorkflowPaths(path.join(root, ".software-factory"), "memory-flow", "run-1");

    await fs.mkdir(paths.workflowDir, { recursive: true });
    await fs.mkdir(paths.memoryDir, { recursive: true });
    await fs.mkdir(paths.currentRunDir, { recursive: true });
    await fs.writeFile(paths.briefPath, "Consolidar memoria", "utf8");
    await fs.writeFile(
      paths.sharedMemoryPath,
      "# Workflow Memory\n\n## Decisoes duraveis\n\n- base antiga\n\n## Riscos ativos\n\n## Handoffs reutilizaveis\n\n## Preferencias aprovadas\n",
      "utf8",
    );

    const response = `# Autonomy\n\n## Durable Workflow Memory\n\n- nova decisao\n\n## First Handoff\n\n- enviar para tech-lead`;

    await writeWorkflowArtifacts(paths, response, "autonomy", "run-1");

    const memory = await fs.readFile(paths.sharedMemoryPath, "utf8");
    expect(memory).toContain("base antiga");
    expect(memory).toContain("nova decisao");
    expect(memory).toContain("enviar para tech-lead");
  });
});
