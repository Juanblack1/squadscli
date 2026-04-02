import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function resolveExecutable(command: string) {
  if (process.platform === "win32" && command === "npm") {
    return "npm";
  }

  return command;
}

function runCommand(
  command: string,
  args: string[],
  options: string | { cwd: string; extraEnv?: Record<string, string>; shell?: boolean },
) {
  return new Promise<string>((resolve, reject) => {
    const resolved = typeof options === "string" ? { cwd: options, extraEnv: {}, shell: false } : options;
    const child = spawn(resolveExecutable(command), args, {
      cwd: resolved.cwd,
      shell: resolved.shell ?? false,
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
  githubPackagesTokenEnv?: string;
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
      const tokenEnvName = options.githubPackagesTokenEnv || "GITHUB_PACKAGES_TOKEN";
      const tokenFromEnv = process.env[tokenEnvName]?.trim();
      const token = tokenFromEnv || (await runCommand("gh", ["auth", "token"], projectDir)).trim();

      if (!token) {
        throw new Error(
          `Nenhum token disponivel para GitHub Packages. Defina ${tokenEnvName} com escopo write:packages ou autentique o gh com token equivalente.`,
        );
      }

      await runCommand("npm", ["publish", "--registry", "https://npm.pkg.github.com"], projectDirWithEnv(projectDir, {
        NODE_AUTH_TOKEN: token,
      }, true));
      packagePublished = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      packagePublishError = message.includes("403")
        ? `${message}\nDica: use um token dedicado em GITHUB_PACKAGES_TOKEN com escopo write:packages e, se necessario, repo.`
        : message;
    }
  }

  return { repoSlug, url: `https://github.com/${repoSlug}`, packagePublished, packagePublishError };
}

function projectDirWithEnv(cwd: string, extraEnv: Record<string, string>, shell = false) {
  return { cwd, extraEnv, shell };
}
