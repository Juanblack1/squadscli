import fs from "node:fs/promises";
import path from "node:path";

import { loadEnvironment } from "../config.js";
import { ensureDir, writeText } from "../fs-utils.js";
import { resolveModelForProvider } from "../model-utils.js";
import { createProvider } from "../provider-factory.js";
import type { EffortLevel, ProviderName, RunRequest } from "../types.js";
import {
  buildVideoShortsPlanningPrompt,
  ensureVideoShortsPaths,
  getVideoShortsPaths,
  isYouTubeUrl,
  makeVideoRunId,
  materializeVideoShorts,
  parseVideoShortsResponse,
  prepareVideoSource,
  type VideoEditorTarget,
  writeVideoShortsArtifacts,
} from "../video-utils.js";

export async function runVideoShortsCommand(options: {
  workspaceDir: string;
  workflowName: string;
  inputPath: string;
  transcriptPath?: string;
  goal: string;
  editor: VideoEditorTarget;
  provider: ProviderName;
  effort: EffortLevel;
  model?: string;
  count: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  materialize: boolean;
  dryRun: boolean;
}) {
  await loadEnvironment(options.workspaceDir);

  const absoluteInput = isYouTubeUrl(options.inputPath)
    ? options.inputPath
    : path.isAbsolute(options.inputPath)
    ? options.inputPath
    : path.join(options.workspaceDir, options.inputPath);
  const absoluteTranscript = options.transcriptPath
    ? (path.isAbsolute(options.transcriptPath)
        ? options.transcriptPath
        : path.join(options.workspaceDir, options.transcriptPath))
    : undefined;
  const stateDir = path.join(options.workspaceDir, ".software-factory");
  const workflowDir = path.join(stateDir, "workflows", options.workflowName);
  const shortsPaths = getVideoShortsPaths(workflowDir, options.editor);
  if (!Number.isFinite(options.count) || options.count <= 0) {
    throw new Error("O campo 'count' precisa ser maior que zero.");
  }
  if (
    !Number.isFinite(options.minDurationSeconds) ||
    !Number.isFinite(options.maxDurationSeconds) ||
    options.minDurationSeconds <= 0 ||
    options.maxDurationSeconds < options.minDurationSeconds
  ) {
    throw new Error("Os limites de duracao dos shorts sao invalidos.");
  }
  const preparedSource = await prepareVideoSource({
    workflowDir,
    input: absoluteInput,
    transcriptPath: absoluteTranscript,
  });
  const model = resolveModelForProvider(options.provider, options.model);
  const runId = makeVideoRunId();
  const runDir = path.join(stateDir, "runs", runId);
  const currentDir = path.join(stateDir, "runs", "current");
  const promptText = buildVideoShortsPlanningPrompt({
    goal: options.goal,
    editor: options.editor,
    metadata: preparedSource.metadata,
    source: preparedSource.source,
    count: options.count,
    minDurationSeconds: options.minDurationSeconds,
    maxDurationSeconds: options.maxDurationSeconds,
  });
  const promptBundle = {
    system:
      "You are the Software Factory short-video specialist. Use the transcript and metadata to identify high-signal clips that can stand alone as short-form videos.",
    user: promptText,
  };
  const promptMarkdown = `# System\n\n${promptBundle.system}\n\n# User\n\n${promptBundle.user}\n`;

  await ensureVideoShortsPaths(shortsPaths);
  await ensureDir(runDir);
  await ensureDir(currentDir);
  await writeText(path.join(runDir, "prompt.md"), promptMarkdown);
  await writeText(path.join(currentDir, "prompt.md"), promptMarkdown);

  if (options.dryRun) {
    return {
      runId,
      workflowName: options.workflowName,
      editor: options.editor,
      provider: options.provider,
      model: model || null,
      metadata: preparedSource.metadata,
      source: preparedSource.source,
      prompt: promptText,
      paths: shortsPaths,
    };
  }

  const provider = createProvider(options.provider);
  const result = await provider.invoke(
    promptBundle,
    {
      name: options.workflowName,
      brief: options.goal,
      mode: "full-run",
      stage: "full-run",
      effort: options.effort,
      model,
      workspaceDir: options.workspaceDir,
      stateDir,
      provider: options.provider,
      dryRun: false,
    } satisfies RunRequest,
  );

  await writeText(path.join(runDir, "response.md"), `${result.text.trim()}\n`);
  await writeText(path.join(currentDir, "response.md"), `${result.text.trim()}\n`);
  await fs.writeFile(path.join(runDir, "response.json"), JSON.stringify(result.raw ?? null, null, 2), "utf8");

  const manifest = parseVideoShortsResponse({
    responseText: result.text,
    goal: options.goal,
    editor: options.editor,
    source: preparedSource,
    count: options.count,
  });

  await writeVideoShortsArtifacts({
    paths: shortsPaths,
    manifest,
  });

  const renderedFiles = options.materialize
    ? await materializeVideoShorts(manifest, shortsPaths.outputDir)
    : [];

  return {
    runId,
    workflowName: options.workflowName,
    editor: options.editor,
    provider: options.provider,
    model: model || null,
    source: preparedSource.source,
    manifestPath: shortsPaths.manifestPath,
    planPath: shortsPaths.planPath,
    renderScriptPath: shortsPaths.renderScriptPath,
    outputDir: shortsPaths.outputDir,
    renderedFiles,
  };
}
