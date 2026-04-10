import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

import { google } from "googleapis";

import { ensureDir } from "./fs-utils.js";

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
];

export interface YouTubePaths {
  rootDir: string;
  clientPath: string;
  tokenPath: string;
}

export interface YouTubeClientConfig {
  clientId: string;
  clientSecret: string;
  redirectPort: number;
  redirectUri: string;
}

export interface YouTubeTokenConfig {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
  expiry_date?: number | null;
}

function toGoogleCredentials(tokens: YouTubeTokenConfig) {
  return {
    access_token: tokens.access_token || undefined,
    refresh_token: tokens.refresh_token || undefined,
    scope: tokens.scope || undefined,
    token_type: tokens.token_type || undefined,
    expiry_date: tokens.expiry_date || undefined,
  };
}

function resolveOpenCommand(url: string) {
  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }

  if (process.platform === "darwin") {
    return { command: "open", args: [url] };
  }

  return { command: "xdg-open", args: [url] };
}

function openExternalUrl(url: string) {
  const { command, args } = resolveOpenCommand(url);

  return new Promise<void>((resolve) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: true,
      shell: false,
    });

    child.on("error", () => resolve());
    child.unref();
    resolve();
  });
}

function parseJson<T>(content: string, filePath: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON invalido em ${filePath}: ${message}`);
  }
}

function cleanNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getYouTubePaths(workspaceDir: string): YouTubePaths {
  const rootDir = path.join(workspaceDir, ".software-factory", "youtube");
  return {
    rootDir,
    clientPath: path.join(rootDir, "oauth-client.json"),
    tokenPath: path.join(rootDir, "oauth-tokens.json"),
  };
}

export function normalizeYouTubePrivacyStatus(value: string | undefined) {
  const normalized = (value || "private").trim().toLowerCase();
  if (normalized === "private" || normalized === "public" || normalized === "unlisted") {
    return normalized;
  }

  throw new Error(`Privacidade invalida para YouTube: ${value}`);
}

export function parseYouTubeTags(value: string | undefined) {
  if (!value?.trim()) {
    return [] as string[];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readStoredClientConfig(paths: YouTubePaths) {
  try {
    const content = await fs.readFile(paths.clientPath, "utf8");
    return parseJson<YouTubeClientConfig>(content, paths.clientPath);
  } catch {
    return null;
  }
}

async function readStoredTokenConfig(paths: YouTubePaths) {
  try {
    const content = await fs.readFile(paths.tokenPath, "utf8");
    return parseJson<YouTubeTokenConfig>(content, paths.tokenPath);
  } catch {
    return null;
  }
}

export async function resolveYouTubeClientConfig(options: {
  workspaceDir: string;
  clientId?: string;
  clientSecret?: string;
  port?: number;
}) {
  const paths = getYouTubePaths(options.workspaceDir);
  const stored = await readStoredClientConfig(paths);
  const redirectPort = options.port || stored?.redirectPort || Number(process.env.YOUTUBE_OAUTH_PORT || 8787);
  const clientId = options.clientId || process.env.YOUTUBE_CLIENT_ID || stored?.clientId;
  const clientSecret = options.clientSecret || process.env.YOUTUBE_CLIENT_SECRET || stored?.clientSecret;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Credenciais do YouTube ausentes. Informe --client-id e --client-secret ou defina YOUTUBE_CLIENT_ID e YOUTUBE_CLIENT_SECRET.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectPort,
    redirectUri: `http://127.0.0.1:${redirectPort}/oauth2callback`,
  } satisfies YouTubeClientConfig;
}

async function persistYouTubeClientConfig(workspaceDir: string, config: YouTubeClientConfig) {
  const paths = getYouTubePaths(workspaceDir);
  await ensureDir(paths.rootDir);
  await fs.writeFile(paths.clientPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return paths.clientPath;
}

async function persistYouTubeTokenConfig(workspaceDir: string, tokenConfig: YouTubeTokenConfig) {
  const paths = getYouTubePaths(workspaceDir);
  await ensureDir(paths.rootDir);
  await fs.writeFile(paths.tokenPath, `${JSON.stringify(tokenConfig, null, 2)}\n`, "utf8");
  return paths.tokenPath;
}

async function waitForOAuthCode(port: number, timeoutMs: number) {
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        reject(new Error(`Timeout aguardando callback OAuth do YouTube em ${timeoutMs}ms.`));
      }
    }, timeoutMs);

    const server = http.createServer((request, response) => {
      try {
        const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");

        if (error) {
          response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
          response.end("<h1>Falha na autorizacao do YouTube.</h1><p>Volte ao terminal para detalhes.</p>");
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            server.close();
            reject(new Error(`Autorizacao do YouTube negada: ${error}`));
          }
          return;
        }

        if (!code) {
          response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
          response.end("<h1>Codigo OAuth ausente.</h1><p>Volte ao terminal e tente novamente.</p>");
          return;
        }

        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<h1>YouTube conectado com sucesso.</h1><p>Voce pode fechar esta aba e voltar ao terminal.</p>");
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          server.close();
          resolve(code);
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          server.close();
          reject(error);
        }
      }
    });

    server.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });

    server.listen(port, "127.0.0.1");
  });
}

function createOAuthClient(config: YouTubeClientConfig) {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

export async function runYouTubeAuthFlow(options: {
  workspaceDir: string;
  clientId?: string;
  clientSecret?: string;
  port?: number;
  openBrowser: boolean;
  timeoutMs?: number;
}) {
  const config = await resolveYouTubeClientConfig(options);
  const oauth2Client = createOAuthClient(config);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: YOUTUBE_SCOPES,
  });

  const clientPath = await persistYouTubeClientConfig(options.workspaceDir, config);
  if (options.openBrowser) {
    await openExternalUrl(authUrl);
  }

  const code = await waitForOAuthCode(config.redirectPort, options.timeoutMs || 180000);
  const tokenResponse = await oauth2Client.getToken(code);
  const previousTokens = await readStoredTokenConfig(getYouTubePaths(options.workspaceDir));
  const tokenConfig: YouTubeTokenConfig = {
    access_token: cleanNullableString(tokenResponse.tokens.access_token),
    refresh_token: cleanNullableString(tokenResponse.tokens.refresh_token) || previousTokens?.refresh_token || null,
    scope: cleanNullableString(tokenResponse.tokens.scope),
    token_type: cleanNullableString(tokenResponse.tokens.token_type),
    expiry_date: typeof tokenResponse.tokens.expiry_date === "number" ? tokenResponse.tokens.expiry_date : null,
  };

  if (!tokenConfig.refresh_token) {
    throw new Error("O OAuth do YouTube foi concluido sem refresh token. Remova o acesso do app no Google e tente novamente.");
  }

  oauth2Client.setCredentials(toGoogleCredentials(tokenConfig));
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const channel = await youtube.channels.list({ part: ["snippet"], mine: true });
  const firstChannel = channel.data.items?.[0] || null;
  const tokenPath = await persistYouTubeTokenConfig(options.workspaceDir, tokenConfig);

  return {
    authUrl,
    clientPath,
    tokenPath,
    redirectUri: config.redirectUri,
    scope: tokenConfig.scope,
    channelId: firstChannel?.id || null,
    channelTitle: firstChannel?.snippet?.title || null,
  };
}

async function createAuthorizedYouTubeClient(options: {
  workspaceDir: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}) {
  const config = await resolveYouTubeClientConfig(options);
  const oauth2Client = createOAuthClient(config);
  const storedTokens = await readStoredTokenConfig(getYouTubePaths(options.workspaceDir));
  const refreshToken = options.refreshToken || process.env.YOUTUBE_REFRESH_TOKEN || storedTokens?.refresh_token;

  if (!refreshToken) {
    throw new Error("Refresh token do YouTube ausente. Rode 'software-factory youtube-auth' primeiro.");
  }

  oauth2Client.setCredentials(
    toGoogleCredentials({
      refresh_token: refreshToken,
      access_token: storedTokens?.access_token || undefined,
      expiry_date: storedTokens?.expiry_date || undefined,
      scope: storedTokens?.scope || undefined,
      token_type: storedTokens?.token_type || undefined,
    }),
  );

  oauth2Client.on("tokens", async (tokens) => {
    const merged: YouTubeTokenConfig = {
      access_token: cleanNullableString(tokens.access_token) || storedTokens?.access_token || null,
      refresh_token: cleanNullableString(tokens.refresh_token) || refreshToken,
      scope: cleanNullableString(tokens.scope) || storedTokens?.scope || null,
      token_type: cleanNullableString(tokens.token_type) || storedTokens?.token_type || null,
      expiry_date: typeof tokens.expiry_date === "number" ? tokens.expiry_date : storedTokens?.expiry_date || null,
    };
    await persistYouTubeTokenConfig(options.workspaceDir, merged);
  });

  return {
    youtube: google.youtube({ version: "v3", auth: oauth2Client }),
    oauth2Client,
  };
}

export async function uploadVideoToYouTube(options: {
  workspaceDir: string;
  filePath: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus: "private" | "public" | "unlisted";
  playlistId?: string;
  thumbnailPath?: string;
  publishAt?: string;
  categoryId?: string;
  madeForKids?: boolean;
  notifySubscribers?: boolean;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}) {
  const absoluteFilePath = path.resolve(options.filePath);
  await fs.access(absoluteFilePath);

  const absoluteThumbnailPath = options.thumbnailPath ? path.resolve(options.thumbnailPath) : null;
  if (absoluteThumbnailPath) {
    await fs.access(absoluteThumbnailPath);
  }

  const { youtube } = await createAuthorizedYouTubeClient({
    workspaceDir: options.workspaceDir,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    refreshToken: options.refreshToken,
  });

  const publishAt = cleanNullableString(options.publishAt);
  const videoResponse = await youtube.videos.insert({
    part: ["snippet", "status"],
    notifySubscribers: options.notifySubscribers ?? false,
    requestBody: {
      snippet: {
        title: options.title,
        description: options.description || "",
        tags: options.tags?.length ? options.tags : undefined,
        categoryId: options.categoryId || undefined,
      },
      status: {
        privacyStatus: options.privacyStatus,
        publishAt: publishAt || undefined,
        selfDeclaredMadeForKids: options.madeForKids,
      },
    },
    media: {
      body: createReadStream(absoluteFilePath),
    },
  });

  const videoId = videoResponse.data.id;
  if (!videoId) {
    throw new Error("A API do YouTube nao retornou o ID do video enviado.");
  }

  if (absoluteThumbnailPath) {
    await youtube.thumbnails.set({
      videoId,
      media: {
        body: createReadStream(absoluteThumbnailPath),
      },
    });
  }

  if (options.playlistId) {
    await youtube.playlistItems.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          playlistId: options.playlistId,
          resourceId: {
            kind: "youtube#video",
            videoId,
          },
        },
      },
    });
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    privacyStatus: options.privacyStatus,
    publishAt,
    playlistId: options.playlistId || null,
    thumbnailPath: absoluteThumbnailPath,
    filePath: absoluteFilePath,
  };
}
