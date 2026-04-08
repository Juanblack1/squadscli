import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import type { PromptBundle, ProviderAdapter, ProviderName, ProviderResult, RunRequest } from "../../../core/src/index.js";
import { PROVIDER_COMMAND_TEMPLATES } from "../provider-registry.js";
import { buildFallbackOrder, detectBinary } from "../provider-utils.js";

function interpolate(template: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (output, [key, value]) => output.replaceAll(`{${key}}`, value),
    template,
  );
}

function resolveTemplate(name: ProviderName) {
  const envTemplateKey = `${name.toUpperCase().replaceAll("-", "_")}_COMMAND_TEMPLATE`;
  return process.env[envTemplateKey] || PROVIDER_COMMAND_TEMPLATES[name];
}

function buildProviderEnv(name: ProviderName) {
  const env = { ...process.env } as Record<string, string | undefined>;

  if (name === "opencode") {
    for (const key of Object.keys(env)) {
      if (key === "OPENCODE" || key.startsWith("OPENCODE_")) {
        delete env[key];
      }
    }
  }

  return env;
}

function shouldFallback(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();

  return (
    normalized.includes("session not found") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("failed")
  );
}

async function runTemplateProvider(name: ProviderName, template: string, request: RunRequest): Promise<ProviderResult> {
  const promptFile = path.join(request.stateDir, "runs", "current", "prompt.md");
  const selectedModel = request.model || process.env[`${name.toUpperCase().replaceAll("-", "_")}_MODEL`] || "";

  if (name === "codex") {
    const promptText = await fs.readFile(promptFile, "utf8");

    return await new Promise<ProviderResult>((resolve, reject) => {
      const args = ["exec"];
      if (selectedModel) args.push("--model", selectedModel);
      args.push("-");

      const child = spawn("codex", args, {
        cwd: request.workspaceDir,
        env: buildProviderEnv(name),
        shell: false,
      });

      let stdout = "";
      let stderr = "";
      const timeoutMs = Number(process.env.SF_PROVIDER_TIMEOUT_MS || 180000);
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`${name} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      child.stdin.write(promptText);
      child.stdin.end();
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) return reject(new Error(stderr || `${name} falhou com codigo ${code}.`));
        const text = stdout.trim() || stderr.trim();
        if (!text) return reject(new Error(`${name} nao retornou saida util.`));
        resolve({ text, raw: { stdout, stderr, code, promptFile, provider: name, mode: "stdin" } });
      });
    });
  }

  if (name === "claude") {
    const promptText = await fs.readFile(promptFile, "utf8");

    return await new Promise<ProviderResult>((resolve, reject) => {
      const args = ["-p"];
      if (selectedModel) args.push("--model", selectedModel);

      const child = spawn("claude", args, {
        cwd: request.workspaceDir,
        env: buildProviderEnv(name),
        shell: false,
      });

      let stdout = "";
      let stderr = "";
      const timeoutMs = Number(process.env.SF_PROVIDER_TIMEOUT_MS || 180000);
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`${name} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      child.stdin.write(promptText);
      child.stdin.end();
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (error) => { clearTimeout(timeout); reject(error); });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) return reject(new Error(stderr || `${name} falhou com codigo ${code}.`));
        const text = stdout.trim() || stderr.trim();
        if (!text) return reject(new Error(`${name} nao retornou saida util.`));
        resolve({ text, raw: { stdout, stderr, code, promptFile, provider: name, mode: "stdin" } });
      });
    });
  }

  const rendered = interpolate(template, {
    promptFile,
    workspace: request.workspaceDir,
    stage: request.stage,
    workflow: request.name,
    model: selectedModel,
  });

  return await new Promise<ProviderResult>((resolve, reject) => {
    const child = spawn(rendered, {
      cwd: request.workspaceDir,
      env: buildProviderEnv(name),
      shell: true,
    });

    let stdout = "";
    let stderr = "";
    const timeoutMs = Number(process.env.SF_PROVIDER_TIMEOUT_MS || 180000);
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${name} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error(stderr || `${name} falhou com codigo ${code}.`));
      const text = stdout.trim() || stderr.trim();
      if (!text) return reject(new Error(`${name} nao retornou saida util.`));
      resolve({ text, raw: { stdout, stderr, code, promptFile, template: rendered, provider: name } });
    });
  });
}

export class CommandTemplateProvider implements ProviderAdapter {
  constructor(public name: ProviderName) {}

  async invoke(_prompt: PromptBundle, request: RunRequest): Promise<ProviderResult> {
    const template = resolveTemplate(this.name);
    if (!template) throw new Error(`Template de comando nao definido para provider ${this.name}.`);

    try {
      return await runTemplateProvider(this.name, template, request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!shouldFallback(message)) throw error;

      for (const fallbackName of buildFallbackOrder(this.name)) {
        const fallbackTemplate = resolveTemplate(fallbackName) ?? null;
        const fallbackBinary = detectBinary(fallbackTemplate);
        if (!fallbackTemplate || !fallbackBinary?.available) continue;

        try {
          const fallbackResult = await runTemplateProvider(fallbackName, fallbackTemplate, request);
          return {
            ...fallbackResult,
            raw: {
              ...(typeof fallbackResult.raw === "object" && fallbackResult.raw ? fallbackResult.raw : {}),
              fallbackFrom: this.name,
              fallbackReason: message,
            },
          };
        } catch {
          // Try next fallback provider.
        }
      }

      throw error;
    }
  }
}
