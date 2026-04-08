# software-factory 2.0

## Objetivo

Transformar a `software-factory-cli` em um sistema operacional de entrega orientado por agentes, com:

- CLI como interface universal
- runtime real de squad e agentes
- artefatos como fonte da verdade
- multiprovider e multimodelo
- memória incremental
- revisão e release rastreáveis
- camada visual e agent-native opcional

## Arquitetura alvo

```text
software-factory-2.0/
  apps/
    cli/
    server/
    web/
    mcp/
  packages/
    core/
    squad-runtime/
    provider-runtime/
    artifact-engine/
    memory-engine/
    retrieval/
    video-runtime/
    ui-contracts/
  data/
    prompts/
    templates/
    schemas/
  docs/
  skills/
```

## Camadas

### 1. `packages/core`

Contratos puros do sistema.

- tipos compartilhados
- eventos
- schemas de artefatos
- ids de workflow, run e stage
- validação e compatibilidade

### 2. `packages/squad-runtime`

Runtime real do squad.

- carrega `squad.yaml`
- carrega `squad-party.csv`
- carrega `.agent.md`
- transforma stages em steps reais
- faz handoff entre agentes
- resolve ordem e execution mode

### 3. `packages/provider-runtime`

Camada unificada de modelos e providers.

- OpenAI
- OpenAI-compatible
- Codex
- Claude
- OpenCode
- Gemini
- fallback
- timeout
- budget policy
- escolha de modelo

### 4. `packages/artifact-engine`

Fonte da verdade do workflow.

- `_brief.md`
- `_prd.md`
- `_techspec.md`
- `_tasks.md`
- `task_*.md`
- `reviews/*`
- `summary.md`
- `release-decision.md`
- artefatos de vídeo

### 5. `packages/memory-engine`

Memória incremental de execução.

- shared memory
- workflow memory
- task memory
- review memory
- resumo e compressão de contexto
- retenção e limpeza de histórico útil

### 6. `packages/retrieval`

RAG para contexto seletivo.

Indexa:

- arquivos do squad
- agentes
- pipeline
- artifacts do workflow
- docs e código do projeto alvo
- reviews e tasks

### 7. `packages/video-runtime`

Trilha universal de vídeo.

- análise de fonte
- plano de edição
- pacotes por editor
- baseline `ffmpeg`
- legenda, áudio e assets

### 8. `apps/cli`

Interface universal.

- local-first
- scriptável
- compatível com outros apps/agentes
- alias `cli-anything-software-factory`

### 9. `apps/server`

Orquestração remota.

- API HTTP
- jobs
- streaming
- observabilidade
- execução multiusuário

### 10. `apps/web`

Cockpit visual.

- chat operacional
- timeline de workflow
- viewer de artefatos
- revisão e aprovações
- providers/models
- vídeo e release

### 11. `apps/mcp`

Superfície universal para agentes externos.

- tools do `software-factory`
- execução por stage
- leitura de estado e artefatos

## Fluxo de dados

```text
CLI / Web / MCP
       |
       v
provider-runtime + squad-runtime
       |
       v
artifact-engine <-> memory-engine <-> retrieval
       |
       v
workflow state + review state + release state
```

## Tecnologias recomendadas

### Vercel AI SDK

Use em `provider-runtime` e `server`.

Benefícios:

- camada unificada de modelos
- streaming
- tool calling
- menor custo de manutenção ao trocar provider

### Mastra Framework

Use em `server` junto do `squad-runtime`.

Benefícios:

- agentes reais
- workflows stateful
- tools e memória mais naturais

### RAG

Use em `retrieval`.

Benefícios:

- menos tokens
- mais consistência entre estágios
- melhor recuperação de artefatos e contexto de projeto

### assistant-ui

Use em `web`.

Benefícios:

- cockpit visual
- human-in-the-loop
- chat + artifacts + revisão no mesmo lugar

## O que é óbvio

- UI melhora a experiência
- RAG reduz contexto gigante
- um provider runtime unificado facilita troca de modelo
- agentes reais melhoram organização

## O que não é óbvio

- o maior ganho não é a UI, é a separação entre runtime, artifacts e providers
- RAG mal feito piora a qualidade
- agent framework sem artifact-engine forte vira só mais chat
- a CLI deve continuar sendo o núcleo, não um acessório

## Princípios do 2.0

1. Artefatos são a fonte da verdade.
2. Contexto deve ser seletivo, não inflado.
3. Cada agente precisa ter papel claro e output verificável.
4. CLI, Web e MCP usam o mesmo núcleo.
5. Vídeo, software e revisão seguem o mesmo orquestrador.
