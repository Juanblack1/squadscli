import { spawn } from "node:child_process";
import path from "node:path";

import type { PromptBundle, ProviderAdapter, ProviderResult, RunRequest } from "../types.js";

export class OpenCodeProvider implements ProviderAdapter {
  name = "opencode" as const;

  async invoke(_prompt: PromptBundle, request: RunRequest): Promise<ProviderResult> {
    const promptFile = path.join(request.stateDir, "runs", "current", "prompt.md");
    const args = [
      "run",
      "--dir",
      request.workspaceDir,
      "--file",
      promptFile,
      "Execute the attached software-factory prompt file end-to-end. Ask concise questions if blocking ambiguity remains.",
    ];

    return await new Promise<ProviderResult>((resolve, reject) => {
      const child = spawn("opencode", args, {
        cwd: request.workspaceDir,
        env: process.env,
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
          reject(new Error(stderr || `OpenCode falhou com codigo ${code}.`));
          return;
        }

        const text = stdout.trim() || stderr.trim();

        if (!text) {
          reject(new Error("OpenCode nao retornou saida util."));
          return;
        }

        resolve({ text, raw: { stdout, stderr, code, promptFile } });
      });
    });
  }
}
