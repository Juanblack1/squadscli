#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { runDoctorCommand } from "./commands/doctor.js";
import { runGenerateImageCommand } from "./commands/generate-image.js";
import { runInitCommand } from "./commands/init.js";
import { runModelsCommand } from "./commands/models.js";
import { runPublishCommand } from "./commands/publish.js";
import { runProvidersCommand } from "./commands/providers.js";
import { runSoftwareFactoryCommand } from "./commands/run.js";
import { resolveEffort, resolveProvider } from "./config.js";
import { listProviderNames } from "./provider-registry.js";
import type { RunMode, RunStage } from "./types.js";

function printHelp() {
  console.log(`software-factory

Commands:
  software-factory init [--target path] [--force]
  software-factory run --brief "..." [--name workflow] [--mode full-run|review|autonomy] [--provider ${listProviderNames().join("|")}] [--effort lite|balanced|deep] [--workspace path] [--dry-run]
  software-factory create-prd --brief "..." [--name workflow]
  software-factory create-techspec --brief "..." [--name workflow]
  software-factory create-tasks --brief "..." [--name workflow]
  software-factory providers [--workspace path]
  software-factory models [--provider ${listProviderNames().join("|")}] [--workspace path]
  software-factory generate-image --prompt "..." --output path [--aspect-ratio 16:9]
  software-factory doctor [--workspace path] [--provider ${listProviderNames().join("|")}]
  software-factory publish [--owner login] [--repo nome-do-repo] [--github-packages] [--github-packages-token-env VAR]
`);
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
    console.log(`Software Factory inicializado em ${targetDir}`);
    return;
  }

  if (command === "run" || command === "create-prd" || command === "create-techspec" || command === "create-tasks") {
    const { values } = parseArgs({
      args: rest,
      options: {
        brief: { type: "string" },
        "brief-file": { type: "string" },
        name: { type: "string" },
        mode: { type: "string" },
        provider: { type: "string" },
        effort: { type: "string" },
        model: { type: "string" },
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
      brief,
      workspaceDir,
      mode,
      stage,
      effort,
      model: values.model,
      provider,
      dryRun: Boolean(values["dry-run"]),
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
      repo: values.repo || "software-factory-cli",
      description:
        "CLI instalavel em PT-BR para rodar o Software Factory com workflows por feature, providers OpenAI/OpenAI-compatible/OpenCode, UX Pencil-first, imagens via Gemini e rounds de review rastreaveis.",
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
