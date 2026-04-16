import fs from "node:fs";
import path from "node:path";

import { SOFTWARE_FACTORY_BUNDLE } from "../../../src/generated/software-factory-bundle.js";
import type { RunStage, WorkflowExecutionStep } from "../../core/src/index.js";

type PartyExecution = "inline" | "subagent";

export interface SquadPartyMember {
  id: string;
  name: string;
  icon: string;
  role: string;
  path: string;
  execution: PartyExecution;
  skills: string[];
}

export interface SquadAgentProfile {
  id: string;
  name: string;
  title: string;
  icon: string;
  execution: PartyExecution;
  skills: string[];
  roleSummary: string;
  role: string;
  identity: string;
  communicationStyle: string;
  principles: string[];
  process: string[];
  decisionCriteria: string[];
  qualityCriteria: string[];
  raw: string;
}

export interface SquadPipelineStep {
  id: string;
  name?: string;
  type: string;
  agent?: string;
  file?: string;
  activation?: string;
  trigger?: string;
  dependsOn: string[];
}

export interface SquadContext {
  code: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  mode: string;
  skills: string[];
  autonomy: {
    enabled: boolean;
    leader: string;
    improvementAgent: string;
    resetCadenceHours: number | null;
    summary: string;
    completionPolicy: string;
  };
  party: SquadPartyMember[];
  agentsById: Record<string, SquadAgentProfile>;
  pipelineSteps: SquadPipelineStep[];
  runnerSummary: string[];
}

export interface StageSquadPacket {
  stage: RunStage;
  summary: string;
  relevantSteps: SquadPipelineStep[];
  relevantAgents: SquadAgentProfile[];
  runnerSummary: string[];
  executionPlan: WorkflowExecutionStep[];
}

export interface SquadSummary {
  code: string;
  name: string;
  icon: string;
  path: string;
  bundled: boolean;
}

interface SquadBundleSource {
  squadYaml: string;
  squadPartyCsv: string;
  pipelineYaml: string;
  runnerPipelineMd: string;
  agents: Record<string, string>;
}

interface LoadSquadOptions {
  workspaceDir?: string;
  squadCode?: string;
}

function buildExecutionPlan(steps: SquadPipelineStep[], agentsById: Record<string, SquadAgentProfile>) {
  return steps.map((step, index) => {
    const nextStep = steps[index + 1] || null;
    const currentAgent = step.agent ? agentsById[step.agent] : null;
    const nextAgent = nextStep?.agent ? agentsById[nextStep.agent] : null;

    return {
      id: step.id,
      name: step.name || step.type,
      type: step.type,
      agentId: step.agent || null,
      agentName: currentAgent?.name || step.agent || null,
      dependsOn: step.dependsOn,
      activation: step.activation || null,
      trigger: step.trigger || null,
      handoffTo: nextAgent?.name || nextStep?.agent || null,
      status: "planned",
    } satisfies WorkflowExecutionStep;
  });
}

function trimQuotes(value: string) {
  return value.trim().replace(/^"|"$/g, "");
}

function extractBlock(raw: string, key: string) {
  const lines = raw.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.startsWith(`${key}:`));

  if (startIndex === -1) {
    return "";
  }

  const startLine = lines[startIndex];

  if (!startLine.endsWith(">") && !startLine.endsWith("|")) {
    return trimQuotes(startLine.slice(startLine.indexOf(":") + 1));
  }

  const output: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.length > 0 && !line.startsWith("  ")) {
      break;
    }

    output.push(line.replace(/^  /, ""));
  }

  return output.join("\n").trim();
}

function extractTopLevelList(raw: string, key: string) {
  const lines = raw.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === `${key}:`);

  if (startIndex === -1) {
    return [] as string[];
  }

  const output: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith("  - ")) {
      output.push(trimQuotes(line.replace(/^  - /, "")));
      continue;
    }

    if (line.trim() === "") {
      continue;
    }

    if (!line.startsWith("  ")) {
      break;
    }
  }

  return output;
}

function parseSquadYaml(raw: string) {
  const getScalar = (key: string) => {
    const line = raw.split(/\r?\n/).find((entry) => entry.startsWith(`${key}:`));
    return line ? trimQuotes(line.slice(line.indexOf(":") + 1)) : "";
  };

  return {
    code: getScalar("code"),
    name: getScalar("name"),
    description: extractBlock(raw, "description"),
    icon: getScalar("icon"),
    version: getScalar("version"),
    mode: getScalar("mode"),
    skills: extractTopLevelList(raw, "skills"),
    autonomy: {
      enabled: getScalar("enabled") === "true",
      leader: getScalar("leader"),
      improvementAgent: getScalar("improvement_agent"),
      resetCadenceHours: Number(getScalar("reset_cadence_hours") || 0) || null,
      summary: extractBlock(raw, "summary"),
      completionPolicy: extractBlock(raw, "completion_policy"),
    },
  };
}

function parseCsvRow(row: string) {
  const output: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      output.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  output.push(current);
  return output;
}

function parsePartyCsv(raw: string): SquadPartyMember[] {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const [, ...rows] = lines;

  return rows.map((row) => {
    const columns = parseCsvRow(row);
    const id = columns[0] || "";
    const name = columns[1] || "";
    const icon = columns[2] || "";
    const path = columns[columns.length - 3] || "";
    const execution = columns[columns.length - 2] || "subagent";
    const skills = columns[columns.length - 1] || "";
    const role = columns.slice(3, -3).join(",").trim();

    return {
      id,
      name,
      icon,
      role,
      path,
      execution: execution as PartyExecution,
      skills: skills.split(",").map((skill) => skill.trim()).filter(Boolean),
    };
  });
}

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: "", body: raw };
  }

  return {
    frontmatter: match[1],
    body: match[2],
  };
}

function parseFrontmatterValue(frontmatter: string, key: string) {
  const line = frontmatter.split(/\r?\n/).find((entry) => entry.startsWith(`${key}:`));
  return line ? trimQuotes(line.slice(line.indexOf(":") + 1)) : "";
}

function parseFrontmatterList(frontmatter: string, key: string) {
  const lines = frontmatter.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === `${key}:`);

  if (startIndex === -1) {
    return [] as string[];
  }

  const output: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith("  - ")) {
      output.push(trimQuotes(line.replace(/^  - /, "")));
      continue;
    }

    if (line.trim() === "") {
      continue;
    }

    break;
  }

  return output;
}

function extractMarkdownSection(body: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`### ${escaped}\\n([\\s\\S]*?)(?=\\n### |\\n## |$)`, "m");
  const match = body.match(regex);
  return match?.[1]?.trim() || "";
}

function extractList(section: string) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-0-9]+\./.test(line) || line.startsWith("- "))
    .map((line) => line.replace(/^[-0-9.\s]+/, "").trim())
    .filter(Boolean);
}

function parseAgentProfile(fileName: string, raw: string, party: SquadPartyMember[]) {
  const partyMember = party.find((member) => member.path.endsWith(fileName));
  const { frontmatter, body } = parseFrontmatter(raw);

  return {
    id: partyMember?.id || parseFrontmatterValue(frontmatter, "id").split("/").pop() || fileName.replace(/\.agent\.md$/, ""),
    name: parseFrontmatterValue(frontmatter, "name") || partyMember?.name || fileName.replace(/\.agent\.md$/, ""),
    title: parseFrontmatterValue(frontmatter, "title"),
    icon: parseFrontmatterValue(frontmatter, "icon") || partyMember?.icon || "",
    execution: (parseFrontmatterValue(frontmatter, "execution") || partyMember?.execution || "subagent") as PartyExecution,
    skills: parseFrontmatterList(frontmatter, "skills"),
    roleSummary: partyMember?.role || "",
    role: extractMarkdownSection(body, "Role"),
    identity: extractMarkdownSection(body, "Identity"),
    communicationStyle: extractMarkdownSection(body, "Communication Style"),
    principles: extractList(body.match(/## Principles\n([\s\S]*?)(?=\n## |$)/)?.[1] || ""),
    process: extractList(extractMarkdownSection(body, "Process")),
    decisionCriteria: extractList(extractMarkdownSection(body, "Decision Criteria")),
    qualityCriteria: extractList(body.match(/## Quality Criteria\n([\s\S]*?)(?=\n## |$)/)?.[1] || ""),
    raw,
  } satisfies SquadAgentProfile;
}

function parsePipelineSteps(raw: string): SquadPipelineStep[] {
  const lines = raw.split(/\r?\n/);
  const steps: SquadPipelineStep[] = [];
  let current: SquadPipelineStep | null = null;
  let collectingDepends = false;

  for (const line of lines) {
    const stepMatch = line.match(/^  - id: (.+)$/);

    if (stepMatch) {
      if (current) {
        steps.push(current);
      }

      current = {
        id: trimQuotes(stepMatch[1]),
        type: "",
        dependsOn: [],
      };
      collectingDepends = false;
      continue;
    }

    if (!current) {
      continue;
    }

    if (collectingDepends) {
      const dependsMatch = line.match(/^      - (.+)$/);

      if (dependsMatch) {
        current.dependsOn.push(trimQuotes(dependsMatch[1]));
        continue;
      }

      collectingDepends = false;
    }

    const propertyMatch = line.match(/^    ([A-Za-z_]+):\s*(.*)$/);

    if (!propertyMatch) {
      continue;
    }

    const [, key, value] = propertyMatch;

    if (key === "depends_on") {
      if (value) {
        current.dependsOn = [trimQuotes(value)];
      } else {
        collectingDepends = true;
      }
      continue;
    }

    if (key === "name") current.name = trimQuotes(value);
    if (key === "type") current.type = trimQuotes(value);
    if (key === "agent") current.agent = trimQuotes(value);
    if (key === "file") current.file = trimQuotes(value);
    if (key === "activation") current.activation = trimQuotes(value);
    if (key === "trigger") current.trigger = trimQuotes(value);
  }

  if (current) {
    steps.push(current);
  }

  return steps;
}

const STAGE_STEP_IDS: Record<RunStage, string[]> = {
  prd: ["step-01", "step-02", "step-03", "step-04", "step-05", "step-06"],
  techspec: ["step-07", "step-08", "step-09", "step-10", "step-11"],
  tasks: ["step-12", "step-12b", "step-13"],
  review: ["step-17", "step-18", "step-19", "step-20", "step-21", "step-22", "step-23", "step-24", "step-25", "step-26", "step-27", "step-28"],
  autonomy: [],
  "full-run": [],
};

function buildRunnerSummary(raw: string) {
  const summary = [
    "Carregar squad, party, memoria e contexto antes de executar.",
    "Executar pipeline passo a passo, respeitando agentes, skills e execution mode.",
    "Cada saida precisa virar artefato rastreavel para o proximo handoff.",
    "Rodadas longas devem respeitar autonomy, leader e improvement agent.",
  ];

  if (raw.includes("Resolve skills")) {
    summary.push("Skills do squad devem ser resolvidas antes da execucao.");
  }

  if (raw.includes("state.json")) {
    summary.push("O estado do run deve ser atualizado continuamente para rastreabilidade.");
  }

  return summary;
}

function buildSquadContext(bundle: SquadBundleSource) {
  const squad = parseSquadYaml(bundle.squadYaml);
  const party = parsePartyCsv(bundle.squadPartyCsv);
  const agentsById = Object.fromEntries(
    Object.entries(bundle.agents).map(([fileName, raw]) => {
      const profile = parseAgentProfile(fileName, raw, party);
      return [profile.id, profile];
    }),
  );

  return {
    ...squad,
    party,
    agentsById,
    pipelineSteps: parsePipelineSteps(bundle.pipelineYaml),
    runnerSummary: buildRunnerSummary(bundle.runnerPipelineMd),
  } satisfies SquadContext;
}

const BUNDLED_SOFTWARE_FACTORY_CONTEXT = buildSquadContext(SOFTWARE_FACTORY_BUNDLE);

function findWorkspaceRoot(workspaceDir: string) {
  let current = path.resolve(workspaceDir);

  while (true) {
    if (fs.existsSync(path.join(current, "squads"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function readTextIfExists(filePath: string) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
}

function resolveDefaultSquadCode(workspaceDir: string) {
  const root = findWorkspaceRoot(workspaceDir);
  if (!root) {
    return null;
  }

  const softwareFactoryPath = path.join(root, "squads", "software-factory", "squad.yaml");
  if (fs.existsSync(softwareFactoryPath)) {
    return "software-factory";
  }

  const squadsDir = path.join(root, "squads");
  const entries = fs.readdirSync(squadsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(squadsDir, entry.name, "squad.yaml")))
    .map((entry) => entry.name)
    .sort();

  return entries[0] || null;
}

function readWorkspaceSquadBundle(workspaceDir: string, squadCode: string): SquadBundleSource | null {
  const root = findWorkspaceRoot(workspaceDir);
  if (!root) {
    return null;
  }

  const squadDir = path.join(root, "squads", squadCode);
  const squadYaml = readTextIfExists(path.join(squadDir, "squad.yaml"));
  const squadPartyCsv = readTextIfExists(path.join(squadDir, "squad-party.csv"));
  const pipelineYaml = readTextIfExists(path.join(squadDir, "pipeline", "pipeline.yaml"));
  const runnerPipelineMd = readTextIfExists(path.join(root, "_opensquad", "core", "runner.pipeline.md"));

  if (!squadYaml || !squadPartyCsv || !pipelineYaml || !runnerPipelineMd) {
    return null;
  }

  const party = parsePartyCsv(squadPartyCsv);
  const agents = Object.fromEntries(
    party.map((member) => {
      const relativePath = member.path.replace(/^\.\//, "");
      const fileName = path.basename(relativePath);
      const filePath = path.join(squadDir, relativePath);
      return [fileName, fs.readFileSync(filePath, "utf8")];
    }),
  );

  return {
    squadYaml,
    squadPartyCsv,
    pipelineYaml,
    runnerPipelineMd,
    agents,
  } satisfies SquadBundleSource;
}

export function listAvailableSquads(workspaceDir?: string): SquadSummary[] {
  if (!workspaceDir) {
    return [
      {
        code: BUNDLED_SOFTWARE_FACTORY_CONTEXT.code,
        name: BUNDLED_SOFTWARE_FACTORY_CONTEXT.name,
        icon: BUNDLED_SOFTWARE_FACTORY_CONTEXT.icon,
        path: "bundled:software-factory",
        bundled: true,
      },
    ];
  }

  const root = findWorkspaceRoot(workspaceDir);
  if (!root) {
    return [
      {
        code: BUNDLED_SOFTWARE_FACTORY_CONTEXT.code,
        name: BUNDLED_SOFTWARE_FACTORY_CONTEXT.name,
        icon: BUNDLED_SOFTWARE_FACTORY_CONTEXT.icon,
        path: "bundled:software-factory",
        bundled: true,
      },
    ];
  }

  const squadsDir = path.join(root, "squads");
  const summaries = fs.readdirSync(squadsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const squadYaml = readTextIfExists(path.join(squadsDir, entry.name, "squad.yaml"));
      if (!squadYaml) {
        return null;
      }

      const parsed = parseSquadYaml(squadYaml);
      return {
        code: parsed.code || entry.name,
        name: parsed.name || entry.name,
        icon: parsed.icon || "🧩",
        path: path.join(squadsDir, entry.name),
        bundled: false,
      } satisfies SquadSummary;
    });

  const availableSummaries: SquadSummary[] = summaries.filter((summary): summary is NonNullable<(typeof summaries)[number]> => summary !== null);
  availableSummaries.sort((left, right) => left.code.localeCompare(right.code));

  return availableSummaries.length > 0
    ? availableSummaries
    : [
        {
          code: BUNDLED_SOFTWARE_FACTORY_CONTEXT.code,
          name: BUNDLED_SOFTWARE_FACTORY_CONTEXT.name,
          icon: BUNDLED_SOFTWARE_FACTORY_CONTEXT.icon,
          path: "bundled:software-factory",
          bundled: true,
        },
      ];
}

export function loadSquadContext(options: LoadSquadOptions = {}) {
  const requestedCode = options.squadCode || (options.workspaceDir ? resolveDefaultSquadCode(options.workspaceDir) : null) || "software-factory";

  if (options.workspaceDir) {
    const bundle = readWorkspaceSquadBundle(options.workspaceDir, requestedCode);
    if (bundle) {
      return buildSquadContext(bundle);
    }
  }

  if (requestedCode !== "software-factory") {
    throw new Error(`Squad nao encontrado no workspace: ${requestedCode}`);
  }

  return BUNDLED_SOFTWARE_FACTORY_CONTEXT;
}

export function loadSoftwareFactoryContext(workspaceDir?: string, squadCode?: string) {
  return loadSquadContext({ workspaceDir, squadCode });
}

export function getStageSquadPacket(stage: RunStage, options: LoadSquadOptions = {}): StageSquadPacket {
  const context = loadSquadContext(options);
  const steps =
    stage === "full-run"
      ? context.pipelineSteps.filter((step) => Boolean(step.agent))
      : stage === "autonomy"
        ? []
        : context.pipelineSteps.filter((step) => STAGE_STEP_IDS[stage].includes(step.id));

  const agentIds = new Set<string>();

  for (const step of steps) {
    if (step.agent) {
      agentIds.add(step.agent);
    }
  }

  if (stage === "autonomy") {
    agentIds.add(context.autonomy.leader);
    agentIds.add(context.autonomy.improvementAgent);
  }

  const relevantAgents = [...agentIds]
    .map((id) => context.agentsById[id])
    .filter(Boolean);
  const executionPlan = buildExecutionPlan(steps, context.agentsById);

  return {
    stage,
    summary:
      stage === "full-run"
        ? `${context.name}: fluxo completo com descoberta, especificacao, implementacao, qualidade, release e autonomia.`
        : stage === "autonomy"
          ? `Fechamento de rodada e reabertura enxuta usando ${context.autonomy.leader} e ${context.autonomy.improvementAgent}.`
          : `Estagio ${stage} executado como recorte do pipeline real ${context.code}.`,
    relevantSteps: steps,
    relevantAgents,
    runnerSummary: context.runnerSummary,
    executionPlan,
  };
}
