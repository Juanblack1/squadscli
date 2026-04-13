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

export interface ArtifactRef {
  type: string;
  path: string;
  exists: boolean;
}

export interface WorkflowState {
  workflowName: string;
  currentStage: RunStage;
  lastRunId: string | null;
  artifacts: ArtifactRef[];
  updatedAt: string;
  execution?: WorkflowExecutionState | null;
}

export interface WorkflowExecutionStep {
  id: string;
  name: string;
  type: string;
  agentId: string | null;
  agentName: string | null;
  dependsOn: string[];
  activation?: string | null;
  trigger?: string | null;
  handoffTo?: string | null;
  status: "planned" | "completed" | "failed";
}

export interface WorkflowExecutionState {
  runId: string;
  workflowName: string;
  mode: RunMode;
  stage: RunStage;
  status: "dry-run" | "running" | "completed" | "failed";
  effort: EffortLevel;
  provider: ProviderName;
  model?: string | null;
  updatedAt: string;
  nextAction: string | null;
  sharedMemoryExcerpt?: string | null;
  taskMemoryExcerpt?: string | null;
  steps: WorkflowExecutionStep[];
}

export interface RunRequest {
  name: string;
  brief: string;
  mode: RunMode;
  stage: RunStage;
  effort: EffortLevel;
  model?: string;
  workspaceDir: string;
  stateDir: string;
  provider: ProviderName;
  dryRun: boolean;
}

export interface RunResult {
  runId: string;
  workflowName: string;
  stage: RunStage;
  provider: ProviderName;
  model?: string | null;
  artifacts?: ArtifactRef[];
  execution?: WorkflowExecutionState;
}

export interface ProviderProfile {
  name: ProviderName;
  kind: "api" | "cli";
  description: string;
  tokenStrategy: string;
  envKeys: string[];
  modelEnvKey?: string;
  suggestedModels?: string[];
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

export interface WorkflowArtifactSnapshot {
  workflowName: string;
  brief: string | null;
  prd: string | null;
  techspec: string | null;
  tasks: string | null;
  summary: string | null;
  sharedMemory: string | null;
  taskMemory: string | null;
  latestReviewMeta: string | null;
  latestReviewSummary: string | null;
  taskFiles: Array<{
    fileName: string;
    title: string;
    content: string | null;
  }>;
}

export interface ReviewIssue {
  severity: string;
  file: string;
  line: string;
  title: string;
  recommendation: string;
}

export interface RetrievalChunk {
  id: string;
  source: string;
  label: string;
  score: number;
  content: string;
}

export interface TaskCard {
  title: string;
  owner: string;
  domain: string;
  complexity: string;
  dependencies: string[];
  deliverables: string[];
  evidence: string[];
  notes: string;
}
