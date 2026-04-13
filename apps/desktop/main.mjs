import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, ipcMain } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");

let mainWindow = null;
let currentWorkspace = process.cwd();

function stateFilePath() {
  return path.join(app.getPath("userData"), "desktop-state.json");
}

async function loadDesktopState() {
  try {
    const state = JSON.parse(await fs.readFile(stateFilePath(), "utf8"));
    if (typeof state.workspace === "string" && state.workspace.trim()) {
      currentWorkspace = state.workspace;
    }
  } catch {
  }
}

async function saveDesktopState() {
  await fs.mkdir(path.dirname(stateFilePath()), { recursive: true });
  await fs.writeFile(stateFilePath(), `${JSON.stringify({ workspace: currentWorkspace }, null, 2)}\n`, "utf8");
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
  const backend = await getBackend();
  const providers = await backend.runProvidersCommand(workspaceDir);
  const readyProvider = providers.providers.find((provider) => provider.ready)?.provider || providers.defaultProvider;
  const [models, workflows, recentRuns, config] = await Promise.all([
    backend.runModelsCommand(workspaceDir, readyProvider),
    backend.listWorkflowSummaries(workspaceDir),
    backend.listRecentRuns(workspaceDir),
    backend.loadSoftwareFactoryConfig(workspaceDir),
  ]);

  return {
    workspace: workspaceDir,
    defaultProvider: providers.defaultProvider,
    defaultEffort: providers.defaultEffort,
    providers: providers.providers,
    models: models.providers,
    workflows,
    recentRuns,
    outputDir: config.outputDir,
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
    },
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
  currentWorkspace = path.resolve(workspaceDir || currentWorkspace);
  await saveDesktopState();
  return await getWorkspaceSnapshot(currentWorkspace);
});

ipcMain.handle("launcher:doctor", async (_event, payload) => {
  const backend = await getBackend();
  return await backend.runDoctorCommand(payload.workspace, payload.provider);
});

ipcMain.handle("launcher:run", async (_event, payload) => {
  const backend = await getBackend();
  return await backend.runSoftwareFactoryCommand({
    name: payload.workflowName || undefined,
    brief: payload.brief,
    workspaceDir: payload.workspace,
    mode: payload.mode,
    stage: payload.stage,
    effort: payload.effort,
    model: payload.model || undefined,
    provider: payload.provider,
    dryRun: Boolean(payload.dryRun),
    focusSkills: Array.isArray(payload.focusSkills) ? payload.focusSkills : [],
  });
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
