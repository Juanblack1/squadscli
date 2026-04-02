import type { ProviderName, ProviderProfile } from "./types.js";

export const PROVIDER_REGISTRY: Record<ProviderName, ProviderProfile> = {
  openai: {
    name: "openai",
    kind: "api",
    description: "Provider OpenAI via Responses API.",
    tokenStrategy: "Use contexto condensado e output estruturado para reduzir repeticao.",
    envKeys: ["OPENAI_API_KEY", "OPENAI_MODEL"],
  },
  "openai-compatible": {
    name: "openai-compatible",
    kind: "api",
    description: "Endpoint compatível com a API da OpenAI.",
    tokenStrategy: "Use endpoint compatível para modelos terceiros sem mudar o contrato da CLI.",
    envKeys: ["OPENAI_COMPATIBLE_API_KEY", "OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_MODEL"],
  },
  opencode: {
    name: "opencode",
    kind: "cli",
    description: "OpenCode CLI como executor externo do prompt do squad.",
    tokenStrategy: "Reaproveite arquivo de prompt e artefatos locais para reduzir contexto duplicado.",
    envKeys: [],
  },
  codex: {
    name: "codex",
    kind: "cli",
    description: "Codex CLI como executor externo do prompt do squad.",
    tokenStrategy: "Delegue apenas o estagio ativo e mantenha o contexto nos artefatos locais.",
    envKeys: ["CODEX_COMMAND_TEMPLATE"],
  },
  claude: {
    name: "claude",
    kind: "cli",
    description: "Claude Code ou runner equivalente via comando externo.",
    tokenStrategy: "Use task breakdown e memoria curta para reduzir releitura de historico.",
    envKeys: ["CLAUDE_COMMAND_TEMPLATE"],
  },
  gemini: {
    name: "gemini",
    kind: "cli",
    description: "Gemini CLI ou runner equivalente via comando externo.",
    tokenStrategy: "Mantenha foco no estagio atual e use Gemini Imagen apenas para imagens reais.",
    envKeys: ["GEMINI_COMMAND_TEMPLATE"],
  },
};

export const PROVIDER_COMMAND_TEMPLATES: Partial<Record<ProviderName, string>> = {
  opencode:
    'opencode run --dir "{workspace}" --file "{promptFile}" "Execute the attached software-factory prompt file end-to-end. Ask concise questions if blocking ambiguity remains."',
  codex: 'codex exec < "{promptFile}"',
  claude: 'claude -f "{promptFile}"',
  gemini: 'gemini -p "{promptFile}"',
};

export function listProviderNames() {
  return Object.keys(PROVIDER_REGISTRY) as ProviderName[];
}
