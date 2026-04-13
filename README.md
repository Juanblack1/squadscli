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
- modo REPL estilo terminal com estado de sessão: `software-factory console`

## Instalação simples

### Windows em uma linha

Instala e já abre o console no diretório atual:

```powershell
$env:GITHUB_PACKAGES_TOKEN="SEU_TOKEN"; irm https://raw.githubusercontent.com/Juanblack1/software-factory-cli/master/scripts/install-windows.ps1 | iex
```

Instala sem abrir automaticamente:

```powershell
$env:GITHUB_PACKAGES_TOKEN="SEU_TOKEN"; $tmp="$env:TEMP\sf-install.ps1"; iwr https://raw.githubusercontent.com/Juanblack1/software-factory-cli/master/scripts/install-windows.ps1 -OutFile $tmp; & $tmp -NoLaunch
```

Se preferir baixar e executar um arquivo local, use:

```powershell
scripts\install-windows.cmd
```

Requisitos para o instalador:

- Windows PowerShell
- Node.js 20+
- `GITHUB_PACKAGES_TOKEN` com acesso ao pacote

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
- `POST /video/shorts/dry-run`
- `POST /video/shorts`

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
- `software_factory.video_shorts_dry`
- `software_factory.video_shorts`

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

YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
YOUTUBE_OAUTH_PORT=8787

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
software-factory create-tasks --name onboarding --brief "Quebrar onboarding em tarefas" --provider codex --skills "task-planning,acceptance-gate"
```

## Console TUI

Abra a interface moderna de terminal:

```bash
software-factory console
```

O console agora abre uma TUI estilo CLI moderna com:

- painel de sessão fixo
- feed central de atividade
- painel lateral de contexto
- input interativo no rodapé
- histórico por setas
- atalhos de terminal

Ele mantém uma sessão persistida em `.software-factory/console-session.json` com:

- provider atual
- model atual
- effort atual
- workflow atual
- stage atual
- skills focadas
- modo dry-run/live

Você pode digitar um brief direto para executar com o estado atual da sessão ou usar slash commands:

```text
/help
/status
/providers
/models
/workflows
/history
/skills
/doctor
/provider codex
/model gpt-5.4
/workflow onboarding
/skills set api-design,code-review
/effort lite
/prd Criar onboarding com dashboard inicial
/run Implementar fluxo completo do onboarding
/review Revisar a implementação atual
/reset
/clear
/exit
```

Exemplo de sessão:

```text
/provider claude
/model sonnet
/workflow onboarding
/skills set task-planning,acceptance-gate
Implementar fluxo completo de onboarding com foco em conversão
```

Atalhos da TUI:

- `Tab`: alterna o painel direito
- `Up/Down`: navega no histórico do input
- `Esc`: limpa o input atual
- `Ctrl+L`: limpa o feed visual

As `skills` escolhidas por `--skills` ou `/skills set ...` entram no prompt como foco operacional da rodada, sem sobrescrever o pacote padrão do squad.

## MCP em Codex e Claude

Registrar no Codex:

```bash
codex mcp add software-factory -- "%APPDATA%\npm\software-factory.cmd" mcp
```

Registrar no Claude Code:

```bash
claude mcp add -s user software-factory -- "%APPDATA%\npm\software-factory.cmd" mcp
```

Validar:

```bash
codex mcp get software-factory
claude mcp get software-factory
```

Depois disso, o `software-factory` fica disponível como servidor MCP global nas duas CLIs.

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

Tambem aceita URL do YouTube como fonte. O CLI usa `yt-dlp` para baixar o video e reaproveitar legendas quando houver:

```bash
software-factory video-plan --name youtube-reels --input "https://www.youtube.com/watch?v=VIDEO_ID" --goal "Planejar cortes para conteudo curto com foco em retencao" --editor capcut --provider codex --model gpt-5.4 --effort lite
```

Gerar pacote para editor:

```bash
software-factory video-package --name reels-edit --input ./video.mp4 --editor premiere
software-factory video-package --name reels-edit --input ./video.mp4 --editor davinci
software-factory video-package --name reels-edit --input ./video.mp4 --editor capcut
```

Gerar highlights e transformar em shorts com manifesto + script `ffmpeg`:

```bash
software-factory video-shorts --name youtube-shorts --input "https://www.youtube.com/watch?v=VIDEO_ID" --goal "Separar os melhores momentos em shorts independentes" --count 5 --min-seconds 20 --max-seconds 45 --editor generic --provider codex --model gpt-5.4
```

Para renderizar automaticamente os cortes base com `ffmpeg`, adicione `--materialize`:

```bash
software-factory video-shorts --name youtube-shorts --input "https://www.youtube.com/watch?v=VIDEO_ID" --goal "Separar os melhores momentos em shorts independentes" --count 5 --materialize --editor generic --provider codex --model gpt-5.4
```

Se o video for local e voce ja tiver transcript/legenda, informe `--transcript-file` (`.txt`, `.srt` ou `.vtt`) para a IA localizar os highlights com mais precisao.

### Conectar e publicar no YouTube

Primeiro conecte a conta com OAuth 2.0. O CLI abre o navegador, recebe o callback local e salva as credenciais em `.software-factory/youtube/`.

```bash
software-factory youtube-auth --client-id SEU_CLIENT_ID --client-secret SEU_CLIENT_SECRET
```

Depois publique qualquer video finalizado:

```bash
software-factory youtube-upload --file ./.software-factory/workflows/youtube-shorts/video/shorts/generic/rendered/01-gancho-inicial.mp4 --title "Meu short" --description "Descricao do video" --tags shorts,youtube,clips --privacy unlisted
```

Com thumbnail, playlist e agendamento:

```bash
software-factory youtube-upload --file ./dist/short.mp4 --title "Meu short" --description "Descricao do video" --thumbnail ./thumb.png --playlist-id PLAYLIST_ID --privacy private --publish-at 2026-04-12T15:00:00Z
```

Notas:

- `youtube-auth` tambem aceita `YOUTUBE_CLIENT_ID` e `YOUTUBE_CLIENT_SECRET` via `.env`
- `youtube-upload` reutiliza o refresh token salvo localmente ou `YOUTUBE_REFRESH_TOKEN`
- para playlist e operacoes mais amplas, o CLI pede os escopos `youtube.upload` e `youtube`
- para baixar videos do YouTube continua sendo necessario ter `yt-dlp` no `PATH`
- para renderizar shorts automaticamente continua sendo necessario ter `ffmpeg` no `PATH`

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
