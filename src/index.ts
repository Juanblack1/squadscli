#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { runDoctorCommand } from "./commands/doctor.js";
import { runConsoleCommand } from "./commands/console.js";
import { runGenerateImageCommand } from "./commands/generate-image.js";
import { runInitCommand } from "./commands/init.js";
import { runModelsCommand } from "./commands/models.js";
import { runPublishCommand } from "./commands/publish.js";
import { runProvidersCommand } from "./commands/providers.js";
import { runSoftwareFactoryCommand } from "./commands/run.js";
import { runVideoPackageCommand } from "./commands/video-package.js";
import { runVideoPlanCommand } from "./commands/video-plan.js";
import { runVideoShortsCommand } from "./commands/video-shorts.js";
import { runYouTubeAuthCommand } from "./commands/youtube-auth.js";
import { runYouTubeUploadCommand } from "./commands/youtube-upload.js";
import { resolveEffort, resolveProvider } from "./config.js";
import { parseSkillSelection } from "./console-utils.js";
import { listProviderNames } from "./provider-registry.js";
import { listAvailableSquads } from "./squad-loader.js";
import type { RunMode, RunStage } from "./types.js";
import { SUPPORTED_VIDEO_EDITORS } from "./video-utils.js";

function printHelp() {
  console.log(`squadscli

Commands:
  squadscli init [--target path] [--force]
  squadscli console [--workspace path]
  squadscli desktop [--workspace path]
  squadscli squads [--workspace path]
  squadscli serve
  squadscli mcp
  squadscli web
  squadscli run --brief "..." [--squad code] [--name workflow] [--mode full-run|review|autonomy] [--provider ${listProviderNames().join("|")}] [--model model] [--skills skill-a,skill-b] [--effort lite|balanced|deep] [--workspace path] [--dry-run]
  squadscli create-prd --brief "..." [--squad code] [--name workflow] [--provider ${listProviderNames().join("|")}] [--model model] [--skills skill-a,skill-b]
  squadscli create-techspec --brief "..." [--squad code] [--name workflow] [--provider ${listProviderNames().join("|")}] [--model model] [--skills skill-a,skill-b]
  squadscli create-tasks --brief "..." [--squad code] [--name workflow] [--provider ${listProviderNames().join("|")}] [--model model] [--skills skill-a,skill-b]
  squadscli video-plan --name workflow --input video.mp4 --goal "..." [--editor ${SUPPORTED_VIDEO_EDITORS.join("|")}] [--provider ${listProviderNames().join("|")}] [--model model]
  squadscli video-package --name workflow --input video.mp4 [--editor ${SUPPORTED_VIDEO_EDITORS.join("|")}]
  squadscli video-shorts --name workflow --input video.mp4 --goal "..." [--transcript-file legendas.vtt] [--count 5] [--min-seconds 20] [--max-seconds 45] [--materialize] [--editor ${SUPPORTED_VIDEO_EDITORS.join("|")}] [--provider ${listProviderNames().join("|")}] [--model model]
  squadscli youtube-auth [--client-id xxx --client-secret yyy] [--port 8787] [--no-open] [--workspace path]
  squadscli youtube-upload --file video.mp4 --title "..." [--description "..."] [--tags tag1,tag2] [--privacy private|unlisted|public] [--thumbnail image.png] [--playlist-id id] [--publish-at 2026-04-10T14:00:00Z]
  squadscli providers [--workspace path]
  squadscli models [--provider ${listProviderNames().join("|")}] [--workspace path]
  squadscli generate-image --prompt "..." --output path [--aspect-ratio 16:9]
  squadscli doctor [--workspace path] [--provider ${listProviderNames().join("|")}]
  squadscli publish [--owner login] [--repo nome-do-repo] [--github-packages] [--github-packages-token-env VAR]
`);
}

function resolvePackageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

async function spawnNodeEntrypoint(relativePath: string) {
  const root = resolvePackageRoot();
  const entrypoint = path.join(root, relativePath);
  try {
    await fs.access(entrypoint);
  } catch {
    throw new Error(`Entrypoint nao encontrado: ${entrypoint}. Rode o build correspondente antes de usar este comando.`);
  }

  const child = spawn(process.execPath, [entrypoint], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0) {
        reject(new Error(`Entrypoint saiu com codigo ${code}.`));
        return;
      }
      resolve();
    });
  });
}

async function spawnDesktopEntrypoint(workspaceDir?: string) {
  const root = resolvePackageRoot();
  const electronBinary = process.platform === "win32"
    ? path.join(root, "node_modules", "electron", "dist", "electron.exe")
    : path.join(root, "node_modules", "electron", "dist", "electron");
  const entrypoint = path.join(root, "apps", "desktop", "main.mjs");

  try {
    await fs.access(electronBinary);
    await fs.access(entrypoint);
  } catch {
    throw new Error("Desktop launcher nao encontrado. Instale as dependencias do desktop e rode o pacote completo.");
  }

  const args = [entrypoint];
  if (workspaceDir) {
    args.push("--workspace", workspaceDir);
  }

  const child = spawn(electronBinary, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0) {
        reject(new Error(`Desktop launcher saiu com codigo ${code}.`));
        return;
      }
      resolve();
    });
  });
}

async function readBrief(flags: { brief?: string; briefFile?: string }) {
  if (flags.brief) {
    return flags.brief;
  }

  if (flags.briefFile) {
    return await fs.readFile(path.resolve(flags.briefFile), "utf8");
  }

  throw new Error("Informe --brief ou --brief-file.");
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "init") {
    const { values } = parseArgs({
      args: rest,
      options: {
        target: { type: "string" },
        force: { type: "boolean" },
      },
      allowPositionals: false,
    });

    const targetDir = path.resolve(values.target || process.cwd());
    await runInitCommand(targetDir, Boolean(values.force));
    console.log(`SquadsCli inicializado em ${targetDir}`);
    return;
  }

  if (command === "squads") {
    const { values } = parseArgs({
      args: rest,
      options: {
        workspace: { type: "string" },
      },
      allowPositionals: false,
    });

    const result = listAvailableSquads(path.resolve(values.workspace || process.cwd()));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "console") {
    const { values } = parseArgs({
      args: rest,
      options: {
        workspace: { type: "string" },
      },
      allowPositionals: false,
    });

    await runConsoleCommand(path.resolve(values.workspace || process.cwd()));
    return;
  }

  if (command === "desktop") {
    const { values } = parseArgs({
      args: rest,
      options: {
        workspace: { type: "string" },
      },
      allowPositionals: false,
    });

    await spawnDesktopEntrypoint(values.workspace ? path.resolve(values.workspace) : undefined);
    return;
  }

  if (command === "serve") {
    await spawnNodeEntrypoint(path.join("apps", "server", "dist", "apps", "server", "src", "index.js"));
    return;
  }

  if (command === "mcp") {
    await spawnNodeEntrypoint(path.join("apps", "mcp", "dist", "apps", "mcp", "src", "index.js"));
    return;
  }

  if (command === "web") {
    await spawnNodeEntrypoint(path.join("apps", "web", "server.mjs"));
    return;
  }

  if (command === "run" || command === "create-prd" || command === "create-techspec" || command === "create-tasks") {
    const { values } = parseArgs({
      args: rest,
      options: {
        brief: { type: "string" },
        "brief-file": { type: "string" },
        squad: { type: "string" },
        name: { type: "string" },
        mode: { type: "string" },
        provider: { type: "string" },
        effort: { type: "string" },
        model: { type: "string" },
        skills: { type: "string" },
        workspace: { type: "string" },
        "dry-run": { type: "boolean" },
      },
      allowPositionals: false,
    });

    const workspaceDir = path.resolve(values.workspace || process.cwd());
    const brief = await readBrief({
      brief: values.brief,
      briefFile: values["brief-file"],
    });
    const mode = (values.mode || "full-run") as RunMode;
    const provider = resolveProvider(values.provider);
    const effort = resolveEffort(values.effort);
    const stageMap: Record<string, RunStage> = {
      run: mode,
      "create-prd": "prd",
      "create-techspec": "techspec",
      "create-tasks": "tasks",
    };
    const stage = stageMap[command];

    const result = await runSoftwareFactoryCommand({
      name: values.name,
      squad: values.squad,
      brief,
      workspaceDir,
      mode,
      stage,
      effort,
        model: values.model,
        provider,
        dryRun: Boolean(values["dry-run"]),
        focusSkills: parseSkillSelection(values.skills),
      });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "generate-image") {
    const { values } = parseArgs({
      args: rest,
      options: {
        prompt: { type: "string" },
        output: { type: "string" },
        workspace: { type: "string" },
        "aspect-ratio": { type: "string" },
        model: { type: "string" },
      },
      allowPositionals: false,
    });

    if (!values.prompt || !values.output) {
      throw new Error("Informe --prompt e --output.");
    }

    const result = await runGenerateImageCommand({
      workspaceDir: path.resolve(values.workspace || process.cwd()),
      prompt: values.prompt,
      outputPath: values.output,
      aspectRatio: values["aspect-ratio"] || "16:9",
      model: values.model,
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "video-plan") {
    const { values } = parseArgs({
      args: rest,
      options: {
        name: { type: "string" },
        input: { type: "string" },
        goal: { type: "string" },
        editor: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        workspace: { type: "string" },
        "dry-run": { type: "boolean" },
      },
      allowPositionals: false,
    });

    if (!values.name || !values.input || !values.goal) {
      throw new Error("Informe --name, --input e --goal.");
    }

    const editor = (values.editor || "generic") as (typeof SUPPORTED_VIDEO_EDITORS)[number];
    if (!SUPPORTED_VIDEO_EDITORS.includes(editor)) {
      throw new Error(`Editor invalido: ${editor}`);
    }

    const result = await runVideoPlanCommand({
      workspaceDir: path.resolve(values.workspace || process.cwd()),
      workflowName: values.name,
      inputPath: values.input,
      goal: values.goal,
      editor,
      provider: resolveProvider(values.provider),
      effort: resolveEffort(values.effort),
      model: values.model,
      dryRun: Boolean(values["dry-run"]),
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "video-package") {
    const { values } = parseArgs({
      args: rest,
      options: {
        name: { type: "string" },
        input: { type: "string" },
        editor: { type: "string" },
        workspace: { type: "string" },
      },
      allowPositionals: false,
    });

    if (!values.name || !values.input) {
      throw new Error("Informe --name e --input.");
    }

    const editor = (values.editor || "generic") as (typeof SUPPORTED_VIDEO_EDITORS)[number];
    if (!SUPPORTED_VIDEO_EDITORS.includes(editor)) {
      throw new Error(`Editor invalido: ${editor}`);
    }

    const result = await runVideoPackageCommand({
      workspaceDir: path.resolve(values.workspace || process.cwd()),
      workflowName: values.name,
      inputPath: values.input,
      editor,
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "video-shorts") {
    const { values } = parseArgs({
      args: rest,
      options: {
        name: { type: "string" },
        input: { type: "string" },
        goal: { type: "string" },
        "transcript-file": { type: "string" },
        editor: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        effort: { type: "string" },
        workspace: { type: "string" },
        count: { type: "string" },
        "min-seconds": { type: "string" },
        "max-seconds": { type: "string" },
        materialize: { type: "boolean" },
        "dry-run": { type: "boolean" },
      },
      allowPositionals: false,
    });

    if (!values.name || !values.input || !values.goal) {
      throw new Error("Informe --name, --input e --goal.");
    }

    const editor = (values.editor || "generic") as (typeof SUPPORTED_VIDEO_EDITORS)[number];
    if (!SUPPORTED_VIDEO_EDITORS.includes(editor)) {
      throw new Error(`Editor invalido: ${editor}`);
    }

    const count = Number(values.count || 5);
    const minSeconds = Number(values["min-seconds"] || 20);
    const maxSeconds = Number(values["max-seconds"] || 45);
    if (!Number.isFinite(count) || count <= 0) {
      throw new Error("Informe um --count valido.");
    }
    if (!Number.isFinite(minSeconds) || !Number.isFinite(maxSeconds) || minSeconds <= 0 || maxSeconds < minSeconds) {
      throw new Error("Informe valores validos para --min-seconds e --max-seconds.");
    }

    const result = await runVideoShortsCommand({
      workspaceDir: path.resolve(values.workspace || process.cwd()),
      workflowName: values.name,
      inputPath: values.input,
      transcriptPath: values["transcript-file"],
      goal: values.goal,
      editor,
      provider: resolveProvider(values.provider),
      effort: resolveEffort(values.effort),
      model: values.model,
      count,
      minDurationSeconds: minSeconds,
      maxDurationSeconds: maxSeconds,
      materialize: Boolean(values.materialize),
      dryRun: Boolean(values["dry-run"]),
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "youtube-auth") {
    const { values } = parseArgs({
      args: rest,
      options: {
        workspace: { type: "string" },
        "client-id": { type: "string" },
        "client-secret": { type: "string" },
        port: { type: "string" },
        "no-open": { type: "boolean" },
      },
      allowPositionals: false,
    });

    const result = await runYouTubeAuthCommand({
      workspaceDir: path.resolve(values.workspace || process.cwd()),
      clientId: values["client-id"],
      clientSecret: values["client-secret"],
      port: values.port ? Number(values.port) : undefined,
      openBrowser: !Boolean(values["no-open"]),
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "youtube-upload") {
    const { values } = parseArgs({
      args: rest,
      options: {
        workspace: { type: "string" },
        file: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        tags: { type: "string" },
        privacy: { type: "string" },
        "playlist-id": { type: "string" },
        thumbnail: { type: "string" },
        "publish-at": { type: "string" },
        "category-id": { type: "string" },
        "made-for-kids": { type: "boolean" },
        "notify-subscribers": { type: "boolean" },
        "client-id": { type: "string" },
        "client-secret": { type: "string" },
        "refresh-token": { type: "string" },
      },
      allowPositionals: false,
    });

    if (!values.file || !values.title) {
      throw new Error("Informe --file e --title.");
    }

    const result = await runYouTubeUploadCommand({
      workspaceDir: path.resolve(values.workspace || process.cwd()),
      filePath: values.file,
      title: values.title,
      description: values.description,
      tags: values.tags,
      privacyStatus: values.privacy,
      playlistId: values["playlist-id"],
      thumbnailPath: values.thumbnail,
      publishAt: values["publish-at"],
      categoryId: values["category-id"],
      madeForKids: Boolean(values["made-for-kids"]),
      notifySubscribers: Boolean(values["notify-subscribers"]),
      clientId: values["client-id"],
      clientSecret: values["client-secret"],
      refreshToken: values["refresh-token"],
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "doctor") {
    const { values } = parseArgs({
      args: rest,
      options: {
        workspace: { type: "string" },
        provider: { type: "string" },
      },
      allowPositionals: false,
    });

    const result = await runDoctorCommand(
      path.resolve(values.workspace || process.cwd()),
      values.provider,
    );

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "providers") {
    const { values } = parseArgs({
      args: rest,
      options: {
        workspace: { type: "string" },
      },
      allowPositionals: false,
    });

    const result = await runProvidersCommand(path.resolve(values.workspace || process.cwd()));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "models") {
    const { values } = parseArgs({
      args: rest,
      options: {
        workspace: { type: "string" },
        provider: { type: "string" },
      },
      allowPositionals: false,
    });

    const provider = values.provider ? resolveProvider(values.provider) : undefined;
    const result = await runModelsCommand(path.resolve(values.workspace || process.cwd()), provider);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "publish") {
    const { values } = parseArgs({
      args: rest,
            options: {
                owner: { type: "string" },
                repo: { type: "string" },
                workspace: { type: "string" },
                "github-packages": { type: "boolean" },
                "github-packages-token-env": { type: "string" },
            },
      allowPositionals: false,
    });

    const result = await runPublishCommand({
      projectDir: path.resolve(values.workspace || process.cwd()),
      owner: values.owner,
      repo: values.repo || "squadscli",
      description:
        "CLI instalavel em PT-BR para rodar squads com workflows por feature, providers OpenAI/OpenAI-compatible/OpenCode, UX Pencil-first, imagens via Gemini e rounds de review rastreaveis.",
      githubPackages: Boolean(values["github-packages"]),
      githubPackagesTokenEnv: values["github-packages-token-env"],
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Comando desconhecido: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
