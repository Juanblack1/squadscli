# Changelog

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
