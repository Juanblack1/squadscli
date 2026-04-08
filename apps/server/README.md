# @software-factory/server

Servidor HTTP inicial do `software-factory 2.0`.

Endpoints iniciais:

- `GET /health`
- `GET /providers?workspaceDir=...`
- `GET /models?workspaceDir=...&provider=...`
- `POST /runs/dry-run`
- `POST /video/plan/dry-run`
- `POST /video/package`

Objetivo desta fase:

- expor o runtime atual por HTTP
- manter compatibilidade com a CLI existente
- preparar a transição para uma camada server-first futura
