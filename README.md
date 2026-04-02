# software-factory-cli

CLI instalavel para rodar o `software-factory` fora deste workspace, com contrato operacional proprio, providers configuraveis, workflows por feature no estilo Compozy e politicas embutidas do squad.

## O que esta CLI faz

- executa o `software-factory` como fluxo CLI-first
- suporta providers dedicados `openai`, `openai-compatible`, `opencode`, `codex`, `claude` e `gemini`
- cria estrutura `.software-factory/` no projeto alvo
- cria workflows por feature com `_brief.md`, `_prd.md`, `_techspec.md`, `_tasks.md`, memoria e rounds de review
- guarda runs, prompts, respostas e metadados por execucao
- obriga a politica `Pencil before frontend`
- usa Gemini Imagen para geracao de imagens quando necessario
- endurece prompts antes de enviar ao modelo
- orienta o modelo a perguntar quando existir ambiguidade bloqueante
- suporta perfis de custo `lite`, `balanced` e `deep` para gastar menos tokens sem perder rastreabilidade

## Politicas operacionais embutidas

- telas e UX devem ser desenhadas no Pencil antes de virarem codigo de site
- frontend nao deve codar tela nova sem `ux-blueprint` ou desenho equivalente
- imagens devem ser geradas por Gemini, nunca por placeholder aleatorio
- prompts sempre passam por camada de melhoria de contexto, restricoes e criterio de qualidade
- em caso de duvida real, o modelo deve perguntar antes de chutar

## Instalacao local

```bash
npm install
npm run build
npm install -g .
```

## Instalacao a partir de repositorio privado no GitHub

Quando este pacote estiver em um repositorio proprio privado, voce pode instalar assim:

```bash
npm install -g git+ssh://git@github.com/Juanblack1/software-factory-cli.git
```

Se preferir GitHub Packages, publique o pacote e instale via `.npmrc` autenticado.

## Instalação via GitHub Packages

O pacote foi preparado para GitHub Packages com o nome:

```text
@juanblack1/software-factory-cli
```

Exemplo de `.npmrc`:

```ini
@juanblack1:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=SEU_TOKEN_COM_write_packages
```

Instalação:

```bash
npm install -g @juanblack1/software-factory-cli
```

## Configuracao

Edite `.env`:

```env
SF_PROVIDER=openai
SF_EFFORT=balanced
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4

OPENAI_COMPATIBLE_API_KEY=...
OPENAI_COMPATIBLE_BASE_URL=https://seu-endpoint-openai-compatible/v1
OPENAI_COMPATIBLE_MODEL=...

GEMINI_API_KEY=...
GEMINI_IMAGE_MODEL=imagen-4.0-generate-001

OPENCODE_COMMAND_TEMPLATE=opencode run "Execute the attached software-factory prompt file end-to-end. Ask concise questions if blocking ambiguity remains." --dir "{workspace}" --file "{promptFile}"
CODEX_COMMAND_TEMPLATE=codex exec < "{promptFile}"
CLAUDE_COMMAND_TEMPLATE=claude -f "{promptFile}"
GEMINI_COMMAND_TEMPLATE=gemini -p "{promptFile}"
```

Para usar OpenCode como provider principal:

```env
SF_PROVIDER=opencode
```

Para usar Codex, Claude ou Gemini por CLI externa:

```env
SF_PROVIDER=codex
# ou claude ou gemini
```

Para usar um endpoint OpenAI-compatible:

```env
SF_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_API_KEY=...
OPENAI_COMPATIBLE_BASE_URL=https://seu-endpoint-openai-compatible/v1
OPENAI_COMPATIBLE_MODEL=...
```

## Perfis de custo

- `lite`: menor consumo de tokens, contexto condensado, tarefas menores e mais objetivas
- `balanced`: padrao recomendado, bom equilibrio entre detalhe e custo
- `deep`: mais profundidade de analise, ainda evitando repeticao inutil

Exemplo:

```bash
software-factory run --name onboarding-dashboard --brief "Criar onboarding" --effort lite
```

## Uso rapido

### 1. Inicializar o projeto alvo

```bash
software-factory init --target .
```

### 2. Rodar um run completo

```bash
software-factory run --name onboarding-dashboard --brief "Criar feature de onboarding com dashboard inicial" --workspace . --effort lite
```

### 2.1. Gerar apenas o PRD

```bash
software-factory create-prd --name onboarding-dashboard --brief "Criar feature de onboarding com dashboard inicial" --workspace .
```

### 2.2. Gerar apenas o Tech Spec

```bash
software-factory create-techspec --name onboarding-dashboard --brief "Detalhar a implementacao do onboarding dashboard" --workspace .
```

### 2.3. Gerar apenas as Tasks

```bash
software-factory create-tasks --name onboarding-dashboard --brief "Quebrar onboarding dashboard em tarefas pequenas e executaveis" --workspace . --effort lite
```

### 3. Revisar ou fechar gate

```bash
software-factory run --mode review --brief "Revisar a implementacao atual do onboarding" --workspace .
```

### 4. Rodar autonomia do proximo ciclo

```bash
software-factory run --mode autonomy --brief "Consolidar proximo ciclo apos a rodada atual" --workspace .
```

### 5. Gerar imagem com Gemini

```bash
software-factory generate-image --prompt "Premium SaaS dashboard hero, clean, modern, pencil-approved layout" --output .software-factory/assets/hero.png
```

### 6. Validar ambiente

```bash
software-factory doctor
```

### 7. Publicar o proprio pacote em repo privado no GitHub

```bash
software-factory publish --repo software-factory-cli --workspace .
```

## Estrutura criada no projeto alvo

```text
.software-factory/
  software-factory.config.json
  POLICIES.md
  runs/
    2026-04-02T130000Z/
      brief.md
      prompt.md
      response.md
      meta.json
  workflows/
    onboarding-dashboard/
      _brief.md
      _prd.md
      _techspec.md
      _tasks.md
      task_01.md
      task_02.md
      summary.md
      memory/
        MEMORY.md
        onboarding-dashboard.md
      reviews/
        reviews-123456/
          _meta.md
          summary.md
          issue_001.md
          issue_002.md
      runs/
        2026-04-02T130000Z/
          response.md
```

## Publicacao privada com boa descricao

Antes de publicar:

1. ajuste `author`, `version` e URL do repositorio em `package.json`
2. use esta descricao detalhada em PT-BR no repositorio:

`CLI instalavel em PT-BR para rodar o Software Factory com workflows por feature, artefatos no estilo PRD/Tech Spec/Tasks/Review, providers OpenAI, OpenAI-compatible e OpenCode, UX Pencil-first antes de frontend, geracao de imagens via Gemini Imagen, memoria de workflow e rounds de review rastreaveis.`

3. rode `npm run check`
4. publique em repo privado com `software-factory publish`
5. para GitHub Packages, configure `.npmrc` com token que tenha `write:packages`

## Fluxo recomendado de uso

1. `software-factory init --target .`
2. `software-factory doctor --provider opencode`
3. `software-factory create-prd --name <feature> --brief "..." --effort lite`
4. `software-factory create-techspec --name <feature> --brief "..." --effort lite`
5. `software-factory create-tasks --name <feature> --brief "..." --effort lite`
6. `software-factory run --name <feature> --brief "..." --provider <provider>`
7. `software-factory run --mode review --name <feature> --brief "Revisar a implementacao atual"`
8. `software-factory run --mode autonomy --name <feature> --brief "Consolidar proximo ciclo"`
9. `software-factory publish --repo software-factory-cli --workspace .`

## Estado atual

Esta versao ja compila, testa, gera runs, cria workflows, task files e rounds de review, e consegue ser publicada em um repositório privado. `openai` sai pronto; `openai-compatible` depende de endpoint compatível; `opencode`, `codex`, `claude` e `gemini` usam templates de comando ajustáveis no `.env`.
