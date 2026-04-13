import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");

let mainWindow = null;
let currentWorkspace = process.cwd();
let desktopSession = {
  provider: "",
  model: "",
  stage: "full-run",
  effort: "balanced",
  workflowName: "",
  dryRun: false,
  focusSkills: [],
  brief: "",
};

const workspaceSchema = z.string().trim().min(1).max(4096);
const doctorPayloadSchema = z.object({
  workspace: workspaceSchema,
  provider: z.string().trim().min(1).max(64),
});
const runPayloadSchema = z.object({
  workspace: workspaceSchema,
  provider: z.string().trim().min(1).max(64),
  model: z.string().max(200).optional().nullable(),
  stage: z.enum(["full-run", "prd", "techspec", "tasks", "review", "autonomy"]),
  mode: z.enum(["full-run", "review", "autonomy"]),
  effort: z.enum(["lite", "balanced", "deep"]),
  workflowName: z.string().max(120).optional().nullable(),
  dryRun: z.boolean().optional(),
  brief: z.string().trim().min(1).max(30000),
  focusSkills: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});
const sessionSchema = z.object({
  provider: z.string().max(64).optional(),
  model: z.string().max(200).optional().nullable(),
  stage: z.enum(["full-run", "prd", "techspec", "tasks", "review", "autonomy"]).optional(),
  effort: z.enum(["lite", "balanced", "deep"]).optional(),
  workflowName: z.string().max(120).optional().nullable(),
  dryRun: z.boolean().optional(),
  focusSkills: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  brief: z.string().max(30000).optional(),
});

function stateFilePath() {
  return path.join(app.getPath("userData"), "desktop-state.json");
}

async function loadDesktopState() {
  try {
    const state = JSON.parse(await fs.readFile(stateFilePath(), "utf8"));
    if (typeof state.workspace === "string" && state.workspace.trim()) {
      currentWorkspace = state.workspace;
    }
    if (state.session && typeof state.session === "object") {
      const parsed = sessionSchema.safeParse(state.session);
      if (parsed.success) {
        desktopSession = {
          ...desktopSession,
          ...parsed.data,
          focusSkills: parsed.data.focusSkills || [],
        };
      }
    }
  } catch {
  }
}

async function saveDesktopState() {
  await fs.mkdir(path.dirname(stateFilePath()), { recursive: true });
  await fs.writeFile(
    stateFilePath(),
    `${JSON.stringify({ workspace: currentWorkspace, session: desktopSession }, null, 2)}\n`,
    "utf8",
  );
}

async function ensureWorkspaceDir(workspaceDir) {
  const resolved = path.resolve(workspaceSchema.parse(workspaceDir));
  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Workspace invalido: ${resolved}`);
  }
  return resolved;
}

function resolveWorkspaceArg() {
  const direct = process.argv.find((value) => value.startsWith("--workspace="));
  if (direct) {
    return direct.slice("--workspace=".length);
  }

  const index = process.argv.findIndex((value) => value === "--workspace");
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return null;
}

let backendPromise = null;

async function getBackend() {
  if (!backendPromise) {
    backendPromise = Promise.all([
      import(pathToFileURL(path.join(rootDir, "dist", "src", "commands", "providers.js")).href),
      import(pathToFileURL(path.join(rootDir, "dist", "src", "commands", "models.js")).href),
      import(pathToFileURL(path.join(rootDir, "dist", "src", "commands", "doctor.js")).href),
      import(pathToFileURL(path.join(rootDir, "dist", "src", "commands", "run.js")).href),
      import(pathToFileURL(path.join(rootDir, "dist", "src", "console-utils.js")).href),
      import(pathToFileURL(path.join(rootDir, "dist", "src", "config.js")).href),
    ]).then(([providersMod, modelsMod, doctorMod, runMod, consoleUtilsMod, configMod]) => ({
      runProvidersCommand: providersMod.runProvidersCommand,
      runModelsCommand: modelsMod.runModelsCommand,
      runDoctorCommand: doctorMod.runDoctorCommand,
      runSoftwareFactoryCommand: runMod.runSoftwareFactoryCommand,
      listWorkflowSummaries: consoleUtilsMod.listWorkflowSummaries,
      listRecentRuns: consoleUtilsMod.listRecentRuns,
      loadSoftwareFactoryConfig: configMod.loadSoftwareFactoryConfig,
    }));
  }

  return await backendPromise;
}

async function getWorkspaceSnapshot(workspaceDir) {
  const safeWorkspaceDir = await ensureWorkspaceDir(workspaceDir);
  const backend = await getBackend();
  const providers = await backend.runProvidersCommand(safeWorkspaceDir);
  const readyProvider = providers.providers.find((provider) => provider.ready)?.provider || providers.defaultProvider;
  const [models, workflows, recentRuns, config] = await Promise.all([
    backend.runModelsCommand(safeWorkspaceDir, readyProvider),
    backend.listWorkflowSummaries(safeWorkspaceDir),
    backend.listRecentRuns(safeWorkspaceDir),
    backend.loadSoftwareFactoryConfig(safeWorkspaceDir),
  ]);

  return {
    workspace: safeWorkspaceDir,
    defaultProvider: providers.defaultProvider,
    defaultEffort: providers.defaultEffort,
    providers: providers.providers,
    models: models.providers,
    workflows,
    recentRuns,
    outputDir: config.outputDir,
    session: desktopSession,
  };
}

async function createWindow() {
  await loadDesktopState();

  const workspaceArg = resolveWorkspaceArg();
  if (workspaceArg) {
    currentWorkspace = path.resolve(workspaceArg);
  }

  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1240,
    minHeight: 760,
    title: "Software Factory Desktop",
    autoHideMenuBar: true,
    backgroundColor: "#070b16",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
    }
  });

  await mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
}

ipcMain.handle("launcher:get-bootstrap", async () => {
  return await getWorkspaceSnapshot(currentWorkspace);
});

ipcMain.handle("launcher:choose-folder", async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Escolha a pasta do workspace",
    properties: ["openDirectory"],
    defaultPath: currentWorkspace,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  currentWorkspace = result.filePaths[0];
  await saveDesktopState();
  return await getWorkspaceSnapshot(currentWorkspace);
});

ipcMain.handle("launcher:refresh-workspace", async (_event, workspaceDir) => {
  currentWorkspace = await ensureWorkspaceDir(workspaceDir || currentWorkspace);
  await saveDesktopState();
  return await getWorkspaceSnapshot(currentWorkspace);
});

ipcMain.handle("launcher:doctor", async (_event, payload) => {
  const parsed = doctorPayloadSchema.parse(payload);
  const backend = await getBackend();
  return await backend.runDoctorCommand(await ensureWorkspaceDir(parsed.workspace), parsed.provider);
});

ipcMain.handle("launcher:run", async (_event, payload) => {
  const parsed = runPayloadSchema.parse(payload);
  const backend = await getBackend();
  const workspaceDir = await ensureWorkspaceDir(parsed.workspace);
  return await backend.runSoftwareFactoryCommand({
    name: parsed.workflowName || undefined,
    brief: parsed.brief,
    workspaceDir,
    mode: parsed.mode,
    stage: parsed.stage,
    effort: parsed.effort,
    model: parsed.model || undefined,
    provider: parsed.provider,
    dryRun: Boolean(parsed.dryRun),
    focusSkills: parsed.focusSkills || [],
  });
});

ipcMain.handle("launcher:save-session", async (_event, payload) => {
  const parsed = sessionSchema.parse(payload || {});
  desktopSession = {
    ...desktopSession,
    ...parsed,
    focusSkills: parsed.focusSkills || desktopSession.focusSkills || [],
  };
  await saveDesktopState();
  return { ok: true };
});

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
