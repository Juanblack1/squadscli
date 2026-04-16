import fs from "node:fs/promises";
import path from "node:path";

import { loadEnvironment, loadSoftwareFactoryConfig } from "../config.js";
import { DEFAULT_CONFIG } from "../default-config.js";
import { ensureDir, timestampForRun, writeText } from "../fs-utils.js";
import { resolveModelForProvider } from "../model-utils.js";
import { retrieveStageContext } from "../../packages/retrieval/src/index.js";
import { createProvider } from "../provider-factory.js";
import { buildPrompt } from "../prompt-builder.js";
import { getStageSquadPacket, loadSoftwareFactoryContext } from "../squad-loader.js";
import type { EffortLevel, ProviderName, RunMode, RunStage } from "../types.js";
import { loadWorkflowArtifactSnapshot } from "../workflow-context.js";
import {
  createWorkflowExecutionState,
  getWorkflowPaths,
  initializeWorkflow,
  resolveWorkflowName,
  writeExecutionState,
  writeWorkflowArtifacts,
} from "../workflow.js";

export async function runSoftwareFactoryCommand(options: {
  name?: string;
  squad?: string;
  brief: string;
  workspaceDir: string;
  mode: RunMode;
  stage?: RunStage;
  effort?: EffortLevel;
  model?: string;
  provider: ProviderName;
  dryRun: boolean;
  focusSkills?: string[];
}) {
  await loadEnvironment(options.workspaceDir);

  const config = await loadSoftwareFactoryConfig(options.workspaceDir);
  const squad = loadSoftwareFactoryContext(options.workspaceDir, options.squad);
  const stateDir = path.join(options.workspaceDir, config.outputDir);
  const runId = timestampForRun();
  const stage = options.stage || options.mode;
  const effort = options.effort || config.defaultEffort;
  const model = resolveModelForProvider(options.provider, options.model);
  const workflowName = resolveWorkflowName(options.brief, options.name);
  const workflowPaths = getWorkflowPaths(stateDir, workflowName, runId);
  const runDir = path.join(stateDir, "runs", runId);
  const currentDir = path.join(stateDir, "runs", "current");

  await ensureDir(runDir);
  await ensureDir(currentDir);
  await initializeWorkflow(workflowPaths, options.brief);

  const squadPacket = getStageSquadPacket(stage, {
    workspaceDir: options.workspaceDir,
    squadCode: squad.code,
  });
  const workflowSnapshot = await loadWorkflowArtifactSnapshot(workflowPaths);
  const retrievedContext = retrieveStageContext({
    stage,
    brief: options.brief,
    workflowSnapshot,
    squadPacket,
  });
  const prompt = buildPrompt(
    config,
    options.brief,
    options.mode,
    stage,
    effort,
    options.workspaceDir,
    squadPacket,
    workflowSnapshot,
    retrievedContext,
    workflowName,
    options.focusSkills || [],
  );
  const promptText = `# System\n\n${prompt.system}\n\n# User\n\n${prompt.user}\n`;

  await writeText(path.join(runDir, "brief.md"), `${options.brief.trim()}\n`);
  await writeText(path.join(runDir, "prompt.md"), promptText);
  await writeText(path.join(currentDir, "prompt.md"), promptText);

  const plannedExecution = createWorkflowExecutionState({
    runId,
    workflowName,
    mode: options.mode,
    stage,
    effort,
    provider: options.provider,
    model: model || null,
    status: options.dryRun ? "dry-run" : "running",
    sharedMemoryExcerpt: workflowSnapshot.sharedMemory,
    taskMemoryExcerpt: workflowSnapshot.taskMemory,
    steps: squadPacket.executionPlan,
  });
  await writeExecutionState(workflowPaths, plannedExecution, runDir, currentDir);

  await writeText(
    path.join(runDir, "meta.json"),
    `${JSON.stringify(
      {
        runId,
        squad: squad.code,
        workflowName,
        mode: options.mode,
        stage,
        effort,
        model: model || null,
        provider: options.provider,
        focusSkills: options.focusSkills || [],
        workspaceDir: options.workspaceDir,
        requestedSquad: options.squad || null,
        execution: plannedExecution,
      },
      null,
      2,
    )}\n`,
  );

  if (options.dryRun) {
    return {
      runId,
      workflowName,
      squad: squad.code,
      stage,
      effort,
      model: model || null,
      runDir,
      promptPath: path.join(runDir, "prompt.md"),
      responsePath: null,
      execution: plannedExecution,
    };
  }

  const provider = createProvider(options.provider);
  try {
    const result = await provider.invoke(prompt, {
      name: workflowName,
      brief: options.brief,
      mode: options.mode,
      stage,
      effort,
      model,
      workspaceDir: options.workspaceDir,
      stateDir,
      provider: options.provider,
      dryRun: false,
    });

    await writeText(path.join(runDir, "response.md"), `${result.text.trim()}\n`);
    await writeText(path.join(currentDir, "response.md"), `${result.text.trim()}\n`);
    await fs.writeFile(path.join(runDir, "response.json"), JSON.stringify(result.raw ?? null, null, 2), "utf8");
    await writeWorkflowArtifacts(workflowPaths, result.text, stage, runId);

    const completedExecution = createWorkflowExecutionState({
      runId,
      workflowName,
      mode: options.mode,
      stage,
      effort,
      provider: options.provider,
      model: model || null,
      status: "completed",
      sharedMemoryExcerpt: workflowSnapshot.sharedMemory,
      taskMemoryExcerpt: workflowSnapshot.taskMemory,
      steps: squadPacket.executionPlan.map((step) => ({ ...step, status: "completed" })),
    });
    await writeExecutionState(workflowPaths, completedExecution, runDir, currentDir);

    return {
      runId,
      workflowName,
      squad: squad.code,
      stage,
      effort,
      runDir,
      workflowDir: workflowPaths.workflowDir,
      promptPath: path.join(runDir, "prompt.md"),
      responsePath: path.join(runDir, "response.md"),
      configName: config.name || DEFAULT_CONFIG.name,
      execution: completedExecution,
    };
  } catch (error) {
    const failedExecution = createWorkflowExecutionState({
      runId,
      workflowName,
      mode: options.mode,
      stage,
      effort,
      provider: options.provider,
      model: model || null,
      status: "failed",
      sharedMemoryExcerpt: workflowSnapshot.sharedMemory,
      taskMemoryExcerpt: workflowSnapshot.taskMemory,
      steps: squadPacket.executionPlan.map((step) => ({ ...step, status: "failed" })),
    });
    await writeExecutionState(workflowPaths, failedExecution, runDir, currentDir);
    throw error;
  }
}
