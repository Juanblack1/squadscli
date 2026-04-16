import fs from "node:fs/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, render, Static, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";

import { loadSoftwareFactoryConfig } from "../config.js";
import {
  extractWorkspaceSquadSkills,
  listAvailableSquadSummaries,
  listRecentRuns,
  listWorkflowSummaries,
  parseSkillSelection,
} from "../console-utils.js";
import { runDoctorCommand } from "./doctor.js";
import { runModelsCommand } from "./models.js";
import { runProvidersCommand } from "./providers.js";
import { runSoftwareFactoryCommand } from "./run.js";
import type { EffortLevel, ProviderName, RunMode, RunStage } from "../types.js";

type SessionState = {
  workspaceDir: string;
  squad: string;
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
  Pick<SessionState, "squad" | "provider" | "model" | "effort" | "workflowName" | "mode" | "stage" | "focusSkills" | "dryRun">
>;

type SlashCommand = {
  name: string;
  argText: string;
};

type MessageKind = "system" | "user" | "result" | "error";
type SidePanel = "squads" | "providers" | "workflows" | "runs" | "skills";
type ConsoleTrack = "build" | "plan" | "review" | "autonomy";

type CommandSuggestion = {
  command: string;
  description: string;
};

type ConsoleMessage = {
  id: number;
  kind: MessageKind;
  title: string;
  body: string;
  createdAt: string;
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
const PANEL_ORDER: SidePanel[] = ["squads", "providers", "workflows", "runs", "skills"];
const HELP_TEXT = [
  "/squad list | /squad next | /squad 2 | /squad software-factory",
  "/build | /plan | /review | /autonomy",
  "/provider codex | claude | opencode",
  "/model auto | gpt-5.4 | sonnet",
  "/workflow onboarding | auto",
  "/stage prd | techspec | tasks | full-run | review | autonomy",
  "/skills set api-design,code-review | /skills clear",
  "/dry-run on | off",
  "/doctor | /providers | /models | /workflows | /history | /reset | /exit",
  "Digite um brief direto para executar com o estado atual da sessao.",
].join("\n");

const COMMAND_SUGGESTIONS: CommandSuggestion[] = [
  { command: "/build", description: "ativa o fluxo padrao de execucao completa" },
  { command: "/plan", description: "ativa o fluxo de planejamento rapido via PRD" },
  { command: "/review", description: "ativa o modo de review antes de executar" },
  { command: "/squad next", description: "troca rapidamente para o proximo squad" },
  { command: "/squad list", description: "lista os squads disponiveis com indice" },
  { command: "/provider codex", description: "troca o provider da sessao" },
  { command: "/workflow auto", description: "usa workflow automatico para a proxima execucao" },
  { command: "/history", description: "abre o painel de runs recentes" },
  { command: "/doctor", description: "verifica o ambiente atual da sessao" },
  { command: "/help", description: "mostra a ajuda completa" },
];

const TRACK_RECIPES: Record<ConsoleTrack, string[]> = {
  build: [
    "implemente a melhoria no onboarding e rode os testes",
    "corrija o erro que ocorre ao selecionar squad pelo app desktop",
    "adicione uma nova feature e deixe pronta para PR",
  ],
  plan: [
    "planeje a refatoracao da selecao de squad para web e desktop",
    "descreva a arquitetura para suportar multiplos runtimes de squad",
    "quero um PRD curto para melhorar a UX da console",
  ],
  review: [
    "revise este fluxo como code review e aponte riscos reais",
    "avalie regressao na troca de squad e lacunas de teste",
    "faça uma review de seguranca antes do release",
  ],
  autonomy: [
    "leve esta melhoria de ponta a ponta e valide tudo no final",
    "resolva a issue inteira e retorne com build e smoke feitos",
    "faça a rodada completa de implementacao e qualidade",
  ],
};

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

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateLines(text: string, maxLines = 12) {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return text;
  }

  return `${lines.slice(0, maxLines).join("\n")}\n...`;
}

function statusColor(kind: MessageKind) {
  if (kind === "error") return "red" as const;
  if (kind === "result") return "green" as const;
  if (kind === "user") return "yellow" as const;
  return "cyan" as const;
}

function cyclePanel(current: SidePanel, step: number) {
  const index = PANEL_ORDER.indexOf(current);
  return PANEL_ORDER[(index + step + PANEL_ORDER.length) % PANEL_ORDER.length];
}

function cycleSquad(current: string, step: number, availableSquads: ReturnType<typeof listAvailableSquadSummaries>) {
  if (availableSquads.length === 0) {
    return current;
  }

  const index = availableSquads.findIndex((item) => item.code === current);
  const baseIndex = index >= 0 ? index : 0;
  return availableSquads[(baseIndex + step + availableSquads.length) % availableSquads.length]?.code || current;
}

function formatSquadList(availableSquads: ReturnType<typeof listAvailableSquadSummaries>, currentSquad: string) {
  if (availableSquads.length === 0) {
    return "Nenhum squad encontrado.";
  }

  return availableSquads
    .map((item, index) => {
      const marker = item.code === currentSquad ? "*" : " ";
      return `${marker} ${index + 1}. ${item.icon} ${item.code}  ${item.name}`;
    })
    .join("\n");
}

function resolveSquadInput(inputValue: string, currentSquad: string, availableSquads: ReturnType<typeof listAvailableSquadSummaries>) {
  const normalized = inputValue.trim().toLowerCase();
  if (!normalized || normalized === "list") {
    return { action: "list" as const };
  }

  if (normalized === "next") {
    return { action: "select" as const, squad: cycleSquad(currentSquad, 1, availableSquads) };
  }

  if (normalized === "prev" || normalized === "previous") {
    return { action: "select" as const, squad: cycleSquad(currentSquad, -1, availableSquads) };
  }

  const asIndex = Number(normalized);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= availableSquads.length) {
    return { action: "select" as const, squad: availableSquads[asIndex - 1]?.code };
  }

  const exact = availableSquads.find((item) => item.code.toLowerCase() === normalized);
  if (exact) {
    return { action: "select" as const, squad: exact.code };
  }

  const byPrefix = availableSquads.filter((item) => item.code.toLowerCase().startsWith(normalized));
  if (byPrefix.length === 1) {
    return { action: "select" as const, squad: byPrefix[0].code };
  }

  return { action: "invalid" as const };
}

function messageGlyph(kind: MessageKind) {
  if (kind === "error") return "x";
  if (kind === "result") return "+";
  if (kind === "user") return ">";
  return "~";
}

function resolveTrack(session: SessionState): ConsoleTrack {
  if (session.mode === "review" || session.stage === "review") {
    return "review";
  }

  if (session.mode === "autonomy" || session.stage === "autonomy") {
    return "autonomy";
  }

  return session.stage === "full-run" ? "build" : "plan";
}

function applyTrack(session: SessionState, track: ConsoleTrack): SessionState {
  if (track === "build") {
    return { ...session, mode: "full-run", stage: "full-run" };
  }

  if (track === "plan") {
    return { ...session, mode: "full-run", stage: "prd" };
  }

  if (track === "review") {
    return { ...session, mode: "review", stage: "review" };
  }

  return { ...session, mode: "autonomy", stage: "autonomy" };
}

function togglePrimaryTrack(session: SessionState): SessionState {
  return applyTrack(session, resolveTrack(session) === "plan" ? "build" : "plan");
}

function getTrackTone(track: ConsoleTrack) {
  if (track === "build") return "success" as const;
  if (track === "plan") return "warning" as const;
  if (track === "review") return "default" as const;
  return "muted" as const;
}

function formatTrackLabel(track: ConsoleTrack) {
  if (track === "build") return "build";
  if (track === "plan") return "plan";
  if (track === "review") return "review";
  return "autonomy";
}

function getInputSuggestions(inputValue: string, session: SessionState, availableSquads: ReturnType<typeof listAvailableSquadSummaries>) {
  const trimmed = inputValue.trim();
  if (!trimmed.startsWith("/")) {
    return [] as CommandSuggestion[];
  }

  if (trimmed === "/" || trimmed.length === 1) {
    return COMMAND_SUGGESTIONS.slice(0, 6);
  }

  const parsed = parseSlashCommand(trimmed);
  if (parsed.name === "squad") {
    return [
      {
        command: "/squad next",
        description: `proximo squad apos ${session.squad}`,
      },
      {
        command: "/squad prev",
        description: `squad anterior a ${session.squad}`,
      },
      ...availableSquads.slice(0, 6).map((item, index) => ({
        command: `/squad ${index + 1}`,
        description: `${item.icon} ${item.code}${item.code === session.squad ? " · ativo" : ""}`,
      })),
    ].slice(0, 6);
  }

  const query = `/${parsed.name}`;
  return COMMAND_SUGGESTIONS.filter((item) => item.command.startsWith(query)).slice(0, 6);
}

function getPromptRecipes(track: ConsoleTrack, squad: string) {
  return TRACK_RECIPES[track].map((text) => `${text} [${squad}]`);
}

function getSquadQuickPicks(currentSquad: string, availableSquads: ReturnType<typeof listAvailableSquadSummaries>) {
  return availableSquads.slice(0, 5).map((item, index) => ({
    command: `/squad ${index + 1}`,
    label: `${item.icon} ${item.code}`,
    active: item.code === currentSquad,
  }));
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
        squad: state.squad,
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

async function buildInitialState(workspaceDir: string, options?: { ignorePersisted?: boolean; preferredSquad?: string }): Promise<SessionState> {
  const providers = await runProvidersCommand(workspaceDir);
  const config = await loadSoftwareFactoryConfig(workspaceDir);
  const persisted = options?.ignorePersisted ? null : await loadPersistedState(workspaceDir);
  const availableSquads = listAvailableSquadSummaries(workspaceDir);

  if (options?.preferredSquad && !availableSquads.some((item) => item.code === options.preferredSquad)) {
    throw new Error(`Squad nao encontrado: ${options.preferredSquad}`);
  }

  const providerCandidates = new Set(providers.providers.map((provider) => provider.provider));
  const persistedProvider = persisted?.provider && providerCandidates.has(persisted.provider) ? persisted.provider : undefined;
  const preferredSquad = options?.preferredSquad && availableSquads.some((item) => item.code === options.preferredSquad)
    ? options.preferredSquad
    : undefined;
  const squad = preferredSquad || (persisted?.squad && availableSquads.some((item) => item.code === persisted.squad)
    ? persisted.squad
    : availableSquads.find((item) => item.code === "software-factory")?.code || availableSquads[0]?.code || "software-factory");
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
    squad,
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

function toneColor(tone?: "default" | "success" | "warning" | "muted" | "accent") {
  if (tone === "success") return "greenBright" as const;
  if (tone === "warning") return "yellowBright" as const;
  if (tone === "muted") return "gray" as const;
  if (tone === "accent") return "magentaBright" as const;
  return "cyanBright" as const;
}

function Panel(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: number | string;
  flexGrow?: number;
  tone?: "default" | "success" | "warning" | "muted" | "accent";
}) {
  return (
    <Box flexDirection="column" width={props.width} flexGrow={props.flexGrow} borderStyle="round" borderColor="gray" paddingX={1} paddingY={0}>
      <Box justifyContent="space-between">
        <Text bold color={toneColor(props.tone)}>{props.title}</Text>
        {props.subtitle ? <Text color="gray">{props.subtitle}</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {props.children}
      </Box>
    </Box>
  );
}

function StatusChip(props: { label: string; value: string; tone?: "default" | "success" | "warning" | "muted" }) {
  return (
    <Text color={toneColor(props.tone)}>
      ● <Text color="gray">{props.label}</Text> <Text color="white">{props.value}</Text>
    </Text>
  );
}

function SuggestionList(props: { suggestions: CommandSuggestion[] }) {
  if (props.suggestions.length === 0) {
    return null;
  }

  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="gray">Command palette</Text>
      {props.suggestions.map((item, index) => (
        <Text key={item.command}>
          <Text color={index === 0 ? "cyanBright" : "cyan"}>{index === 0 ? "> " : "  "}{item.command}</Text>
          <Text color="gray">  {item.description}</Text>
        </Text>
      ))}
    </Box>
  );
}

function TrackTabs(props: { active: ConsoleTrack }) {
  const tracks: ConsoleTrack[] = ["build", "plan", "review", "autonomy"];

  return (
    <Box marginBottom={1} borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="gray">Tracks </Text>
      {tracks.map((track, index) => (
        <React.Fragment key={track}>
          <Text color={props.active === track ? "magentaBright" : "gray"}>{props.active === track ? `[${track}]` : track}</Text>
          {index < tracks.length - 1 ? <Text color="gray">  </Text> : null}
        </React.Fragment>
      ))}
      <Text color="gray">  Tab alterna build/plan</Text>
    </Box>
  );
}

function PromptRecipeList(props: { track: ConsoleTrack; squad: string; visible: boolean }) {
  if (!props.visible) {
    return null;
  }

  const recipes = getPromptRecipes(props.track, props.squad);
  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="gray">Starter prompts</Text>
      {recipes.map((recipe) => (
        <Text key={recipe} color="gray">- {recipe}</Text>
      ))}
    </Box>
  );
}

function SquadQuickPicker(props: {
  currentSquad: string;
  squads: ReturnType<typeof listAvailableSquadSummaries>;
  visible: boolean;
}) {
  if (!props.visible || props.squads.length === 0) {
    return null;
  }

  const picks = getSquadQuickPicks(props.currentSquad, props.squads);
  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="gray">Squad quick picker</Text>
      <Text color="gray">Use /squad next, /squad prev ou um indice direto.</Text>
      {picks.map((item) => (
        <Text key={item.command}>
          <Text color={item.active ? "magentaBright" : "cyan"}>{item.command}</Text>
          <Text color="gray">  {item.label}</Text>
          {item.active ? <Text color="green">  ativo</Text> : null}
        </Text>
      ))}
    </Box>
  );
}

function MessageView({ message }: { message: ConsoleMessage }) {
  return (
    <Box marginBottom={1} borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
      <Text bold color={statusColor(message.kind)}>
        {messageGlyph(message.kind)} {message.title} <Text color="gray">{message.kind} · {formatClock(message.createdAt)}</Text>
      </Text>
      <Text color={message.kind === "user" ? "white" : "gray"}>{truncateLines(message.body, message.kind === "result" ? 16 : 10)}</Text>
    </Box>
  );
}

function SidebarSession({ state }: { state: SessionState }) {
  const rows = [
    ["Squad", state.squad],
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
        <Text key={label}><Text color="gray">{label}</Text><Text color="gray"> · </Text><Text>{value}</Text></Text>
      ))}
    </Box>
  );
}

function SidePanelView(props: {
  panel: SidePanel;
  squads: ReturnType<typeof listAvailableSquadSummaries>;
  currentSquad: string;
  providersData: Awaited<ReturnType<typeof runProvidersCommand>> | null;
  workflows: Awaited<ReturnType<typeof listWorkflowSummaries>>;
  recentRuns: Awaited<ReturnType<typeof listRecentRuns>>;
  skills: string[];
}) {
  const header = PANEL_ORDER.map((panel) => (panel === props.panel ? `[${panel}]` : panel)).join(" ");

  return (
    <Box flexDirection="column">
      <Text color="magentaBright">{header}</Text>
      <Box marginTop={1} flexDirection="column">
        {props.panel === "providers" && props.providersData && props.providersData.providers.map((provider) => (
          <Text key={provider.provider}>
            <Text color={provider.ready ? "green" : "red"}>{provider.ready ? "●" : "○"}</Text>
            <Text> {provider.provider}</Text>
            <Text color="gray"> [{provider.kind}] {provider.activeModel || "auto"}</Text>
          </Text>
        ))}
        {props.panel === "squads" && (props.squads.length > 0 ? props.squads.map((squad, index) => (
          <Text key={squad.code}>
            <Text color={squad.code === props.currentSquad ? "green" : "gray"}>{squad.code === props.currentSquad ? "●" : "○"}</Text>
            <Text> {index + 1}. {squad.icon} {squad.code}</Text>
            <Text color="gray"> {squad.name}</Text>
          </Text>
        )) : <Text color="gray">Nenhum squad encontrado.</Text>)}
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

function ConsoleApp({ workspaceDir, preferredSquad }: { workspaceDir: string; preferredSquad?: string }) {
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
  const availableSquads = useMemo(() => listAvailableSquadSummaries(workspaceDir), [workspaceDir]);
  const track = session ? resolveTrack(session) : "build";
  const suggestions = session ? getInputSuggestions(inputValue, session, availableSquads) : [];
  const promptRecipes = session ? getPromptRecipes(track, session.squad) : [];
  const skills = useMemo(() => {
    if (!session) {
      return [] as string[];
    }

    try {
      return extractWorkspaceSquadSkills(workspaceDir, session.squad);
    } catch {
      return [] as string[];
    }
  }, [session, workspaceDir]);

  const appendMessage = useCallback((kind: MessageKind, title: string, body: string) => {
    setMessages((current) => [...current.slice(-24), { id: nextId.current++, kind, title, body, createdAt: new Date().toISOString() }]);
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
      const initialSession = await buildInitialState(workspaceDir, { preferredSquad });
      setSession(initialSession);
      await persistState(initialSession);
      await reloadSurfaceData();
      appendMessage(
        "system",
        "squadscli console",
        `Workspace: ${workspaceDir}\nSquad: ${initialSession.squad}\nUse /help para ver os comandos, /squad next para alternar ou Ctrl+J/Ctrl+K para trocar rapido.\n\n${formatSquadList(availableSquads.slice(0, 5), initialSession.squad)}`,
      );
    })();
  }, [appendMessage, availableSquads, preferredSquad, reloadSurfaceData, workspaceDir]);

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
        squad: session.squad,
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

    if (command.name === "build" || command.name === "plan" || command.name === "review" || command.name === "autonomy") {
      const nextTrack = command.name as ConsoleTrack;
      if (!command.argText) {
        const nextSession = applyTrack(session, nextTrack);
        setSession(nextSession);
        await persistState(nextSession);
        appendMessage("system", "Track atualizado", `Track definido para ${formatTrackLabel(nextTrack)}.`);
        return;
      }

      await runWorkflow(command.argText, { mode: applyTrack(session, nextTrack).mode, stage: applyTrack(session, nextTrack).stage });
      return;
    }

    if (command.name === "status") {
      appendMessage("system", "Sessao", formatJson(session));
      return;
    }

    if (command.name === "squad") {
      setPanel("squads");
      const selection = resolveSquadInput(command.argText, session.squad, availableSquads);

      if (selection.action === "list") {
        appendMessage("system", "Squads", formatSquadList(availableSquads, session.squad));
        return;
      }

      const nextSquad = selection.action === "select" ? selection.squad : undefined;
      if (!nextSquad) {
        appendMessage("error", "Squad invalido", `${formatSquadList(availableSquads, session.squad)}\n\nUse /squad <numero|codigo|next|prev>.`);
        return;
      }

      if (nextSquad === session.squad) {
        appendMessage("system", "Squad mantido", `Continuando com ${nextSquad}.`);
        return;
      }

      await updateSession((current) => ({ ...current, squad: nextSquad }), `Squad definido para ${nextSquad}.\n\n${formatSquadList(availableSquads, nextSquad)}`);
      return;
    }

    if (command.name === "squads") {
      setPanel("squads");
      appendMessage("system", "Squads", formatSquadList(availableSquads, session.squad));
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
        await updateSession(
          (current) => ({ ...current, mode: preset.mode, stage: preset.stage }),
          `Preset definido para ${command.name}. Agora o proximo brief direto usa ${preset.stage}.`,
        );
        return;
      }
      await runWorkflow(command.argText, preset);
      return;
    }

    appendMessage("error", "Comando desconhecido", `/${command.name}`);
  }, [appendMessage, availableSquads, exit, providersData, recentRuns, reloadSurfaceData, runWorkflow, session, skills, updateSession, workflows, workspaceDir]);

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
      if (session) {
        void updateSession(
          (current) => togglePrimaryTrack(current),
          `Track definido para ${formatTrackLabel(resolveTrack(togglePrimaryTrack(session)))}.`,
        );
      }
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

    if (key.leftArrow && !inputValue) {
      setPanel((current) => cyclePanel(current, -1));
      return;
    }

    if (key.rightArrow && !inputValue) {
      setPanel((current) => cyclePanel(current, 1));
      return;
    }

    if (session && key.ctrl && value === "j") {
      void updateSession(
        (current) => ({ ...current, squad: cycleSquad(current.squad, 1, availableSquads) }),
        `Squad definido para ${cycleSquad(session.squad, 1, availableSquads)}.`,
      );
      setPanel("squads");
      return;
    }

    if (session && key.ctrl && value === "k") {
      void updateSession(
        (current) => ({ ...current, squad: cycleSquad(current.squad, -1, availableSquads) }),
        `Squad definido para ${cycleSquad(session.squad, -1, availableSquads)}.`,
      );
      setPanel("squads");
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
  }, { isActive: true });

  if (!session) {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>squadscli console</Text>
        <Text color="gray">Carregando sessao...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="column">
          <Text color="white" bold>SquadsCli</Text>
          <Text color="gray">console shell for multi-squad execution</Text>
        </Box>
        <Box flexDirection="column" alignItems="flex-end">
          <Text color="magentaBright">{path.basename(workspaceDir)}</Text>
          <Text color="gray">{availableSquads.length} squads · {recentRuns.length} runs</Text>
        </Box>
      </Box>

      <Box marginBottom={1} gap={1} flexWrap="wrap">
        <StatusChip label="track" value={formatTrackLabel(track)} tone={getTrackTone(track)} />
        <StatusChip label="squad" value={session.squad} />
        <StatusChip label="provider" value={session.provider} tone={providersData?.providers.find((item) => item.provider === session.provider)?.ready ? "success" : "warning"} />
        <StatusChip label="stage" value={session.stage} tone="muted" />
        <StatusChip label="mode" value={session.dryRun ? "dry-run" : "live"} tone={session.dryRun ? "warning" : "success"} />
      </Box>

      <Box gap={1}>
        <Panel title="Session Rail" subtitle="estado atual" width={34} tone="accent">
          <SidebarSession state={session} />
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">Tab alterna build/plan</Text>
            <Text color="gray">Ctrl+J/K troca squad</Text>
            <Text color="gray">Left/Right alterna contexto</Text>
            <Text color="gray">Up/Down navega historico</Text>
            <Text color="gray">Esc limpa input · Ctrl+L limpa feed</Text>
          </Box>
        </Panel>

        <Box flexDirection="column" flexGrow={1}>
          <Panel title={busy ? "Prompt Center · running" : "Prompt Center"} subtitle="acao principal" flexGrow={1} tone="default">
            <TrackTabs active={track} />
            <Text color="gray">Escreva um brief ou use um slash command. A interface prioriza contexto minimo e execucao rapida.</Text>
            <Box marginTop={1} borderStyle="round" borderColor={busy ? "yellow" : "magenta"} paddingX={1} flexDirection="column">
              <Text color="gray">Prompt {busy ? "· running" : "· ready"} · {formatTrackLabel(track)} · {session.squad} · {session.provider}</Text>
              <TextInput value={inputValue} onChange={setInputValue} onSubmit={() => { void submit(); }} placeholder="Descreva a tarefa ou use /squad next, /provider codex, /stage full-run" />
            </Box>
            <SuggestionList suggestions={suggestions} />
            <SquadQuickPicker currentSquad={session.squad} squads={availableSquads} visible={!busy && (!inputValue.trim() || inputValue.trim().startsWith("/squad"))} />
            <PromptRecipeList track={track} squad={session.squad} visible={!inputValue.trim() && !busy && promptRecipes.length > 0} />
          </Panel>

          <Box marginTop={1} gap={1}>
            <Panel title={busy ? "Live Activity" : "Activity Feed"} subtitle="feedback da execucao" flexGrow={1} tone="success">
              {messages.length === 0 ? (
                <Box flexDirection="column">
                  <Text color="gray">Sem eventos ainda.</Text>
                  <Text color="gray">Use um brief direto, /build para execucao completa ou /plan para preparar antes.</Text>
                </Box>
              ) : (
                <Static items={messages.slice(-12)}>
                  {(message) => <MessageView key={message.id} message={message} />}
                </Static>
              )}
            </Panel>

            <Panel title="Hotkeys" subtitle="atalhos" width={32} tone="warning">
              <Text color="gray">/build /plan /review /autonomy</Text>
              <Text color="gray">/squad 1..N ou /squad next</Text>
              <Text color="gray">/provider codex | claude | opencode</Text>
              <Text color="gray">/skills set a,b · /history · /doctor</Text>
            </Panel>
          </Box>
        </Box>

        <Panel title="Context" subtitle={panel} width={46} tone="muted">
          <SidePanelView panel={panel} squads={availableSquads} currentSquad={session.squad} providersData={providersData} workflows={workflows} recentRuns={recentRuns} skills={skills} />
        </Panel>
      </Box>
    </Box>
  );
}

async function runConsoleFallback(workspaceDir: string, preferredSquad?: string) {
  const state = await buildInitialState(workspaceDir, { preferredSquad });
  output.write("squadscli console\n");
  output.write("Esta interface moderna precisa de um terminal TTY interativo.\n");
  output.write(`Workspace: ${workspaceDir}\n`);
  output.write(`Squad: ${state.squad}\n`);
  output.write(`Provider: ${state.provider}\n`);
  output.write("Abra em um terminal real e rode: squadscli console\n");
}

export async function runConsoleCommand(workspaceDir: string, preferredSquad?: string) {
  if (!input.isTTY || !output.isTTY) {
    await runConsoleFallback(workspaceDir, preferredSquad);
    return;
  }

  const app = render(<ConsoleApp workspaceDir={workspaceDir} preferredSquad={preferredSquad} />, {
    stdin: input,
    stdout: output,
    exitOnCtrlC: true,
  });
  await app.waitUntilExit();
}
