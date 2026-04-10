import { Buffer } from "node:buffer";
import path from "node:path";

import { resolveEffort, resolveProvider } from "../../../src/config.js";
import { runModelsCommand } from "../../../src/commands/models.js";
import { runProvidersCommand } from "../../../src/commands/providers.js";
import { runSoftwareFactoryCommand } from "../../../src/commands/run.js";
import { runVideoPackageCommand } from "../../../src/commands/video-package.js";
import { runVideoPlanCommand } from "../../../src/commands/video-plan.js";
import { runVideoShortsCommand } from "../../../src/commands/video-shorts.js";
import { retrieveStageContext } from "../../../packages/retrieval/src/index.js";
import { getStageSquadPacket } from "../../../packages/squad-runtime/src/index.js";
import { loadWorkflowArtifactSnapshot } from "../../../src/workflow-context.js";
import { getWorkflowPaths } from "../../../src/workflow.js";
import { SUPPORTED_VIDEO_EDITORS } from "../../../src/video-utils.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: JsonObject;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

const TOOLS: ToolDefinition[] = [
  {
    name: "software_factory.providers",
    description: "Lista providers, disponibilidade, fallback e readiness do software-factory.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceDir: { type: "string" },
      },
    },
  },
  {
    name: "software_factory.models",
    description: "Lista modelos ativos e sugeridos por provider.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceDir: { type: "string" },
        provider: { type: "string" },
      },
    },
  },
  {
    name: "software_factory.run_dry",
    description: "Executa um dry-run do workflow principal do software-factory.",
    inputSchema: {
      type: "object",
      required: ["brief"],
      properties: {
        name: { type: "string" },
        brief: { type: "string" },
        workspaceDir: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        mode: { type: "string" },
      },
    },
  },
  {
    name: "software_factory.stage_dry",
    description: "Executa um dry-run de um stage especifico do software-factory.",
    inputSchema: {
      type: "object",
      required: ["brief", "stage"],
      properties: {
        name: { type: "string" },
        brief: { type: "string" },
        stage: { type: "string" },
        workspaceDir: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
      },
    },
  },
  {
    name: "software_factory.retrieval_dry",
    description: "Mostra o contexto recuperado para um stage antes de executar o provider.",
    inputSchema: {
      type: "object",
      required: ["brief", "name", "stage"],
      properties: {
        name: { type: "string" },
        brief: { type: "string" },
        stage: { type: "string" },
        workspaceDir: { type: "string" },
      },
    },
  },
  {
    name: "software_factory.video_plan_dry",
    description: "Gera um dry-run do planejamento universal de edicao de video.",
    inputSchema: {
      type: "object",
      required: ["name", "input", "goal"],
      properties: {
        name: { type: "string" },
        input: { type: "string" },
        goal: { type: "string" },
        editor: { type: "string" },
        workspaceDir: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
      },
    },
  },
  {
    name: "software_factory.video_package",
    description: "Gera pacote de importacao para um editor de video especifico.",
    inputSchema: {
      type: "object",
      required: ["name", "input"],
      properties: {
        name: { type: "string" },
        input: { type: "string" },
        editor: { type: "string" },
        workspaceDir: { type: "string" },
      },
    },
  },
  {
    name: "software_factory.video_shorts_dry",
    description: "Gera um dry-run de shorts a partir de highlights do video, incluindo suporte a URL do YouTube.",
    inputSchema: {
      type: "object",
      required: ["name", "input", "goal"],
      properties: {
        name: { type: "string" },
        input: { type: "string" },
        goal: { type: "string" },
        transcriptFile: { type: "string" },
        editor: { type: "string" },
        workspaceDir: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        count: { type: "number" },
        minSeconds: { type: "number" },
        maxSeconds: { type: "number" },
      },
    },
  },
  {
    name: "software_factory.video_shorts",
    description: "Gera manifesto de shorts e opcionalmente renderiza cortes base com ffmpeg.",
    inputSchema: {
      type: "object",
      required: ["name", "input", "goal"],
      properties: {
        name: { type: "string" },
        input: { type: "string" },
        goal: { type: "string" },
        transcriptFile: { type: "string" },
        editor: { type: "string" },
        workspaceDir: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        count: { type: "number" },
        minSeconds: { type: "number" },
        maxSeconds: { type: "number" },
        materialize: { type: "boolean" },
      },
    },
  },
];

function writeMessage(payload: JsonObject) {
  const body = JSON.stringify(payload);
  process.stdout.write(`${body}\n`);
}

function success(id: string | number | undefined, result: JsonObject) {
  if (id === undefined) return;
  writeMessage({ jsonrpc: "2.0", id, result });
}

function failure(id: string | number | undefined, message: string) {
  if (id === undefined) return;
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message,
    },
  });
}

function resolveWorkspaceDir(value: unknown) {
  return path.resolve(typeof value === "string" && value.trim() ? value : process.cwd());
}

function toStage(value: unknown) {
  const stage = String(value || "full-run");
  if (!["full-run", "prd", "techspec", "tasks", "review", "autonomy"].includes(stage)) {
    throw new Error(`Stage invalido: ${stage}`);
  }
  return stage as "full-run" | "prd" | "techspec" | "tasks" | "review" | "autonomy";
}

function toEditor(value: unknown) {
  const editor = typeof value === "string" && value.trim() ? value : "generic";
  if (!SUPPORTED_VIDEO_EDITORS.includes(editor as (typeof SUPPORTED_VIDEO_EDITORS)[number])) {
    throw new Error(`Editor invalido: ${editor}`);
  }
  return editor as (typeof SUPPORTED_VIDEO_EDITORS)[number];
}

function stageToMode(stage: ReturnType<typeof toStage>) {
  if (stage === "review") return "review" as const;
  if (stage === "autonomy") return "autonomy" as const;
  return "full-run" as const;
}

async function callTool(name: string, args: JsonObject) {
  if (name === "software_factory.providers") {
    return await runProvidersCommand(resolveWorkspaceDir(args.workspaceDir));
  }

  if (name === "software_factory.models") {
    const provider = typeof args.provider === "string" ? resolveProvider(args.provider) : undefined;
    return await runModelsCommand(resolveWorkspaceDir(args.workspaceDir), provider);
  }

  if (name === "software_factory.run_dry") {
    if (typeof args.brief !== "string" || !args.brief.trim()) throw new Error("Campo 'brief' obrigatorio.");
    return await runSoftwareFactoryCommand({
      name: typeof args.name === "string" ? args.name : undefined,
      brief: args.brief,
      workspaceDir: resolveWorkspaceDir(args.workspaceDir),
      mode: (typeof args.mode === "string" ? args.mode : "full-run") as "full-run" | "review" | "autonomy",
      effort: resolveEffort(typeof args.effort === "string" ? args.effort : undefined),
      model: typeof args.model === "string" ? args.model : undefined,
      provider: resolveProvider(typeof args.provider === "string" ? args.provider : undefined),
      dryRun: true,
    });
  }

  if (name === "software_factory.stage_dry") {
    if (typeof args.brief !== "string" || !args.brief.trim()) throw new Error("Campo 'brief' obrigatorio.");
    const stage = toStage(args.stage);
    return await runSoftwareFactoryCommand({
      name: typeof args.name === "string" ? args.name : undefined,
      brief: args.brief,
      workspaceDir: resolveWorkspaceDir(args.workspaceDir),
      mode: stageToMode(stage),
      stage,
      effort: resolveEffort(typeof args.effort === "string" ? args.effort : undefined),
      model: typeof args.model === "string" ? args.model : undefined,
      provider: resolveProvider(typeof args.provider === "string" ? args.provider : undefined),
      dryRun: true,
    });
  }

  if (name === "software_factory.retrieval_dry") {
    if (typeof args.brief !== "string" || !args.brief.trim()) throw new Error("Campo 'brief' obrigatorio.");
    if (typeof args.name !== "string" || !args.name.trim()) throw new Error("Campo 'name' obrigatorio.");
    const workspaceDir = resolveWorkspaceDir(args.workspaceDir);
    const stage = toStage(args.stage);
    const paths = getWorkflowPaths(path.join(workspaceDir, ".software-factory"), args.name, "mcp-view");
    const workflowSnapshot = await loadWorkflowArtifactSnapshot(paths);
    const squadPacket = getStageSquadPacket(stage);
    const chunks = retrieveStageContext({
      stage,
      brief: args.brief,
      workflowSnapshot,
      squadPacket,
    });

    return {
      workflowName: args.name,
      stage,
      chunkCount: chunks.length,
      chunks,
    };
  }

  if (name === "software_factory.video_plan_dry") {
    if (typeof args.name !== "string" || typeof args.input !== "string" || typeof args.goal !== "string") {
      throw new Error("Campos 'name', 'input' e 'goal' sao obrigatorios.");
    }
    return await runVideoPlanCommand({
      workspaceDir: resolveWorkspaceDir(args.workspaceDir),
      workflowName: args.name,
      inputPath: args.input,
      goal: args.goal,
      editor: toEditor(args.editor),
      provider: resolveProvider(typeof args.provider === "string" ? args.provider : undefined),
      effort: resolveEffort(typeof args.effort === "string" ? args.effort : undefined),
      model: typeof args.model === "string" ? args.model : undefined,
      dryRun: true,
    });
  }

  if (name === "software_factory.video_package") {
    if (typeof args.name !== "string" || typeof args.input !== "string") {
      throw new Error("Campos 'name' e 'input' sao obrigatorios.");
    }
    return await runVideoPackageCommand({
      workspaceDir: resolveWorkspaceDir(args.workspaceDir),
      workflowName: args.name,
      inputPath: args.input,
      editor: toEditor(args.editor),
    });
  }

  if (name === "software_factory.video_shorts_dry") {
    if (typeof args.name !== "string" || typeof args.input !== "string" || typeof args.goal !== "string") {
      throw new Error("Campos 'name', 'input' e 'goal' sao obrigatorios.");
    }
    return await runVideoShortsCommand({
      workspaceDir: resolveWorkspaceDir(args.workspaceDir),
      workflowName: args.name,
      inputPath: args.input,
      transcriptPath: typeof args.transcriptFile === "string" ? args.transcriptFile : undefined,
      goal: args.goal,
      editor: toEditor(args.editor),
      provider: resolveProvider(typeof args.provider === "string" ? args.provider : undefined),
      effort: resolveEffort(typeof args.effort === "string" ? args.effort : undefined),
      model: typeof args.model === "string" ? args.model : undefined,
      count: typeof args.count === "number" ? args.count : Number(args.count || 5),
      minDurationSeconds: typeof args.minSeconds === "number" ? args.minSeconds : Number(args.minSeconds || 20),
      maxDurationSeconds: typeof args.maxSeconds === "number" ? args.maxSeconds : Number(args.maxSeconds || 45),
      materialize: false,
      dryRun: true,
    });
  }

  if (name === "software_factory.video_shorts") {
    if (typeof args.name !== "string" || typeof args.input !== "string" || typeof args.goal !== "string") {
      throw new Error("Campos 'name', 'input' e 'goal' sao obrigatorios.");
    }
    return await runVideoShortsCommand({
      workspaceDir: resolveWorkspaceDir(args.workspaceDir),
      workflowName: args.name,
      inputPath: args.input,
      transcriptPath: typeof args.transcriptFile === "string" ? args.transcriptFile : undefined,
      goal: args.goal,
      editor: toEditor(args.editor),
      provider: resolveProvider(typeof args.provider === "string" ? args.provider : undefined),
      effort: resolveEffort(typeof args.effort === "string" ? args.effort : undefined),
      model: typeof args.model === "string" ? args.model : undefined,
      count: typeof args.count === "number" ? args.count : Number(args.count || 5),
      minDurationSeconds: typeof args.minSeconds === "number" ? args.minSeconds : Number(args.minSeconds || 20),
      maxDurationSeconds: typeof args.maxSeconds === "number" ? args.maxSeconds : Number(args.maxSeconds || 45),
      materialize: Boolean(args.materialize),
      dryRun: false,
    });
  }

  throw new Error(`Tool nao encontrada: ${name}`);
}

async function handleRequest(request: JsonRpcRequest) {
  if (request.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: "software-factory-mcp",
        version: "0.1.0",
      },
    };
  }

  if (request.method === "ping") {
    return {};
  }

  if (request.method === "tools/list") {
    return { tools: TOOLS };
  }

  if (request.method === "tools/call") {
    const toolName = typeof request.params?.name === "string" ? request.params.name : "";
    const args = (request.params?.arguments as JsonObject | undefined) || {};
    const result = await callTool(toolName, args);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  if (request.method === "notifications/initialized") {
    return undefined;
  }

  throw new Error(`Metodo nao suportado: ${request.method}`);
}

let buffer = Buffer.alloc(0);

function trimLeadingNewlines(source: Buffer) {
  let start = 0;

  while (start < source.length && (source[start] === 0x0a || source[start] === 0x0d)) {
    start += 1;
  }

  return start === 0 ? source : source.slice(start);
}

function findHeaderBoundary(source: Buffer) {
  const crlfIndex = source.indexOf("\r\n\r\n");
  if (crlfIndex !== -1) {
    return { headerEnd: crlfIndex, separatorLength: 4 };
  }

  const lfIndex = source.indexOf("\n\n");
  if (lfIndex !== -1) {
    return { headerEnd: lfIndex, separatorLength: 2 };
  }

  return null;
}

function extractNextJsonText(source: Buffer) {
  const normalized = trimLeadingNewlines(source);
  if (normalized.length === 0) {
    return null;
  }

  const firstByte = normalized[0];
  if (firstByte === 0x7b || firstByte === 0x5b) {
    const newlineIndex = normalized.indexOf(0x0a);
    if (newlineIndex === -1) {
      return null;
    }

    const jsonText = normalized.slice(0, newlineIndex).toString("utf8").trim();
    return {
      jsonText,
      remaining: normalized.slice(newlineIndex + 1),
    };
  }

  const headerBoundary = findHeaderBoundary(normalized);
  if (!headerBoundary) {
    return null;
  }

  const { headerEnd, separatorLength } = headerBoundary;
  const header = normalized.slice(0, headerEnd).toString("utf8");
  const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
  if (!lengthMatch) {
    throw new Error("Header Content-Length ausente no transporte MCP.");
  }

  const contentLength = Number(lengthMatch[1]);
  const messageStart = headerEnd + separatorLength;
  const messageEnd = messageStart + contentLength;
  if (normalized.length < messageEnd) {
    return null;
  }

  return {
    jsonText: normalized.slice(messageStart, messageEnd).toString("utf8"),
    remaining: normalized.slice(messageEnd),
  };
}

process.stdin.on("data", async (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    let extracted;
    try {
      extracted = extractNextJsonText(buffer);
    } catch (error) {
      buffer = Buffer.alloc(0);
      failure(undefined, error instanceof Error ? error.message : String(error));
      break;
    }

    if (!extracted) break;

    const { jsonText, remaining } = extracted;
    buffer = remaining;

    try {
      const request = JSON.parse(jsonText) as JsonRpcRequest;
      const result = await handleRequest(request);
      if (result !== undefined) {
        success(request.id, result as JsonObject);
      }
    } catch (error) {
      const request = (() => {
        try { return JSON.parse(jsonText) as JsonRpcRequest; } catch { return undefined; }
      })();
      failure(request?.id, error instanceof Error ? error.message : String(error));
    }
  }
});

process.stdin.resume();
