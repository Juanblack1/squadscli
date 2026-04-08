import path from "node:path";

import { loadEnvironment } from "../config.js";
import { resolveModelForProvider } from "../model-utils.js";
import { createProvider } from "../provider-factory.js";
import type { EffortLevel, ProviderName, RunRequest } from "../types.js";
import {
  analyzeVideoSource,
  buildUniversalImportGuide,
  buildVideoPlanningPrompt,
  ensureVideoWorkflowPaths,
  getVideoWorkflowPaths,
  makeVideoRunId,
  type VideoEditorTarget,
  writeVideoArtifacts,
} from "../video-utils.js";

export async function runVideoPlanCommand(options: {
  workspaceDir: string;
  workflowName: string;
  inputPath: string;
  goal: string;
  editor: VideoEditorTarget;
  provider: ProviderName;
  effort: EffortLevel;
  model?: string;
  dryRun: boolean;
}) {
  await loadEnvironment(options.workspaceDir);

  const absoluteInput = path.isAbsolute(options.inputPath)
    ? options.inputPath
    : path.join(options.workspaceDir, options.inputPath);
  const metadata = await analyzeVideoSource(absoluteInput);
  const stateDir = path.join(options.workspaceDir, ".software-factory");
  const workflowDir = path.join(stateDir, "workflows", options.workflowName);
  const videoPaths = getVideoWorkflowPaths(workflowDir, options.editor);
  const model = resolveModelForProvider(options.provider, options.model);
  const runId = makeVideoRunId();
  const promptText = buildVideoPlanningPrompt({
    goal: options.goal,
    editor: options.editor,
    metadata,
  });

  await ensureVideoWorkflowPaths(videoPaths);

  if (options.dryRun) {
    return {
      runId,
      workflowName: options.workflowName,
      editor: options.editor,
      provider: options.provider,
      model: model || null,
      metadata,
      prompt: promptText,
      importGuide: buildUniversalImportGuide({ editor: options.editor, metadata }),
      paths: videoPaths,
    };
  }

  const provider = createProvider(options.provider);
  const result = await provider.invoke(
    {
      system:
        "You are the Software Factory video planning specialist. Build an edit plan that can be executed in any modern video editor and materialized with ffmpeg when possible.",
      user: promptText,
    },
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

  await writeVideoArtifacts({
    paths: videoPaths,
    editor: options.editor,
    metadata,
    planText: result.text,
    workflowName: options.workflowName,
  });

  return {
    runId,
    workflowName: options.workflowName,
    editor: options.editor,
    provider: options.provider,
    model: model || null,
    metadataPath: videoPaths.metadataPath,
    planPath: videoPaths.planPath,
    importGuidePath: videoPaths.importGuidePath,
    ffmpegTemplatePath: videoPaths.ffmpegTemplatePath,
    assetChecklistPath: videoPaths.assetChecklistPath,
  };
}
