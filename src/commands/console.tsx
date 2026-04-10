import fs from "node:fs/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, render, Static, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";

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

type PersistedSessionState = Partial<
  Pick<SessionState, "provider" | "model" | "effort" | "workflowName" | "mode" | "stage" | "focusSkills" | "dryRun">
>;

type SlashCommand = {
  name: string;
  argText: string;
};

type MessageKind = "system" | "user" | "result" | "error";
type SidePanel = "providers" | "workflows" | "runs" | "skills";

type ConsoleMessage = {
  id: number;
  kind: MessageKind;
  title: string;
  body: string;
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
const PANEL_ORDER: SidePanel[] = ["providers", "workflows", "runs", "skills"];
const HELP_TEXT = [
  "/provider codex | claude | opencode",
  "/model auto | gpt-5.4 | sonnet",
  "/workflow onboarding | auto",
  "/stage prd | techspec | tasks | full-run | review | autonomy",
  "/skills set api-design,code-review | /skills clear",
  "/dry-run on | off",
  "/doctor | /providers | /models | /workflows | /history | /reset | /exit",
  "Digite um brief direto para executar com o estado atual da sessao.",
].join("\n");

function parseSlashCommand(line: string): SlashCommand {
  const trimmed = line.trim().slice(1);
  const [name = "", ...rest] = trimmed.split(" ");
  return { name: name.toLowerCase(), argText: rest.join(" ").trim() };
}

function getDefaultProvider(providers: Awaited<ReturnType<typeof runProvidersCommand>>) {
  const preferred = providers.providers.find((provider) => provider.provider === providers.defaultProvider && provider.ready);
  if (preferred) {
    return preferred.provider;
  }

  return providers.providers.find((provider) => provider.ready)?.provider || providers.defaultProvider;
}

function formatDate(value: string) {
  return value.replace("T", " ").replace(".000Z", "Z");
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function truncateLines(text: string, maxLines = 12) {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return text;
  }

  return `${lines.slice(0, maxLines).join("\n")}\n...`;
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

async function buildInitialState(workspaceDir: string, options?: { ignorePersisted?: boolean }): Promise<SessionState> {
  const providers = await runProvidersCommand(workspaceDir);
  const config = await loadSoftwareFactoryConfig(workspaceDir);
  const persisted = options?.ignorePersisted ? null : await loadPersistedState(workspaceDir);

  const providerCandidates = new Set(providers.providers.map((provider) => provider.provider));
  const persistedProvider = persisted?.provider && providerCandidates.has(persisted.provider) ? persisted.provider : undefined;
  const provider = persistedProvider || getDefaultProvider(providers);
  const mode = persisted?.mode && MODE_VALUES.includes(persisted.mode) ? persisted.mode : "full-run";
  const stage = persisted?.stage && STAGE_VALUES.includes(persisted.stage)
    ? persisted.stage
    : mode === "review"
      ? "review"
      : mode === "autonomy"
        ? "autonomy"
        : "full-run";

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

function Panel(props: { title: string; children: React.ReactNode; width?: number | string; flexGrow?: number }) {
  return (
    <Box flexDirection="column" width={props.width} flexGrow={props.flexGrow} borderStyle="round" borderColor="gray" paddingX={1} paddingY={0}>
      <Text bold color="cyan">{props.title}</Text>
      <Box marginTop={1} flexDirection="column">
        {props.children}
      </Box>
    </Box>
  );
}

function MessageView({ message }: { message: ConsoleMessage }) {
  const color = message.kind === "error" ? "red" : message.kind === "result" ? "green" : message.kind === "user" ? "yellow" : "white";
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={color}>{message.title}</Text>
      <Text color={message.kind === "user" ? "white" : "gray"}>{truncateLines(message.body, message.kind === "result" ? 16 : 10)}</Text>
    </Box>
  );
}

function SidebarSession({ state }: { state: SessionState }) {
  const rows = [
    ["Provider", state.provider],
    ["Model", state.model || "auto"],
    ["Stage", state.stage],
    ["Mode", state.mode],
    ["Workflow", state.workflowName || "auto"],
    ["Effort", state.effort],
    ["Run Mode", state.dryRun ? "dry-run" : "live"],
    ["Skills", state.focusSkills.join(", ") || "none"],
  ] as const;

  return (
    <Box flexDirection="column">
      {rows.map(([label, value]) => (
        <Text key={label}><Text color="gray">{label}: </Text><Text>{value}</Text></Text>
      ))}
    </Box>
  );
}

function SidePanelView(props: {
  panel: SidePanel;
  providersData: Awaited<ReturnType<typeof runProvidersCommand>> | null;
  workflows: Awaited<ReturnType<typeof listWorkflowSummaries>>;
  recentRuns: Awaited<ReturnType<typeof listRecentRuns>>;
  skills: string[];
}) {
  const header = PANEL_ORDER.map((panel) => (panel === props.panel ? `[${panel}]` : panel)).join(" ");

  return (
    <Box flexDirection="column">
      <Text color="magenta">{header}</Text>
      <Box marginTop={1} flexDirection="column">
        {props.panel === "providers" && props.providersData && props.providersData.providers.map((provider) => (
          <Text key={provider.provider}>
            <Text color={provider.ready ? "green" : "red"}>{provider.ready ? "●" : "○"}</Text>
            <Text> {provider.provider}</Text>
            <Text color="gray"> [{provider.kind}] {provider.activeModel || "auto"}</Text>
          </Text>
        ))}
        {props.panel === "workflows" && (props.workflows.length > 0 ? props.workflows.slice(0, 12).map((workflow) => (
          <Text key={workflow.workflowName}>{workflow.workflowName} <Text color="gray">{workflow.currentStage}</Text></Text>
        )) : <Text color="gray">Nenhum workflow ainda.</Text>)}
        {props.panel === "runs" && (props.recentRuns.length > 0 ? props.recentRuns.slice(0, 10).map((run) => (
          <Text key={run.runId}>{run.workflowName} <Text color="gray">{run.stage} {run.provider}</Text></Text>
        )) : <Text color="gray">Nenhum run ainda.</Text>)}
        {props.panel === "skills" && (props.skills.length > 0 ? props.skills.map((skill) => <Text key={skill}>{skill}</Text>) : <Text color="gray">Nenhuma skill no squad.</Text>)}
      </Box>
    </Box>
  );
}

function ConsoleApp({ workspaceDir }: { workspaceDir: string }) {
  const { exit } = useApp();
  const [session, setSession] = useState<SessionState | null>(null);
  const [providersData, setProvidersData] = useState<Awaited<ReturnType<typeof runProvidersCommand>> | null>(null);
  const [workflows, setWorkflows] = useState<Awaited<ReturnType<typeof listWorkflowSummaries>>>([]);
  const [recentRuns, setRecentRuns] = useState<Awaited<ReturnType<typeof listRecentRuns>>>([]);
  const [panel, setPanel] = useState<SidePanel>("providers");
  const [inputValue, setInputValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const nextId = useRef(1);
  const skills = useMemo(() => extractSquadSkills(), []);

  const appendMessage = useCallback((kind: MessageKind, title: string, body: string) => {
    setMessages((current) => [...current.slice(-24), { id: nextId.current++, kind, title, body }]);
  }, []);

  const reloadSurfaceData = useCallback(async () => {
    const [providers, workflowList, runList] = await Promise.all([
      runProvidersCommand(workspaceDir),
      listWorkflowSummaries(workspaceDir),
      listRecentRuns(workspaceDir),
    ]);
    setProvidersData(providers);
    setWorkflows(workflowList);
    setRecentRuns(runList);
  }, [workspaceDir]);

  useEffect(() => {
    void (async () => {
      const initialSession = await buildInitialState(workspaceDir);
      setSession(initialSession);
      await persistState(initialSession);
      await reloadSurfaceData();
      appendMessage(
        "system",
        "software-factory console",
        `Workspace: ${workspaceDir}\nUse /help para ver os comandos ou digite um brief direto para executar.`,
      );
    })();
  }, [appendMessage, reloadSurfaceData, workspaceDir]);

  const updateSession = useCallback(async (updater: (current: SessionState) => SessionState, message?: string) => {
    if (!session) return;
    const next = updater(session);
    setSession(next);
    await persistState(next);
    if (message) {
      appendMessage("system", "Sessao atualizada", message);
    }
  }, [appendMessage, session]);

  const runWorkflow = useCallback(async (brief: string, override?: { mode?: RunMode; stage?: RunStage }) => {
    if (!session) return;

    const normalizedBrief = brief.trim();
    if (!normalizedBrief) {
      appendMessage("error", "Brief obrigatorio", "Digite um brief ou use um slash command completo.");
      return;
    }

    setBusy(true);
    appendMessage("user", session.workflowName || "novo workflow", normalizedBrief);

    try {
      const result = await runSoftwareFactoryCommand({
        name: session.workflowName,
        brief: normalizedBrief,
        workspaceDir: session.workspaceDir,
        mode: override?.mode || session.mode,
        stage: override?.stage || session.stage,
        effort: session.effort,
        model: session.model,
        provider: session.provider,
        dryRun: session.dryRun,
        focusSkills: session.focusSkills,
      });
      appendMessage("result", `Run ${result.runId}`, formatJson(result));
      await reloadSurfaceData();
    } catch (error) {
      appendMessage("error", "Execucao falhou", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [appendMessage, reloadSurfaceData, session]);

  const handleSlashCommand = useCallback(async (value: string) => {
    if (!session) return;
    const command = parseSlashCommand(value);

    if (command.name === "help") {
      appendMessage("system", "Ajuda", HELP_TEXT);
      return;
    }

    if (command.name === "status") {
      appendMessage("system", "Sessao", formatJson(session));
      return;
    }

    if (command.name === "providers") {
      setPanel("providers");
      appendMessage("system", "Providers", providersData ? formatJson(providersData) : "Carregando providers...");
      return;
    }

    if (command.name === "models") {
      const provider = (command.argText || session.provider) as ProviderName;
      const result = await runModelsCommand(workspaceDir, provider);
      appendMessage("system", `Models ${provider}`, formatJson(result));
      return;
    }

    if (command.name === "workflows") {
      setPanel("workflows");
      appendMessage("system", "Workflows", workflows.length ? formatJson(workflows) : "Nenhum workflow ainda.");
      return;
    }

    if (command.name === "history") {
      setPanel("runs");
      appendMessage("system", "Runs recentes", recentRuns.length ? formatJson(recentRuns) : "Nenhum run ainda.");
      return;
    }

    if (command.name === "skills") {
      const action = command.argText.split(" ")[0]?.toLowerCase() || "";
      const payload = command.argText.replace(/^\S+\s*/, "").trim();
      setPanel("skills");

      if (!action) {
        appendMessage("system", "Skills", `Squad:\n${skills.join("\n") || "none"}\n\nFocus:\n${session.focusSkills.join("\n") || "none"}`);
        return;
      }

      if (action === "clear") {
        await updateSession((current) => ({ ...current, focusSkills: [] }), "Skills focadas limpas.");
        return;
      }

      if (action === "set") {
        const nextSkills = parseSkillSelection(payload);
        await updateSession((current) => ({ ...current, focusSkills: nextSkills }), `Skills focadas: ${nextSkills.join(", ") || "none"}`);
        return;
      }

      appendMessage("error", "Comando invalido", "Use /skills, /skills set a,b ou /skills clear.");
      return;
    }

    if (command.name === "provider") {
      const nextProvider = providersData?.providers.find((item) => item.provider === command.argText)?.provider;
      if (!nextProvider) {
        appendMessage("error", "Provider invalido", providersData ? providersData.providers.map((item) => item.provider).join(", ") : "Providers indisponiveis.");
        return;
      }
      await updateSession((current) => ({ ...current, provider: nextProvider, model: undefined }), `Provider definido para ${nextProvider}.`);
      return;
    }

    if (command.name === "model") {
      const nextModel = !command.argText || command.argText === "auto" ? undefined : command.argText;
      await updateSession((current) => ({ ...current, model: nextModel }), `Model definido para ${nextModel || "auto"}.`);
      return;
    }

    if (command.name === "workflow") {
      const nextWorkflow = !command.argText || command.argText === "auto" ? undefined : command.argText;
      await updateSession((current) => ({ ...current, workflowName: nextWorkflow }), `Workflow definido para ${nextWorkflow || "auto"}.`);
      return;
    }

    if (command.name === "effort") {
      const effort = command.argText as EffortLevel;
      if (!EFFORT_VALUES.includes(effort)) {
        appendMessage("error", "Effort invalido", EFFORT_VALUES.join(", "));
        return;
      }
      await updateSession((current) => ({ ...current, effort }), `Effort definido para ${effort}.`);
      return;
    }

    if (command.name === "mode") {
      const mode = command.argText as RunMode;
      if (!MODE_VALUES.includes(mode)) {
        appendMessage("error", "Mode invalido", MODE_VALUES.join(", "));
        return;
      }
      await updateSession((current) => ({ ...current, mode, stage: mode === "review" ? "review" : mode === "autonomy" ? "autonomy" : current.stage === "review" || current.stage === "autonomy" ? "full-run" : current.stage }), `Mode definido para ${mode}.`);
      return;
    }

    if (command.name === "stage") {
      const stage = command.argText as RunStage;
      if (!STAGE_VALUES.includes(stage)) {
        appendMessage("error", "Stage invalido", STAGE_VALUES.join(", "));
        return;
      }
      await updateSession((current) => ({ ...current, stage, mode: stage === "review" ? "review" : stage === "autonomy" ? "autonomy" : "full-run" }), `Stage definido para ${stage}.`);
      return;
    }

    if (command.name === "dry-run") {
      const enabled = command.argText.toLowerCase();
      if (enabled !== "on" && enabled !== "off") {
        appendMessage("error", "Uso invalido", "Use /dry-run on ou /dry-run off.");
        return;
      }
      await updateSession((current) => ({ ...current, dryRun: enabled === "on" }), `Dry-run ${enabled === "on" ? "ativado" : "desativado"}.`);
      return;
    }

    if (command.name === "doctor") {
      const result = await runDoctorCommand(workspaceDir, session.provider);
      appendMessage("system", `Doctor ${session.provider}`, formatJson(result));
      return;
    }

    if (command.name === "reset") {
      const initial = await buildInitialState(workspaceDir, { ignorePersisted: true });
      setSession(initial);
      await persistState(initial);
      appendMessage("system", "Sessao resetada", formatJson(initial));
      return;
    }

    if (command.name === "clear") {
      setMessages([]);
      appendMessage("system", "Tela limpa", "Historico visual limpo. A sessao foi preservada.");
      return;
    }

    if (command.name === "exit" || command.name === "quit") {
      exit();
      return;
    }

    if (command.name in STAGE_PRESETS) {
      const preset = STAGE_PRESETS[command.name];
      if (!command.argText) {
        appendMessage("error", "Brief obrigatorio", `Use /${command.name} <brief>.`);
        return;
      }
      await runWorkflow(command.argText, preset);
      return;
    }

    appendMessage("error", "Comando desconhecido", `/${command.name}`);
  }, [appendMessage, exit, providersData, recentRuns, reloadSurfaceData, runWorkflow, session, skills, updateSession, workflows, workspaceDir]);

  const submit = useCallback(async () => {
    const value = inputValue.trim();
    if (!value || busy) {
      return;
    }

    setHistory((current) => [...current.slice(-39), value]);
    setHistoryIndex(-1);
    setInputValue("");

    if (value.startsWith("/")) {
      setBusy(true);
      try {
        await handleSlashCommand(value);
      } catch (error) {
        appendMessage("error", "Falha no comando", error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
      return;
    }

    await runWorkflow(value);
  }, [appendMessage, busy, handleSlashCommand, inputValue, runWorkflow]);

  useInput((value, key) => {
    if (busy) {
      return;
    }

    if (key.tab) {
      setPanel((current) => PANEL_ORDER[(PANEL_ORDER.indexOf(current) + 1) % PANEL_ORDER.length]);
      return;
    }

    if (key.escape) {
      setInputValue("");
      return;
    }

    if (key.ctrl && value === "l") {
      setMessages([]);
      return;
    }

    if (key.upArrow) {
      setHistoryIndex((current) => {
        const next = current === -1 ? history.length - 1 : Math.max(0, current - 1);
        if (next >= 0 && history[next]) {
          setInputValue(history[next]);
        }
        return next;
      });
      return;
    }

    if (key.downArrow) {
      setHistoryIndex((current) => {
        if (current === -1) {
          return current;
        }
        const next = current + 1;
        if (next >= history.length) {
          setInputValue("");
          return -1;
        }
        setInputValue(history[next]);
        return next;
      });
    }
  });

  if (!session) {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>software-factory console</Text>
        <Text color="gray">Carregando sessao...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text color="cyan" bold>software-factory</Text>
          <Text color="gray">  modern terminal workspace</Text>
        </Box>
        <Text color="magenta">{path.basename(workspaceDir)}</Text>
      </Box>

      <Box gap={1}>
        <Panel title="Session" width={36}>
          <SidebarSession state={session} />
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">Tab: alterna painel direito</Text>
            <Text color="gray">Up/Down: historico de comandos</Text>
            <Text color="gray">Esc: limpa input</Text>
            <Text color="gray">Ctrl+L: limpa feed</Text>
          </Box>
        </Panel>

        <Panel title={busy ? "Activity · running" : "Activity"} flexGrow={1}>
          {messages.length === 0 ? (
            <Text color="gray">Sem eventos ainda.</Text>
          ) : (
            <Static items={messages.slice(-12)}>
              {(message) => <MessageView key={message.id} message={message} />}
            </Static>
          )}
        </Panel>

        <Panel title="Context" width={42}>
          <SidePanelView panel={panel} providersData={providersData} workflows={workflows} recentRuns={recentRuns} skills={skills} />
        </Panel>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor={busy ? "yellow" : "cyan"} paddingX={1} flexDirection="column">
        <Text color="gray">Prompt {busy ? "· running" : "· ready"}</Text>
        <TextInput value={inputValue} onChange={setInputValue} onSubmit={() => { void submit(); }} placeholder="Digite um brief ou um slash command como /help" />
      </Box>
    </Box>
  );
}

async function runConsoleFallback(workspaceDir: string) {
  const state = await buildInitialState(workspaceDir);
  output.write("software-factory console\n");
  output.write("Esta interface moderna precisa de um terminal TTY interativo.\n");
  output.write(`Workspace: ${workspaceDir}\n`);
  output.write(`Provider: ${state.provider}\n`);
  output.write("Abra em um terminal real e rode: software-factory console\n");
}

export async function runConsoleCommand(workspaceDir: string) {
  if (!input.isTTY || !output.isTTY) {
    await runConsoleFallback(workspaceDir);
    return;
  }

  const app = render(<ConsoleApp workspaceDir={workspaceDir} />, {
    stdin: input,
    stdout: output,
    exitOnCtrlC: true,
  });
  await app.waitUntilExit();
}
