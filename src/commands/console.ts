import fs from "node:fs/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { loadSoftwareFactoryConfig } from "../config.js";
import { extractSquadSkills, listRecentRuns, listWorkflowSummaries, parseSkillSelection } from "../console-utils.js";
import { runDoctorCommand } from "./doctor.js";
import { runModelsCommand } from "./models.js";
import { runProvidersCommand } from "./providers.js";
import { runSoftwareFactoryCommand } from "./run.js";
import type { EffortLevel, ProviderName, RunMode, RunStage } from "../types.js";

type SessionState = {
  workspaceDir: string;
  provider: ProviderName;
  model?: string;
  effort: EffortLevel;
  workflowName?: string;
  mode: RunMode;
  stage: RunStage;
  focusSkills: string[];
  dryRun: boolean;
};

type PersistedSessionState = Partial<Pick<SessionState, "provider" | "model" | "effort" | "workflowName" | "mode" | "stage" | "focusSkills" | "dryRun">>;

type SlashCommand = {
  name: string;
  argText: string;
};

const STAGE_PRESETS: Record<string, { mode: RunMode; stage: RunStage }> = {
  run: { mode: "full-run", stage: "full-run" },
  prd: { mode: "full-run", stage: "prd" },
  techspec: { mode: "full-run", stage: "techspec" },
  tasks: { mode: "full-run", stage: "tasks" },
  review: { mode: "review", stage: "review" },
  autonomy: { mode: "autonomy", stage: "autonomy" },
};

const EFFORT_VALUES: EffortLevel[] = ["lite", "balanced", "deep"];
const MODE_VALUES: RunMode[] = ["full-run", "review", "autonomy"];
const STAGE_VALUES: RunStage[] = ["full-run", "prd", "techspec", "tasks", "review", "autonomy"];

function getDefaultProvider(providers: Awaited<ReturnType<typeof runProvidersCommand>>) {
  const preferred = providers.providers.find((provider) => provider.provider === providers.defaultProvider && provider.ready);
  if (preferred) {
    return preferred.provider;
  }

  return providers.providers.find((provider) => provider.ready)?.provider || providers.defaultProvider;
}

function parseSlashCommand(line: string): SlashCommand {
  const trimmed = line.trim().slice(1);
  const [name = "", ...rest] = trimmed.split(" ");
  return {
    name: name.toLowerCase(),
    argText: rest.join(" ").trim(),
  };
}

function formatDate(value: string) {
  return value.replace("T", " ").replace(".000Z", "Z");
}

function statePrompt(state: SessionState) {
  const workflow = state.workflowName || "auto";
  const model = state.model || "auto";
  const skillCount = state.focusSkills.length;
  const dryRun = state.dryRun ? "dry" : "live";
  return `sf ${state.provider}/${model} ${state.stage} wf:${workflow} skills:${skillCount} ${dryRun}> `;
}

function printHelp() {
  output.write(`
software-factory console

Digite um brief direto para executar usando o estado atual da sessao.

Slash commands:
  /help                      mostra esta ajuda
  /status                    mostra o estado atual da sessao
  /providers                 lista providers e readiness
  /models [provider]         lista modelos do provider atual ou informado
  /workflows                 lista workflows encontrados
  /history                   lista runs recentes
  /skills                    lista skills do squad e skills focadas da sessao
  /doctor                    roda o doctor do provider atual
  /provider <name>           define provider da sessao
  /model <name|auto>         define model da sessao
  /effort <lite|balanced|deep>
  /workflow <name|auto>      define workflow fixo ou volta para auto
  /mode <full-run|review|autonomy>
  /stage <full-run|prd|techspec|tasks|review|autonomy>
  /skills set a,b,c          define skills focadas da sessao
  /skills clear              limpa skills focadas
  /dry-run <on|off>          alterna dry-run padrao da sessao
  /reset                     volta a sessao para os defaults do projeto
  /run <brief>               executa full-run com o estado atual
  /prd <brief>               executa stage PRD
  /techspec <brief>          executa stage Tech Spec
  /tasks <brief>             executa stage Tasks
  /review <brief>            executa review
  /autonomy <brief>          executa autonomy
  /exit                      sai do console

Exemplos:
  /provider codex
  /model gpt-5.4
  /workflow onboarding
  /skills set api-design,code-review
  /prd Criar onboarding com dashboard inicial
  Implementar fluxo completo de onboarding com foco em conversao
`);
}

function printStatus(state: SessionState) {
  output.write(`
Workspace: ${state.workspaceDir}
Provider: ${state.provider}
Model: ${state.model || "auto"}
Effort: ${state.effort}
Mode: ${state.mode}
Stage: ${state.stage}
Workflow: ${state.workflowName || "auto"}
Dry-run: ${state.dryRun}
Skills focadas: ${state.focusSkills.join(", ") || "none"}
`);
}

async function askLine(rl: ReturnType<typeof createInterface>, prompt: string) {
  try {
    return await rl.question(prompt);
  } catch {
    return null;
  }
}

async function runWithSession(state: SessionState, brief: string, override?: { mode?: RunMode; stage?: RunStage }) {
  const normalizedBrief = brief.trim();
  if (!normalizedBrief) {
    output.write("Brief obrigatorio.\n");
    return;
  }

  const result = await runSoftwareFactoryCommand({
    name: state.workflowName,
    brief: normalizedBrief,
    workspaceDir: state.workspaceDir,
    mode: override?.mode || state.mode,
    stage: override?.stage || state.stage,
    effort: state.effort,
    model: state.model,
    provider: state.provider,
    dryRun: state.dryRun,
    focusSkills: state.focusSkills,
  });

  output.write(`\n${JSON.stringify(result, null, 2)}\n`);
}

async function getSessionFilePath(workspaceDir: string) {
  const config = await loadSoftwareFactoryConfig(workspaceDir);
  return path.join(workspaceDir, config.outputDir, "console-session.json");
}

async function loadPersistedState(workspaceDir: string): Promise<PersistedSessionState | null> {
  try {
    const filePath = await getSessionFilePath(workspaceDir);
    return JSON.parse(await fs.readFile(filePath, "utf8")) as PersistedSessionState;
  } catch {
    return null;
  }
}

async function persistState(state: SessionState) {
  const filePath = await getSessionFilePath(state.workspaceDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    `${JSON.stringify(
      {
        provider: state.provider,
        model: state.model || null,
        effort: state.effort,
        workflowName: state.workflowName || null,
        mode: state.mode,
        stage: state.stage,
        focusSkills: state.focusSkills,
        dryRun: state.dryRun,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function handleProviders(state: SessionState) {
  const result = await runProvidersCommand(state.workspaceDir);
  output.write(`\nWorkspace: ${result.workspaceDir}\n`);
  output.write(`Default provider: ${result.defaultProvider}\n`);
  output.write(`Default effort: ${result.defaultEffort}\n\n`);

  result.providers.forEach((provider) => {
    output.write(
      `- ${provider.provider} [${provider.kind}] ready=${provider.ready} model=${provider.activeModel || "auto"}\n`,
    );
  });
}

async function handleHistory(state: SessionState) {
  const runs = await listRecentRuns(state.workspaceDir);
  output.write("\nRuns recentes:\n");
  if (runs.length === 0) {
    output.write("- none\n");
    return;
  }

  runs.forEach((run) => {
    output.write(
      `- ${run.runId} | wf=${run.workflowName} | stage=${run.stage} | provider=${run.provider} | model=${run.model || "auto"} | updated=${formatDate(run.updatedAt)}\n`,
    );
  });
}

async function handleModels(state: SessionState, providerArg?: string) {
  const provider = (providerArg || state.provider) as ProviderName;
  const result = await runModelsCommand(state.workspaceDir, provider);
  output.write(`\nWorkspace: ${result.workspaceDir}\n`);
  output.write(`Global model override: ${result.globalModelOverride || "none"}\n\n`);

  result.providers.forEach((item) => {
    output.write(
      `- ${item.provider}: active=${item.activeModel || "auto"}; suggested=${item.suggestedModels.join(", ") || "none"}\n`,
    );
  });
}

async function handleWorkflows(state: SessionState) {
  const workflows = await listWorkflowSummaries(state.workspaceDir);
  output.write("\nWorkflows:\n");
  if (workflows.length === 0) {
    output.write("- none\n");
    return;
  }

  workflows.forEach((workflow) => {
    output.write(`- ${workflow.workflowName} | stage=${workflow.currentStage} | updated=${formatDate(workflow.updatedAt)}\n`);
  });
}

function handleSkills(state: SessionState) {
  const skills = extractSquadSkills();
  output.write("\nSkills do squad:\n");
  skills.forEach((skill) => output.write(`- ${skill}\n`));
  if (skills.length === 0) {
    output.write("- none\n");
  }
  output.write(`\nSkills focadas da sessao: ${state.focusSkills.join(", ") || "none"}\n`);
}

async function buildInitialState(workspaceDir: string, options?: { ignorePersisted?: boolean }): Promise<SessionState> {
  const providers = await runProvidersCommand(workspaceDir);
  const config = await loadSoftwareFactoryConfig(workspaceDir);
  const persisted = options?.ignorePersisted ? null : await loadPersistedState(workspaceDir);

  const providerCandidates = new Set(providers.providers.map((provider) => provider.provider));
  const persistedProvider = persisted?.provider && providerCandidates.has(persisted.provider) ? persisted.provider : undefined;
  const provider = persistedProvider || getDefaultProvider(providers);

  const mode = persisted?.mode && MODE_VALUES.includes(persisted.mode) ? persisted.mode : "full-run";
  const stage = persisted?.stage && STAGE_VALUES.includes(persisted.stage) ? persisted.stage : mode === "review" ? "review" : mode === "autonomy" ? "autonomy" : "full-run";

  return {
    workspaceDir,
    provider,
    model: persisted?.model || undefined,
    effort: persisted?.effort && EFFORT_VALUES.includes(persisted.effort) ? persisted.effort : config.defaultEffort,
    workflowName: persisted?.workflowName || undefined,
    mode,
    stage,
    focusSkills: Array.isArray(persisted?.focusSkills) ? persisted.focusSkills.filter((item) => typeof item === "string") : [],
    dryRun: Boolean(persisted?.dryRun),
  };
}

async function handleSessionCommand(state: SessionState, command: SlashCommand, rl: ReturnType<typeof createInterface>) {
  if (command.name === "help") {
    printHelp();
    return false;
  }

  if (command.name === "status") {
    printStatus(state);
    return false;
  }

  if (command.name === "providers") {
    await handleProviders(state);
    return false;
  }

  if (command.name === "models") {
    await handleModels(state, command.argText || undefined);
    return false;
  }

  if (command.name === "workflows") {
    await handleWorkflows(state);
    return false;
  }

  if (command.name === "history") {
    await handleHistory(state);
    return false;
  }

  if (command.name === "skills") {
    const action = command.argText.split(" ")[0]?.toLowerCase() || "";
    const payload = command.argText.replace(/^\S+\s*/, "").trim();

    if (!action) {
      handleSkills(state);
      return false;
    }

    if (action === "clear") {
      state.focusSkills = [];
      await persistState(state);
      output.write("Skills focadas limpas.\n");
      return false;
    }

    if (action === "set") {
      state.focusSkills = parseSkillSelection(payload);
      await persistState(state);
      output.write(`Skills focadas atualizadas: ${state.focusSkills.join(", ") || "none"}\n`);
      return false;
    }

    handleSkills(state);
    return false;
  }

  if (command.name === "provider") {
    const providers = await runProvidersCommand(state.workspaceDir);
    const nextProvider = providers.providers.find((item) => item.provider === command.argText)?.provider;
    if (!nextProvider) {
      output.write(`Provider invalido. Disponiveis: ${providers.providers.map((item) => item.provider).join(", ")}\n`);
      return false;
    }

    state.provider = nextProvider;
    state.model = undefined;
    await persistState(state);
    output.write(`Provider definido para ${state.provider}.\n`);
    return false;
  }

  if (command.name === "model") {
    if (!command.argText || command.argText === "auto") {
      state.model = undefined;
      await persistState(state);
      output.write("Model voltou para auto.\n");
      return false;
    }

    state.model = command.argText;
    await persistState(state);
    output.write(`Model definido para ${state.model}.\n`);
    return false;
  }

  if (command.name === "effort") {
    const effort = command.argText as EffortLevel;
    if (!EFFORT_VALUES.includes(effort)) {
      output.write(`Effort invalido. Use: ${EFFORT_VALUES.join(", ")}\n`);
      return false;
    }

    state.effort = effort;
    await persistState(state);
    output.write(`Effort definido para ${state.effort}.\n`);
    return false;
  }

  if (command.name === "workflow") {
    if (!command.argText || command.argText === "auto") {
      state.workflowName = undefined;
      await persistState(state);
      output.write("Workflow voltou para auto.\n");
      return false;
    }

    state.workflowName = command.argText;
    await persistState(state);
    output.write(`Workflow definido para ${state.workflowName}.\n`);
    return false;
  }

  if (command.name === "mode") {
    const mode = command.argText as RunMode;
    if (!MODE_VALUES.includes(mode)) {
      output.write(`Mode invalido. Use: ${MODE_VALUES.join(", ")}\n`);
      return false;
    }

    state.mode = mode;
    if (mode === "review") state.stage = "review";
    if (mode === "autonomy") state.stage = "autonomy";
    await persistState(state);
    output.write(`Mode definido para ${state.mode}.\n`);
    return false;
  }

  if (command.name === "stage") {
    const stage = command.argText as RunStage;
    if (!STAGE_VALUES.includes(stage)) {
      output.write(`Stage invalido. Use: ${STAGE_VALUES.join(", ")}\n`);
      return false;
    }

    state.stage = stage;
    if (stage === "review") state.mode = "review";
    else if (stage === "autonomy") state.mode = "autonomy";
    else state.mode = "full-run";
    await persistState(state);
    output.write(`Stage definido para ${state.stage}.\n`);
    return false;
  }

  if (command.name === "dry-run") {
    const value = command.argText.toLowerCase();
    if (value !== "on" && value !== "off") {
      output.write("Use /dry-run on ou /dry-run off\n");
      return false;
    }

    state.dryRun = value === "on";
    await persistState(state);
    output.write(`Dry-run definido para ${state.dryRun}.\n`);
    return false;
  }

  if (command.name === "doctor") {
    const result = await runDoctorCommand(state.workspaceDir, state.provider);
    output.write(`\n${JSON.stringify(result, null, 2)}\n`);
    return false;
  }

  if (command.name === "reset") {
    const initial = await buildInitialState(state.workspaceDir, { ignorePersisted: true });
    state.provider = initial.provider;
    state.model = initial.model;
    state.effort = initial.effort;
    state.workflowName = initial.workflowName;
    state.mode = initial.mode;
    state.stage = initial.stage;
    state.focusSkills = initial.focusSkills;
    state.dryRun = initial.dryRun;
    await persistState(state);
    output.write("Sessao resetada para os defaults do projeto.\n");
    return false;
  }

  if (command.name in STAGE_PRESETS) {
    const preset = STAGE_PRESETS[command.name];
    state.mode = preset.mode;
    state.stage = preset.stage;
    await persistState(state);

    let brief = command.argText;
    if (!brief) {
      const answer = await askLine(rl, "Brief: ");
      if (answer === null) {
        return true;
      }
      brief = answer.trim();
    }

    await runWithSession(state, brief, preset);
    return false;
  }

  if (command.name === "exit" || command.name === "quit") {
    return true;
  }

  output.write(`Comando desconhecido: /${command.name}. Use /help.\n`);
  return false;
}

export async function runConsoleCommand(workspaceDir: string) {
  const rl = createInterface({ input, output, terminal: true });
  const state = await buildInitialState(workspaceDir);

  try {
    output.write("software-factory console\n");
    output.write("REPL para provider, model, workflow, stage e skills. Use /help para ver os comandos.\n");
    output.write(`Sessao carregada: provider=${state.provider}, model=${state.model || "auto"}, stage=${state.stage}, workflow=${state.workflowName || "auto"}.\n`);
    await persistState(state);

    while (true) {
      const line = await askLine(rl, statePrompt(state));
      if (line === null) {
        output.write("\nEncerrando console.\n");
        return;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      if (trimmed.startsWith("/")) {
        const shouldExit = await handleSessionCommand(state, parseSlashCommand(trimmed), rl);
        if (shouldExit) {
          output.write("Encerrando console.\n");
          return;
        }
        continue;
      }

      await runWithSession(state, trimmed);
    }
  } finally {
    rl.close();
  }
}
