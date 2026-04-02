# software-factory-cli

CLI instalavel para rodar o `software-factory` fora deste workspace, com contrato operacional proprio, providers configuraveis, workflows por feature no estilo Compozy e politicas embutidas do squad.

## O que esta CLI faz

- executa o `software-factory` como fluxo CLI-first
- suporta providers dedicados `openai`, `openai-compatible` e `opencode`
- cria estrutura `.software-factory/` no projeto alvo
- cria workflows por feature com `_brief.md`, `_prd.md`, `_techspec.md`, `_tasks.md`, memoria e rounds de review
- guarda runs, prompts, respostas e metadados por execucao
- obriga a politica `Pencil before frontend`
- usa Gemini Imagen para geracao de imagens quando necessario
- endurece prompts antes de enviar ao modelo
- orienta o modelo a perguntar quando existir ambiguidade bloqueante

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

## Configuracao

Edite `.env`:

```env
SF_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4

OPENAI_COMPATIBLE_API_KEY=...
OPENAI_COMPATIBLE_BASE_URL=https://seu-endpoint-openai-compatible/v1
OPENAI_COMPATIBLE_MODEL=...

GEMINI_API_KEY=...
GEMINI_IMAGE_MODEL=imagen-4.0-generate-001
```

Para usar OpenCode como provider principal:

```env
SF_PROVIDER=opencode
```

Para usar um endpoint OpenAI-compatible:

```env
SF_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_API_KEY=...
OPENAI_COMPATIBLE_BASE_URL=https://seu-endpoint-openai-compatible/v1
OPENAI_COMPATIBLE_MODEL=...
```

## Uso rapido

### 1. Inicializar o projeto alvo

```bash
software-factory init --target .
```

### 2. Rodar um run completo

```bash
software-factory run --name onboarding-dashboard --brief "Criar feature de onboarding com dashboard inicial" --workspace .
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
      summary.md
      memory/
        MEMORY.md
        onboarding-dashboard.md
      reviews/
        reviews-123456/
          _meta.md
          summary.md
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
4. publique em repo privado ou GitHub Packages

## Fluxo recomendado de uso

1. `software-factory init --target .`
2. `software-factory doctor`
3. `software-factory run --name <feature> --brief "..."`
4. implementar ou iterar com o provider escolhido
5. `software-factory run --mode review --name <feature> --brief "Revisar a implementacao atual"`
6. `software-factory run --mode autonomy --name <feature> --brief "Consolidar proximo ciclo"`
7. `software-factory publish --repo software-factory-cli --workspace .`

## Estado atual

Esta versao ja compila, testa, gera runs, cria workflows e consegue ser publicada em um repositório privado. O provider `openai` esta pronto; `openai-compatible` depende de um endpoint compatível; `opencode` usa a sintaxe real de `opencode run`.
