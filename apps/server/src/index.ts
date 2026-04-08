import http from "node:http";
import fs from "node:fs/promises";
import { URL } from "node:url";
import path from "node:path";

import { resolveEffort, resolveProvider } from "../../../src/config.js";
import { runModelsCommand } from "../../../src/commands/models.js";
import { runProvidersCommand } from "../../../src/commands/providers.js";
import { runSoftwareFactoryCommand } from "../../../src/commands/run.js";
import { retrieveStageContext } from "../../../packages/retrieval/src/index.js";
import { getStageSquadPacket } from "../../../packages/squad-runtime/src/index.js";
import { runVideoPackageCommand } from "../../../src/commands/video-package.js";
import { runVideoPlanCommand } from "../../../src/commands/video-plan.js";
import type { ArtifactRef, RunMode, RunStage, WorkflowState } from "../../../src/types.js";
import { SUPPORTED_VIDEO_EDITORS } from "../../../src/video-utils.js";
import { loadWorkflowArtifactSnapshot } from "../../../src/workflow-context.js";
import { getWorkflowPaths } from "../../../src/workflow.js";

type JsonRecord = Record<string, unknown>;

function json(response: http.ServerResponse, statusCode: number, payload: JsonRecord) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {} as JsonRecord;
  }

  return JSON.parse(text) as JsonRecord;
}

function resolveWorkspaceDir(value: unknown) {
  return path.resolve(typeof value === "string" && value.trim() ? value : process.cwd());
}

function getStateDir(workspaceDir: string) {
  return path.join(workspaceDir, ".software-factory");
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function stageToMode(stage: RunStage): RunMode {
  if (stage === "review") return "review";
  if (stage === "autonomy") return "autonomy";
  return "full-run";
}

function isRunStage(value: unknown): value is RunStage {
  return ["full-run", "prd", "techspec", "tasks", "review", "autonomy"].includes(String(value));
}

async function inferCurrentStage(snapshot: Awaited<ReturnType<typeof loadWorkflowArtifactSnapshot>>): Promise<RunStage> {
  if (snapshot.latestReviewSummary) return "review";
  if (snapshot.tasks || snapshot.taskFiles.length > 0) return "tasks";
  if (snapshot.techspec) return "techspec";
  if (snapshot.prd) return "prd";
  return "full-run";
}

async function listWorkflows(workspaceDir: string): Promise<WorkflowState[]> {
  const rootDir = path.join(getStateDir(workspaceDir), "workflows");

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const workflowDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

    return await Promise.all(
      workflowDirs.map(async (workflowName) => {
        const workflowDir = path.join(rootDir, workflowName);
        const currentRunDir = path.join(workflowDir, "runs", "server-view");
        const paths = getWorkflowPaths(getStateDir(workspaceDir), workflowName, "server-view");
        const snapshot = await loadWorkflowArtifactSnapshot(paths);
        const artifacts: ArtifactRef[] = [
          { type: "brief", path: paths.briefPath, exists: await exists(paths.briefPath) },
          { type: "prd", path: paths.prdPath, exists: await exists(paths.prdPath) },
          { type: "techspec", path: paths.techspecPath, exists: await exists(paths.techspecPath) },
          { type: "tasks", path: paths.tasksPath, exists: await exists(paths.tasksPath) },
          { type: "summary", path: paths.summaryPath, exists: await exists(paths.summaryPath) },
          { type: "memory", path: paths.sharedMemoryPath, exists: await exists(paths.sharedMemoryPath) },
        ];
        const stats = await fs.stat(workflowDir);

        return {
          workflowName,
          currentStage: await inferCurrentStage(snapshot),
          lastRunId: await exists(currentRunDir) ? "server-view" : null,
          artifacts,
          updatedAt: stats.mtime.toISOString(),
        } satisfies WorkflowState;
      }),
    );
  } catch {
    return [];
  }
}

async function getWorkflowDetails(workspaceDir: string, workflowName: string) {
  const stateDir = getStateDir(workspaceDir);
  const paths = getWorkflowPaths(stateDir, workflowName, "server-view");
  const snapshot = await loadWorkflowArtifactSnapshot(paths);
  const workflowDir = path.join(stateDir, "workflows", workflowName);

  if (!(await exists(workflowDir))) {
    throw new Error(`Workflow nao encontrado: ${workflowName}`);
  }

  const artifacts: ArtifactRef[] = [
    { type: "brief", path: paths.briefPath, exists: await exists(paths.briefPath) },
    { type: "prd", path: paths.prdPath, exists: await exists(paths.prdPath) },
    { type: "techspec", path: paths.techspecPath, exists: await exists(paths.techspecPath) },
    { type: "tasks", path: paths.tasksPath, exists: await exists(paths.tasksPath) },
    { type: "summary", path: paths.summaryPath, exists: await exists(paths.summaryPath) },
    { type: "shared-memory", path: paths.sharedMemoryPath, exists: await exists(paths.sharedMemoryPath) },
    { type: "task-memory", path: paths.taskMemoryPath, exists: await exists(paths.taskMemoryPath) },
    ...snapshot.taskFiles.map((task) => ({
      type: "task-file",
      path: path.join(paths.workflowDir, task.fileName),
      exists: true,
    } satisfies ArtifactRef)),
  ];

  return {
    workflowName,
    state: {
      workflowName,
      currentStage: await inferCurrentStage(snapshot),
      lastRunId: null,
      artifacts,
      updatedAt: (await fs.stat(workflowDir)).mtime.toISOString(),
    } satisfies WorkflowState,
    snapshot,
  };
}

function toVideoEditor(value: unknown) {
  const editor = typeof value === "string" && value.trim() ? value : "generic";
  if (!SUPPORTED_VIDEO_EDITORS.includes(editor as (typeof SUPPORTED_VIDEO_EDITORS)[number])) {
    throw new Error(`Editor invalido: ${editor}`);
  }
  return editor as (typeof SUPPORTED_VIDEO_EDITORS)[number];
}

async function route(request: http.IncomingMessage, response: http.ServerResponse) {
  const method = request.method || "GET";
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (method === "GET" && url.pathname === "/health") {
      return json(response, 200, {
        ok: true,
        service: "software-factory-server",
        phase: "phase-4-bootstrap",
      });
    }

    if (method === "GET" && url.pathname === "/providers") {
      const workspaceDir = resolveWorkspaceDir(url.searchParams.get("workspaceDir"));
      const result = await runProvidersCommand(workspaceDir);
      return json(response, 200, result as JsonRecord);
    }

    if (method === "GET" && url.pathname === "/models") {
      const workspaceDir = resolveWorkspaceDir(url.searchParams.get("workspaceDir"));
      const provider = url.searchParams.get("provider");
    const result = await runModelsCommand(workspaceDir, provider ? resolveProvider(provider) : undefined);
      return json(response, 200, result as JsonRecord);
    }

    if (method === "POST" && url.pathname === "/retrieval/dry-run") {
      const body = await readJsonBody(request);
      const stage = isRunStage(body.stage) ? body.stage : "full-run";
      const workspaceDir = resolveWorkspaceDir(body.workspaceDir);
      const workflowName = typeof body.name === "string" && body.name.trim() ? body.name : (typeof body.brief === "string" ? body.brief : "workflow");
      const paths = getWorkflowPaths(getStateDir(workspaceDir), workflowName, "server-view");
      const workflowSnapshot = await loadWorkflowArtifactSnapshot(paths);
      const squadPacket = getStageSquadPacket(stage);
      const chunks = retrieveStageContext({
        stage,
        brief: typeof body.brief === "string" ? body.brief : "",
        workflowSnapshot,
        squadPacket,
      });

      return json(response, 200, {
        workflowName,
        stage,
        chunkCount: chunks.length,
        chunks,
      });
    }

    if (method === "GET" && url.pathname === "/workflows") {
      const workspaceDir = resolveWorkspaceDir(url.searchParams.get("workspaceDir"));
      const workflows = await listWorkflows(workspaceDir);
      return json(response, 200, { workspaceDir, workflows });
    }

    const workflowMatch = url.pathname.match(/^\/workflows\/([^/]+)$/);
    if (method === "GET" && workflowMatch) {
      const workspaceDir = resolveWorkspaceDir(url.searchParams.get("workspaceDir"));
      const workflowName = decodeURIComponent(workflowMatch[1]);
      const result = await getWorkflowDetails(workspaceDir, workflowName);
      return json(response, 200, result as JsonRecord);
    }

    const artifactsMatch = url.pathname.match(/^\/artifacts\/([^/]+)$/);
    if (method === "GET" && artifactsMatch) {
      const workspaceDir = resolveWorkspaceDir(url.searchParams.get("workspaceDir"));
      const workflowName = decodeURIComponent(artifactsMatch[1]);
      const result = await getWorkflowDetails(workspaceDir, workflowName);
      return json(response, 200, { workflowName, artifacts: result.state.artifacts, snapshot: result.snapshot });
    }

    if (method === "POST" && url.pathname === "/runs/dry-run") {
      const body = await readJsonBody(request);
      if (typeof body.brief !== "string" || !body.brief.trim()) {
        throw new Error("Campo 'brief' obrigatorio.");
      }

      const result = await runSoftwareFactoryCommand({
        name: typeof body.name === "string" ? body.name : undefined,
        brief: body.brief,
        workspaceDir: resolveWorkspaceDir(body.workspaceDir),
        mode: (typeof body.mode === "string" ? body.mode : "full-run") as "full-run" | "review" | "autonomy",
        stage: typeof body.stage === "string" ? (body.stage as any) : undefined,
        effort: resolveEffort(typeof body.effort === "string" ? body.effort : undefined),
        model: typeof body.model === "string" ? body.model : undefined,
        provider: resolveProvider(typeof body.provider === "string" ? body.provider : undefined),
        dryRun: true,
      });

      return json(response, 200, result as JsonRecord);
    }

    const stageDryRunMatch = url.pathname.match(/^\/stages\/([^/]+)\/dry-run$/);
    if (method === "POST" && stageDryRunMatch) {
      const body = await readJsonBody(request);
      const stage = decodeURIComponent(stageDryRunMatch[1]);

      if (!isRunStage(stage)) {
        throw new Error(`Stage invalido: ${stage}`);
      }

      if (typeof body.brief !== "string" || !body.brief.trim()) {
        throw new Error("Campo 'brief' obrigatorio.");
      }

      const result = await runSoftwareFactoryCommand({
        name: typeof body.name === "string" ? body.name : undefined,
        brief: body.brief,
        workspaceDir: resolveWorkspaceDir(body.workspaceDir),
        mode: stageToMode(stage),
        stage,
        effort: resolveEffort(typeof body.effort === "string" ? body.effort : undefined),
        model: typeof body.model === "string" ? body.model : undefined,
        provider: resolveProvider(typeof body.provider === "string" ? body.provider : undefined),
        dryRun: true,
      });

      return json(response, 200, result as JsonRecord);
    }

    const stageRunMatch = url.pathname.match(/^\/stages\/([^/]+)\/run$/);
    if (method === "POST" && stageRunMatch) {
      const body = await readJsonBody(request);
      const stage = decodeURIComponent(stageRunMatch[1]);

      if (!isRunStage(stage)) {
        throw new Error(`Stage invalido: ${stage}`);
      }

      if (typeof body.brief !== "string" || !body.brief.trim()) {
        throw new Error("Campo 'brief' obrigatorio.");
      }

      const result = await runSoftwareFactoryCommand({
        name: typeof body.name === "string" ? body.name : undefined,
        brief: body.brief,
        workspaceDir: resolveWorkspaceDir(body.workspaceDir),
        mode: stageToMode(stage),
        stage,
        effort: resolveEffort(typeof body.effort === "string" ? body.effort : undefined),
        model: typeof body.model === "string" ? body.model : undefined,
        provider: resolveProvider(typeof body.provider === "string" ? body.provider : undefined),
        dryRun: false,
      });

      return json(response, 200, result as JsonRecord);
    }

    if (method === "POST" && url.pathname === "/video/plan/dry-run") {
      const body = await readJsonBody(request);
      if (typeof body.name !== "string" || typeof body.input !== "string" || typeof body.goal !== "string") {
        throw new Error("Campos 'name', 'input' e 'goal' sao obrigatorios.");
      }

      const result = await runVideoPlanCommand({
        workspaceDir: resolveWorkspaceDir(body.workspaceDir),
        workflowName: body.name,
        inputPath: body.input,
        goal: body.goal,
        editor: toVideoEditor(body.editor),
        provider: resolveProvider(typeof body.provider === "string" ? body.provider : undefined),
        effort: resolveEffort(typeof body.effort === "string" ? body.effort : undefined),
        model: typeof body.model === "string" ? body.model : undefined,
        dryRun: true,
      });

      return json(response, 200, result as JsonRecord);
    }

    if (method === "POST" && url.pathname === "/video/package") {
      const body = await readJsonBody(request);
      if (typeof body.name !== "string" || typeof body.input !== "string") {
        throw new Error("Campos 'name' e 'input' sao obrigatorios.");
      }

      const result = await runVideoPackageCommand({
        workspaceDir: resolveWorkspaceDir(body.workspaceDir),
        workflowName: body.name,
        inputPath: body.input,
        editor: toVideoEditor(body.editor),
      });

      return json(response, 200, result as JsonRecord);
    }

    return json(response, 404, { ok: false, error: "Not Found", path: url.pathname });
  } catch (error) {
    return json(response, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      path: url.pathname,
    });
  }
}

const port = Number(process.env.SOFTWARE_FACTORY_SERVER_PORT || 4111);

const server = http.createServer((request, response) => {
  void route(request, response);
});

server.listen(port, () => {
  console.log(JSON.stringify({ ok: true, service: "software-factory-server", port }, null, 2));
});
