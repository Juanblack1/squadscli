export type RunMode = "full-run" | "review" | "autonomy";

export type RunStage = "full-run" | "prd" | "techspec" | "tasks" | "review" | "autonomy";

export type EffortLevel = "lite" | "balanced" | "deep";

export type ProviderName =
  | "openai"
  | "openai-compatible"
  | "opencode"
  | "codex"
  | "claude"
  | "gemini";

export interface PromptPolicy {
  askWhenBlocked: boolean;
  improvePrompts: boolean;
  requirePencilBeforeFrontend: boolean;
  useGeminiForImages: boolean;
}

export interface SoftwareFactoryConfig {
  version: string;
  name: string;
  outputDir: string;
  defaultProvider: ProviderName;
  defaultEffort: EffortLevel;
  promptPolicy: PromptPolicy;
}

export interface RunRequest {
  name: string;
  brief: string;
  mode: RunMode;
  stage: RunStage;
  effort: EffortLevel;
  workspaceDir: string;
  stateDir: string;
  provider: ProviderName;
  dryRun: boolean;
}

export interface PromptBundle {
  system: string;
  user: string;
}

export interface ProviderResult {
  text: string;
  raw?: unknown;
}

export interface ProviderAdapter {
  name: ProviderName;
  invoke(prompt: PromptBundle, request: RunRequest): Promise<ProviderResult>;
}

export interface ProviderProfile {
  name: ProviderName;
  kind: "api" | "cli";
  description: string;
  tokenStrategy: string;
  envKeys: string[];
}

export interface WorkflowPaths {
  rootDir: string;
  workflowDir: string;
  memoryDir: string;
  reviewsDir: string;
  currentRunDir: string;
  prdPath: string;
  techspecPath: string;
  tasksPath: string;
  summaryPath: string;
  sharedMemoryPath: string;
  taskMemoryPath: string;
}
