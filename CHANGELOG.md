# Changelog

## v0.4.0

- adiciona `packages/provider-runtime`, `packages/squad-runtime` e `packages/retrieval` como camadas reais do `software-factory 2.0`
- adiciona `apps/server` com endpoints de `health`, `providers`, `models`, `workflows`, `artifacts`, `stages` e `retrieval`
- adiciona `apps/mcp` com tools agent-native via `stdio`
- adiciona `apps/web` como cockpit inicial para operar o server visualmente
- adiciona comandos de conveniencia `serve`, `mcp` e `web` pela propria CLI
- endurece o pacote para distribuicao com `build:all` e inclusao de `apps/` e `docs/`

## v0.3.0

- adiciona fluxo universal de edicao de video com `video-plan` e `video-package`
- gera plano de edicao, guia de importacao, metadata de origem, checklist de assets e baseline `ffmpeg`
- suporta pacote de importacao para `generic`, `capcut`, `premiere`, `davinci`, `shotcut`, `kdenlive` e `final-cut`
- reforca a CLI como orquestrador universal para tarefas de software e midia

## v0.2.0

- adiciona carregamento real do squad `software-factory` embutido na CLI
- conecta estagios a artefatos anteriores do workflow (`_brief`, `_prd`, `_techspec`, `_tasks`, memoria e reviews)
- melhora task breakdown com `task_*.md` mais estruturados
- melhora review rounds com parser mais tolerante e `issue_*.md`
- adiciona memoria incremental para continuidade entre rodadas
- adiciona `providers` e `models` para escolha clara de provider e modelo
- adiciona suporte explicito a `--model` em providers API e CLI suportados
- adiciona alias `cli-anything-software-factory` para uso agent-native em outros aplicativos
- adiciona `skills/SKILL.md` para descoberta por agentes
