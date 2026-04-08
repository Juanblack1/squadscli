# software-factory-cli

🚀 Orquestrador do **Software Factory 2.0** para terminal, API, MCP e cockpit web.

Este projeto transforma o squad `software-factory` em um sistema operacional de entrega com:

- 🧠 runtime real do squad e dos agentes
- ⚙️ multiprovider e multimodelo
- 📁 artifacts como fonte da verdade (`PRD`, `Tech Spec`, `Tasks`, `Review`, memória)
- 🔎 retrieval seletivo para reduzir tokens e melhorar consistência
- 🛰️ server HTTP para integrações
- 🤖 MCP para clientes agent-native
- 🖥️ cockpit web inicial
- 🎬 workflow universal de vídeo para qualquer editor

## O que ele faz

- executa o squad `software-factory` por CLI
- gera `PRD`, `Tech Spec`, `Tasks` e `Review` por workflow
- mantém memória incremental por feature
- escolhe `provider` e `model` explicitamente por comando
- expõe `providers`, `models`, `doctor` e `retrieval`
- publica e instala como pacote privado
- planeja edição de vídeo e gera pacote para vários editores

## Superfícies disponíveis

### 1. CLI

- `software-factory`
- alias compatível com ambientes agent-native: `cli-anything-software-factory`

### 2. Server HTTP

Suba com:

```bash
software-factory serve
```

Endpoints atuais:

- `GET /health`
- `GET /providers`
- `GET /models`
- `GET /workflows`
- `GET /workflows/:name`
- `GET /artifacts/:name`
- `POST /runs/dry-run`
- `POST /stages/:stage/dry-run`
- `POST /stages/:stage/run`
- `POST /retrieval/dry-run`
- `POST /video/plan/dry-run`
- `POST /video/package`

### 3. MCP

Suba com:

```bash
software-factory mcp
```

Tools atuais:

- `software_factory.providers`
- `software_factory.models`
- `software_factory.run_dry`
- `software_factory.stage_dry`
- `software_factory.retrieval_dry`
- `software_factory.video_plan_dry`
- `software_factory.video_package`

### 4. Web

Suba o server e depois:

```bash
software-factory web
```

Abra:

```text
http://127.0.0.1:4173
```

O cockpit inicial mostra:

- health do server
- providers
- models
- workflows

## 🧠 Agentes do squad e especialidades

### Liderança e produto

- `🧭 JuanBlack`: liderança de fluxo, gates, aprovações e roteamento
- `📌 Otavio Objetivo`: descoberta, clarificação do problema e PRD
- `🧭 Sergio Sprint`: backlog executável, ordem de entrega e handoffs
- `✨ Mila Melhorias`: melhoria contínua e memória durável do workflow

### Pesquisa e contexto

- `🔎 Explorer Atlas`: pesquisa multimodal e contexto externo
- `💡 Iris Inovacao`: benchmark e elevação de barra
- `✍️ Paula Prompt`: prompts fortes, enxutos e reutilizáveis

### UX, arquitetura e especificação

- `🧩 Yasmin UX`: jornada, interface, microcopy e Pencil-first
- `🏗️ Sid Sistematico`: system design e topologia do sistema
- `🧠 Tadeu Tech`: tech spec, contratos e decisões técnicas

### Engenharia e entrega

- `🔌 Mica MCP`: skills, MCPs e integrações
- `🗄️ Davi Dados`: dados, schema, migrações e acesso
- `⚙️ Bruno Backend`: APIs, regras e domínio
- `🖥️ Fernanda Frontend`: fluxos, telas e experiência final
- `☁️ Ivo Infra`: ambientes, observabilidade e base operacional
- `🚀 Diego Deploy`: rollout, monitoramento e rollback
- `🌿 Guto GitHub`: branch, commit, PR e trilha de release
- `▲ Vera Vercel`: publicação final e smoke de entrega

### Qualidade, risco e revisão

- `🔐 Caio Cyber`: segurança, auth e mitigação
- `🧪 Tito Testes`: testes e smoke técnico
- `🧐 Aline Avalia`: aderência a PRD, UX, segurança e testes
- `✅ Quirino Qualidade`: critérios de aceite e regressão
- `🗣️ Livia Linguistica`: português do Brasil para produto
- `⚡ Pericles Performance`: gargalos e otimização
- `🧪 Clara Qualidade`: consolidação final de evidências
- `🧐 Rita Revisa`: revisão final de coerência e risco

## Regras operacionais do squad

- `🎨 Pencil first`: mudanças visuais relevantes passam pelo Pencil antes do frontend
- `🖼️ Gemini for images`: imagens reais usam Gemini Imagen
- `💬 Ask when blocked`: dúvida crítica pede pergunta curta, não chute
- `💸 Token discipline`: `lite` reduz contexto e força tarefas menores

## Instalação

### Local

```bash
npm install
npm run build:all
npm install -g .
```

### GitHub Packages

`.npmrc`:

```ini
@juanblack1:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=SEU_TOKEN
```

Instalação:

```bash
npm install -g @juanblack1/software-factory-cli
```

### Repositório privado

```bash
npm install -g git+ssh://git@github.com/Juanblack1/software-factory-cli.git
```

## Configuração

Exemplo de `.env`:

```env
SF_PROVIDER=openai
SF_EFFORT=balanced
SF_MODEL=

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4

OPENAI_COMPATIBLE_API_KEY=
OPENAI_COMPATIBLE_BASE_URL=
OPENAI_COMPATIBLE_MODEL=

GEMINI_API_KEY=
GEMINI_IMAGE_MODEL=imagen-4.0-generate-001

OPENCODE_COMMAND_TEMPLATE=opencode run "Execute the attached software-factory prompt file end-to-end. Ask concise questions if blocking ambiguity remains." --dir "{workspace}" --file "{promptFile}"
OPENCODE_MODEL=

CODEX_COMMAND_TEMPLATE=codex exec -
CODEX_MODEL=

CLAUDE_COMMAND_TEMPLATE=claude -p
CLAUDE_MODEL=

GEMINI_COMMAND_TEMPLATE=gemini -p "{promptFile}"
GEMINI_MODEL=
```

## Providers e modelos

Ver providers detectados:

```bash
software-factory providers
```

Ver modelos ativos e sugeridos:

```bash
software-factory models
software-factory models --provider codex
```

Executar com provider/model explícitos:

```bash
software-factory create-prd --name onboarding --brief "Criar onboarding" --provider openai --model gpt-5.4
software-factory run --name onboarding --brief "Executar fluxo completo" --provider codex --model gpt-5.4 --effort lite
```

## Fluxo básico

### Inicializar

```bash
software-factory init --target .
```

### Gerar PRD

```bash
software-factory create-prd --name onboarding --brief "Criar onboarding com dashboard inicial"
```

### Gerar Tech Spec

```bash
software-factory create-techspec --name onboarding --brief "Detalhar a implementação do onboarding"
```

### Gerar Tasks

```bash
software-factory create-tasks --name onboarding --brief "Quebrar onboarding em tarefas pequenas" --effort lite
```

### Rodar fluxo completo

```bash
software-factory run --name onboarding --brief "Executar fluxo completo do onboarding" --provider codex --model gpt-5.4 --effort lite
```

### Review

```bash
software-factory run --mode review --name onboarding --brief "Revisar a implementação atual"
```

### Autonomia

```bash
software-factory run --mode autonomy --name onboarding --brief "Consolidar próximo ciclo"
```

## Vídeo universal

Planejar edição de vídeo para qualquer editor:

```bash
software-factory video-plan --name reels-edit --input ./video.mp4 --goal "Criar um reels com cortes rápidos, legenda e foco no gancho inicial" --editor generic --provider codex --model gpt-5.4 --effort lite
```

Gerar pacote para editor:

```bash
software-factory video-package --name reels-edit --input ./video.mp4 --editor premiere
software-factory video-package --name reels-edit --input ./video.mp4 --editor davinci
software-factory video-package --name reels-edit --input ./video.mp4 --editor capcut
```

Editores suportados:

- `generic`
- `capcut`
- `premiere`
- `davinci`
- `shotcut`
- `kdenlive`
- `final-cut`

## Estrutura do workflow

```text
.software-factory/
  workflows/
    onboarding/
      _brief.md
      _prd.md
      _techspec.md
      _tasks.md
      task_01.md
      summary.md
      memory/
        MEMORY.md
        onboarding.md
      reviews/
        reviews-123456/
          summary.md
          issue_001.md
```

## Arquitetura 2.0

Implementado hoje:

- `packages/core`
- `packages/artifact-engine`
- `packages/memory-engine`
- `packages/squad-runtime`
- `packages/provider-runtime`
- `packages/retrieval`
- `apps/server`
- `apps/mcp`
- `apps/web`

Documentação:

- `docs/software-factory-2.0.md`
- `docs/software-factory-2.0-roadmap.md`

## Scripts úteis

```bash
npm run build
npm run build:server
npm run build:mcp
npm run build:all
npm test
npm run check
```

## Publicação

Publicar o próprio pacote e atualizar o repositório:

```bash
software-factory publish --repo software-factory-cli --workspace .
```

Com GitHub Packages:

```bash
set GITHUB_PACKAGES_TOKEN=seu_token
software-factory publish --repo software-factory-cli --workspace . --github-packages
```

## Status

✅ pronto para uso real por CLI  
✅ pronto para uso por HTTP server  
✅ pronto para uso por MCP  
✅ pronto para planejamento universal de vídeo  
✅ pronto para publicação privada e GitHub Packages  

O próximo salto natural é endurecer observabilidade, streaming e cockpit visual mais completo sobre o server atual.
