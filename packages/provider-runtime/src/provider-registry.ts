import type { ProviderName, ProviderProfile } from "../../core/src/index.js";

export const PROVIDER_REGISTRY: Record<ProviderName, ProviderProfile> = {
  openai: {
    name: "openai",
    kind: "api",
    description: "Provider OpenAI via Responses API.",
    tokenStrategy: "Use contexto condensado e output estruturado para reduzir repeticao.",
    envKeys: ["OPENAI_API_KEY", "OPENAI_MODEL"],
    modelEnvKey: "OPENAI_MODEL",
    suggestedModels: ["gpt-5.4", "gpt-5.4-mini", "gpt-4.1"],
  },
  "openai-compatible": {
    name: "openai-compatible",
    kind: "api",
    description: "Endpoint compatível com a API da OpenAI.",
    tokenStrategy: "Use endpoint compatível para modelos terceiros sem mudar o contrato da CLI.",
    envKeys: ["OPENAI_COMPATIBLE_API_KEY", "OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_MODEL"],
    modelEnvKey: "OPENAI_COMPATIBLE_MODEL",
    suggestedModels: ["gpt-4.1", "claude-sonnet-4-6", "gemini-2.5-pro"],
  },
  opencode: {
    name: "opencode",
    kind: "cli",
    description: "OpenCode CLI como executor externo do prompt do squad.",
    tokenStrategy: "Reaproveite arquivo de prompt e artefatos locais para reduzir contexto duplicado.",
    envKeys: [],
    modelEnvKey: "OPENCODE_MODEL",
    suggestedModels: ["provider-default"],
  },
  codex: {
    name: "codex",
    kind: "cli",
    description: "Codex CLI como executor externo do prompt do squad.",
    tokenStrategy: "Delegue apenas o estagio ativo e mantenha o contexto nos artefatos locais.",
    envKeys: ["CODEX_COMMAND_TEMPLATE"],
    modelEnvKey: "CODEX_MODEL",
    suggestedModels: ["gpt-5.4", "o3", "gpt-4.1"],
  },
  claude: {
    name: "claude",
    kind: "cli",
    description: "Claude Code ou runner equivalente via comando externo.",
    tokenStrategy: "Use task breakdown e memoria curta para reduzir releitura de historico.",
    envKeys: ["CLAUDE_COMMAND_TEMPLATE"],
    modelEnvKey: "CLAUDE_MODEL",
    suggestedModels: ["sonnet", "opus", "claude-sonnet-4-6"],
  },
  gemini: {
    name: "gemini",
    kind: "cli",
    description: "Gemini CLI ou runner equivalente via comando externo.",
    tokenStrategy: "Mantenha foco no estagio atual e use Gemini Imagen apenas para imagens reais.",
    envKeys: ["GEMINI_COMMAND_TEMPLATE"],
    modelEnvKey: "GEMINI_MODEL",
    suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
};

export const PROVIDER_COMMAND_TEMPLATES: Partial<Record<ProviderName, string>> = {
  opencode:
    'opencode run "Execute the attached software-factory prompt file end-to-end. Ask concise questions if blocking ambiguity remains." --dir "{workspace}" --file "{promptFile}"',
  codex: "codex exec -",
  claude: "claude -p",
  gemini: 'gemini -p "{promptFile}"',
};

export function listProviderNames() {
  return Object.keys(PROVIDER_REGISTRY) as ProviderName[];
}
