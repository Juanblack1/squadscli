# @software-factory/retrieval

Camada inicial de retrieval do `software-factory 2.0`.

Nesta fase, o retrieval é local-first e seletivo:

- indexa artefatos do workflow
- indexa contexto relevante do squad por estágio
- aplica ranking simples por sobreposição de termos
- devolve poucos chunks úteis para reduzir tokens

Objetivo: preparar a base para um RAG mais forte sem depender ainda de infraestrutura externa.
