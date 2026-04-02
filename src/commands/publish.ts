import { spawn } from "node:child_process";
import path from "node:path";

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: process.env,
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
        reject(new Error(stderr || `${command} falhou com codigo ${code}.`));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

export async function runPublishCommand(options: {
  projectDir: string;
  owner?: string;
  repo: string;
  description: string;
}) {
  const projectDir = path.resolve(options.projectDir);
  const owner = options.owner || (await runCommand("gh", ["api", "user", "--jq", ".login"], projectDir));
  const repoSlug = `${owner}/${options.repo}`;

  await runCommand("git", ["init"], projectDir);
  await runCommand("git", ["add", "."], projectDir);
  await runCommand("git", ["commit", "-m", "chore: bootstrap software factory cli"], projectDir);
  await runCommand(
    "gh",
    ["repo", "create", repoSlug, "--private", "--source", ".", "--remote", "origin", "--push", "--description", options.description],
    projectDir,
  );

  return { repoSlug, url: `https://github.com/${repoSlug}` };
}
