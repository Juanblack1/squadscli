export type {
  ArtifactRef,
  EffortLevel,
  PromptBundle,
  ProviderAdapter,
  ProviderName,
  ProviderProfile,
  ProviderResult,
  RetrievalChunk,
  ReviewIssue,
  RunMode,
  RunRequest,
  RunResult,
  RunStage,
  TaskCard,
  WorkflowArtifactSnapshot,
  WorkflowState,
} from "../packages/core/src/index.js";

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
  defaultProvider: import("../packages/core/src/index.js").ProviderName;
  defaultEffort: import("../packages/core/src/index.js").EffortLevel;
  promptPolicy: PromptPolicy;
}

export interface WorkflowPaths {
  rootDir: string;
  workflowDir: string;
  memoryDir: string;
  reviewsDir: string;
  currentRunDir: string;
  briefPath: string;
  prdPath: string;
  techspecPath: string;
  tasksPath: string;
  summaryPath: string;
  statePath: string;
  sharedMemoryPath: string;
  taskMemoryPath: string;
}
