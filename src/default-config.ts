import type { SoftwareFactoryConfig } from "./types.js";

export const DEFAULT_CONFIG: SoftwareFactoryConfig = {
  version: "1.0",
  name: "software-factory",
  outputDir: ".software-factory",
  defaultProvider: "openai",
  defaultEffort: "balanced",
  promptPolicy: {
    askWhenBlocked: true,
    improvePrompts: true,
    requirePencilBeforeFrontend: true,
    useGeminiForImages: true,
  },
};

export const DEFAULT_POLICIES_MD = `# Software Factory Policies

## Mandatory rules

1. Toda tela nova deve ser desenhada primeiro no Pencil ou documentada como fallback explicito.
2. Front-end nao deve implementar interface nova sem blueprint ou desenho aprovado.
3. Sempre que imagens reais forem necessarias, use Gemini Imagen.
4. Prompt deve ser endurecido antes de chamar o modelo: objetivo, contexto minimo, restricoes, evidencias e saida esperada.
5. Se houver duvida bloqueante, pergunte antes de assumir.
6. Review final deve ordenar gaps por severidade pratica.
7. Cada workflow deve manter artefatos separados por feature, com memoria e rounds de review rastreaveis.
`;

export const DEFAULT_FULL_RUN_PROMPT = `# Full Run Mode

Conduza o software-factory de ponta a ponta.

Use exatamente estas secoes de saida:

## Route Decision
## Questions Or Assumptions
## PRD
## Tech Spec
## Task Breakdown
## UX And Design Gate
## Implementation Plan
## Quality And Review Gate
## Final Recommendation
`;

export const DEFAULT_PRD_PROMPT = `# PRD Stage

Gere apenas o PRD consolidado da feature.

Use exatamente estas secoes de saida:

## Route Decision
## Questions Or Assumptions
## PRD
`;

export const DEFAULT_TECHSPEC_PROMPT = `# Tech Spec Stage

Gere apenas o Tech Spec consolidado, assumindo que o PRD ja existe.

Use exatamente estas secoes de saida:

## Inputs Considered
## Questions Or Assumptions
## Tech Spec
`;

export const DEFAULT_TASKS_PROMPT = `# Tasks Stage

Quebre o escopo em tarefas pequenas, independentes, com dependencias e evidencias objetivas.

Use exatamente estas secoes de saida:

## Inputs Considered
## Task Breakdown
## Suggested Execution Order
`;

export const DEFAULT_REVIEW_PROMPT = `# Review Mode

Revise a entrega atual com foco em qualidade, evidencias e severidade.

Use exatamente estas secoes de saida:

## Scope
## Evidence Reviewed
## Findings By Severity
## Accepted Risks
## Gate Recommendation
`;

export const DEFAULT_AUTONOMY_PROMPT = `# Autonomy Mode

Consolide o proximo ciclo do software-factory.

Saida esperada:

## Current Verdict
## Priority Backlog
## Durable Workflow Memory
## Next Cycle Objective
## First Handoff
`;
