import type { RetrievalChunk, RunStage, WorkflowArtifactSnapshot } from "../../core/src/index.js";
import type { StageSquadPacket } from "../../squad-runtime/src/index.js";

function tokenize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function scoreText(queryTokens: string[], content: string) {
  const contentTokens = unique(tokenize(content));

  if (contentTokens.length === 0) {
    return 0;
  }

  let score = 0;

  for (const token of queryTokens) {
    if (contentTokens.includes(token)) {
      score += 1;
    }
  }

  return score;
}

const SOURCE_STAGE_WEIGHTS: Partial<Record<RunStage, Partial<Record<RetrievalChunk["source"], number>>>> = {
  prd: {
    workflow: 2.2,
    "workflow-task-file": 0.8,
    "squad-step": 1.4,
    "squad-agent": 1.1,
    runner: 1,
  },
  techspec: {
    workflow: 2.4,
    "workflow-task-file": 1.1,
    "squad-step": 1.5,
    "squad-agent": 1.1,
    runner: 1,
  },
  tasks: {
    workflow: 2.1,
    "workflow-task-file": 1.8,
    "squad-step": 1.6,
    "squad-agent": 1.2,
    runner: 1,
  },
  review: {
    workflow: 2.5,
    "workflow-task-file": 1.5,
    "squad-step": 1.3,
    "squad-agent": 1.1,
    runner: 1,
  },
  autonomy: {
    workflow: 2.3,
    "workflow-task-file": 1,
    "squad-step": 1.2,
    "squad-agent": 1.4,
    runner: 1.2,
  },
  "full-run": {
    workflow: 2.2,
    "workflow-task-file": 1.4,
    "squad-step": 1.8,
    "squad-agent": 1.2,
    runner: 1.1,
  },
};

function phraseBoost(queryTokens: string[], label: string, content: string) {
  const normalizedLabel = label.toLowerCase();
  const normalizedContent = content.toLowerCase();
  let boost = 0;

  for (const token of queryTokens) {
    if (normalizedLabel.includes(token)) {
      boost += 1.5;
      continue;
    }

    if (normalizedContent.includes(token)) {
      boost += 0.25;
    }
  }

  return boost;
}

function scoreChunk(stage: RunStage, queryTokens: string[], chunk: RetrievalChunk) {
  const base = scoreText(queryTokens, `${chunk.label}\n${chunk.content}`);
  if (base === 0) {
    return 0;
  }

  const sourceWeight = SOURCE_STAGE_WEIGHTS[stage]?.[chunk.source] || 1;
  return base * sourceWeight + phraseBoost(queryTokens, chunk.label, chunk.content);
}

function excerpt(content: string, maxChars = 700) {
  const normalized = content.replace(/\r/g, "").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars).trimEnd()}\n...[truncated]`;
}

function buildWorkflowChunks(snapshot: WorkflowArtifactSnapshot): RetrievalChunk[] {
  const chunks: RetrievalChunk[] = [];
  const maybePush = (id: string, source: string, label: string, content: string | null) => {
    if (!content?.trim()) return;
    chunks.push({ id, source, label, score: 0, content: excerpt(content) });
  };

  maybePush("wf-brief", "workflow", "Workflow brief", snapshot.brief);
  maybePush("wf-prd", "workflow", "Current PRD", snapshot.prd);
  maybePush("wf-techspec", "workflow", "Current Tech Spec", snapshot.techspec);
  maybePush("wf-tasks", "workflow", "Current Tasks", snapshot.tasks);
  maybePush("wf-summary", "workflow", "Workflow summary", snapshot.summary);
  maybePush("wf-shared-memory", "workflow", "Shared memory", snapshot.sharedMemory);
  maybePush("wf-task-memory", "workflow", "Task memory", snapshot.taskMemory);
  maybePush("wf-review-meta", "workflow", "Latest review meta", snapshot.latestReviewMeta);
  maybePush("wf-review-summary", "workflow", "Latest review summary", snapshot.latestReviewSummary);

  for (const [index, task] of snapshot.taskFiles.entries()) {
    chunks.push({
      id: `wf-task-file-${index + 1}`,
      source: "workflow-task-file",
      label: task.fileName,
      score: 0,
      content: [task.title, task.content || ""].filter(Boolean).join("\n"),
    });
  }

  return chunks;
}

function buildSquadChunks(packet: StageSquadPacket): RetrievalChunk[] {
  const chunks: RetrievalChunk[] = [];

  for (const step of packet.relevantSteps) {
    chunks.push({
      id: `step-${step.id}`,
      source: "squad-step",
      label: `${step.id}: ${step.name || step.type}`,
      score: 0,
      content: [
        step.name || step.type,
        step.agent ? `agent: ${step.agent}` : "",
        step.activation ? `activation: ${step.activation}` : "",
        step.trigger || "",
      ].filter(Boolean).join(" | "),
    });
  }

  for (const agent of packet.relevantAgents) {
    chunks.push({
      id: `agent-${agent.id}`,
      source: "squad-agent",
      label: `${agent.icon} ${agent.name}`,
      score: 0,
      content: excerpt(
        [
          agent.roleSummary,
          agent.role,
          agent.communicationStyle,
          agent.principles.slice(0, 4).join("; "),
          agent.process.slice(0, 4).join("; "),
        ].filter(Boolean).join("\n"),
        500,
      ),
    });
  }

  for (const [index, line] of packet.runnerSummary.entries()) {
    chunks.push({
      id: `runner-${index + 1}`,
      source: "runner",
      label: `Runner expectation ${index + 1}`,
      score: 0,
      content: line,
    });
  }

  for (const [index, step] of packet.executionPlan.entries()) {
    chunks.push({
      id: `execution-step-${index + 1}`,
      source: "squad-step",
      label: `${step.id}: ${step.name}`,
      score: 0,
      content: [
        step.type,
        step.agentName ? `agent: ${step.agentName}` : "",
        step.activation ? `activation: ${step.activation}` : "",
        step.dependsOn.length ? `depends_on: ${step.dependsOn.join(", ")}` : "",
        step.handoffTo ? `handoff_to: ${step.handoffTo}` : "",
      ].filter(Boolean).join(" | "),
    });
  }

  return chunks;
}

function buildQuery(stage: RunStage, brief: string, packet: StageSquadPacket) {
  return [
    brief,
    stage,
    packet.summary,
    packet.relevantSteps.map((step) => step.name || step.type).join(" "),
    packet.relevantAgents.map((agent) => `${agent.id} ${agent.roleSummary}`).join(" "),
  ].join(" ");
}

export function retrieveStageContext(options: {
  stage: RunStage;
  brief: string;
  workflowSnapshot: WorkflowArtifactSnapshot;
  squadPacket: StageSquadPacket;
  limit?: number;
}) {
  const query = buildQuery(options.stage, options.brief, options.squadPacket);
  const queryTokens = unique(tokenize(query));
  const chunks = [...buildWorkflowChunks(options.workflowSnapshot), ...buildSquadChunks(options.squadPacket)];

  const ranked = chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(options.stage, queryTokens, chunk),
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));

  const limit = options.limit || (options.stage === "review" ? 8 : 6);
  return ranked.slice(0, limit);
}
