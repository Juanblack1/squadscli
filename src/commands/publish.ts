import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function runCommand(command: string, args: string[], options: string | { cwd: string; extraEnv?: Record<string, string> }) {
  return new Promise<string>((resolve, reject) => {
    const resolved = typeof options === "string" ? { cwd: options, extraEnv: {} } : options;
    const child = spawn(command, args, {
      cwd: resolved.cwd,
      shell: false,
      env: { ...process.env, ...resolved.extraEnv },
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
  githubPackages?: boolean;
}) {
  const projectDir = path.resolve(options.projectDir);
  const owner = options.owner || (await runCommand("gh", ["api", "user", "--jq", ".login"], projectDir));
  const repoSlug = `${owner}/${options.repo}`;
  const gitDir = path.join(projectDir, ".git");

  try {
    await fs.access(gitDir);
  } catch {
    await runCommand("git", ["init"], projectDir);
  }

  await runCommand("git", ["add", "."], projectDir);

  try {
    await runCommand("git", ["commit", "-m", "chore: update software factory cli"], projectDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("nothing to commit")) {
      throw error;
    }
  }

  let repoExists = true;

  try {
    await runCommand("gh", ["repo", "view", repoSlug], projectDir);
  } catch {
    repoExists = false;
  }

  if (!repoExists) {
    await runCommand(
      "gh",
      ["repo", "create", repoSlug, "--private", "--source", ".", "--remote", "origin", "--push", "--description", options.description],
      projectDir,
    );
  } else {
    try {
      await runCommand("git", ["remote", "add", "origin", `https://github.com/${repoSlug}.git`], projectDir);
    } catch {
      // remote already exists
    }

    await runCommand("git", ["push", "-u", "origin", "HEAD"], projectDir);
  }

  let packagePublished = false;
  let packagePublishError: string | null = null;

  if (options.githubPackages) {
    try {
      const token = await runCommand("gh", ["auth", "token"], projectDir);
      await runCommand("npm", ["publish", "--registry", "https://npm.pkg.github.com"], projectDirWithEnv(projectDir, {
        NODE_AUTH_TOKEN: token,
      }));
      packagePublished = true;
    } catch (error) {
      packagePublishError = error instanceof Error ? error.message : String(error);
    }
  }

  return { repoSlug, url: `https://github.com/${repoSlug}`, packagePublished, packagePublishError };
}

function projectDirWithEnv(cwd: string, extraEnv: Record<string, string>) {
  return { cwd, extraEnv };
}
