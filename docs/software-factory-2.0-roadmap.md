# Roadmap do software-factory 2.0

## Fase 1

- consolidar `core`
- consolidar `artifact-engine`
- consolidar `memory-engine`
- manter compatibilidade com a CLI atual

## Fase 2

- extrair `squad-runtime`
- fazer handoff real entre agentes
- persistir estado do workflow por execução

## Fase 3

- extrair `provider-runtime`
- centralizar fallback, modelo, timeout e budget policy
- opcionalmente migrar para Vercel AI SDK

## Fase 4

- criar `apps/server`
- adicionar execução remota e streaming
- expor artifacts, runs e reviews por API

## Fase 5

- criar `packages/retrieval`
- indexar squad, artifacts, docs e código
- recuperar contexto por stage e agente

## Fase 6

- criar `apps/web`
- usar assistant-ui para cockpit operacional
- suportar aprovações, revisão e release

## Fase 7

- criar `apps/mcp`
- expor o sistema como tools agent-native
- integrar melhor com ambientes estilo CLI-Anything

## Fase 8

- endurecer vídeo, mídia e automações universais
- adicionar templates por editor e render profiles
- integrar melhor com pipelines de assets
