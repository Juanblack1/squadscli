# @software-factory/squad-runtime

Runtime do squad `software-factory` para o `software-factory 2.0`.

Este pacote concentra:

- carregamento do squad embutido
- parsing de `squad.yaml`
- parsing de `squad-party.csv`
- parsing de agentes `.agent.md`
- parsing do pipeline real
- seleção de steps e agentes por estágio

Objetivo: tirar da CLI a responsabilidade de conhecer diretamente a estrutura do squad.
