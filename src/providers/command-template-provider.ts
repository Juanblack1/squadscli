import { spawn } from "node:child_process";
import path from "node:path";

import { PROVIDER_COMMAND_TEMPLATES } from "../provider-registry.js";
import type { PromptBundle, ProviderAdapter, ProviderName, ProviderResult, RunRequest } from "../types.js";

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

export class CommandTemplateProvider implements ProviderAdapter {
  constructor(public name: ProviderName) {}

  async invoke(_prompt: PromptBundle, request: RunRequest): Promise<ProviderResult> {
    const promptFile = path.join(request.stateDir, "runs", "current", "prompt.md");
    const template = resolveTemplate(this.name);

    if (!template) {
      throw new Error(`Template de comando nao definido para provider ${this.name}.`);
    }

    const rendered = interpolate(template, {
      promptFile,
      workspace: request.workspaceDir,
      stage: request.stage,
      workflow: request.name,
    });

    return await new Promise<ProviderResult>((resolve, reject) => {
      const child = spawn(rendered, {
        cwd: request.workspaceDir,
        env: buildProviderEnv(this.name),
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `${this.name} falhou com codigo ${code}.`));
          return;
        }

        const text = stdout.trim() || stderr.trim();

        if (!text) {
          reject(new Error(`${this.name} nao retornou saida util.`));
          return;
        }

        resolve({
          text,
          raw: { stdout, stderr, code, promptFile, template: rendered },
        });
      });
    });
  }
}
