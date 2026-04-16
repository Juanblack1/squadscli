const storageKeys = ["squadscli-desktop-session-history", "software-factory-desktop-session-history"];

const workspaceName = document.getElementById("workspace-name");
const workspacePath = document.getElementById("workspace-path");
const readyCount = document.getElementById("ready-count");
const defaultProvider = document.getElementById("default-provider");
const workflowCount = document.getElementById("workflow-count");
const runCount = document.getElementById("run-count");
const providerSelect = document.getElementById("provider-select");
const modelSelect = document.getElementById("model-select");
const squadSelect = document.getElementById("squad-select");
const stageSelect = document.getElementById("stage-select");
const effortSelect = document.getElementById("effort-select");
const workflowInput = document.getElementById("workflow-input");
const skillsInput = document.getElementById("skills-input");
const dryRunInput = document.getElementById("dry-run-input");
const chooseFolderButton = document.getElementById("choose-folder");
const refreshWorkspaceButton = document.getElementById("refresh-workspace");
const runDoctorButton = document.getElementById("run-doctor");
const runButton = document.getElementById("run-button");
const briefInput = document.getElementById("brief-input");
const feed = document.getElementById("feed");
const statusBadge = document.getElementById("status-badge");
const viewContent = document.getElementById("view-content");
const viewTitle = document.getElementById("view-title");
const viewKicker = document.getElementById("view-kicker");
const threadTitle = document.getElementById("thread-title");
const navButtons = Array.from(document.querySelectorAll(".nav-pill"));
const sidebarSessions = document.getElementById("sidebar-sessions");
const inspectorProviders = document.getElementById("inspector-providers");
const inspectorWorkflows = document.getElementById("inspector-workflows");
const inspectorMemory = document.getElementById("inspector-memory");

let snapshot = null;
let currentView = "home";
let sessionHistory = loadSessionHistory();
const desktopApi = window.softwareFactoryDesktop;

function loadSessionHistory() {
  for (const key of storageKeys) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(value)) {
        return value;
      }
    } catch {
    }
  }

  return [];
}

function persistSessionHistory() {
  localStorage.setItem(storageKeys[0], JSON.stringify(sessionHistory.slice(0, 24)));
}

function recordSession(entry) {
  sessionHistory = [entry, ...sessionHistory.filter((item) => item.id !== entry.id)].slice(0, 24);
  persistSessionHistory();
  if (snapshot) {
    renderSidebar();
    renderInspector();
    renderView();
  }
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (typeof text === "string") element.textContent = text;
  return element;
}

function appendFeed(kind, title, body) {
  const article = createElement("article", `feed-card ${kind}`);
  article.appendChild(createElement("h3", "", title));
  const pre = createElement("pre", "", typeof body === "string" ? body : JSON.stringify(body, null, 2));
  article.appendChild(pre);
  feed.prepend(article);
}

function setStatus(label, kind) {
  statusBadge.textContent = label;
  statusBadge.className = `meta-chip ${kind}`;
}

function parseSkillInput(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function summarizeExecution(execution) {
  if (!execution) return "sem plano persistido";
  const handoffs = execution.steps.filter((step) => step.handoffTo).length;
  return `${execution.status} · ${execution.steps.length} steps · ${handoffs} handoffs`;
}

function summarizeNextAction(execution, fallback = "sem proximo passo") {
  return execution?.nextAction || fallback;
}

function getComposerState() {
  return {
    squad: squadSelect.value,
    provider: providerSelect.value,
    model: modelSelect.value,
    stage: stageSelect.value,
    effort: effortSelect.value,
    workflowName: workflowInput.value.trim(),
    dryRun: dryRunInput.checked,
    focusSkills: parseSkillInput(skillsInput.value),
    brief: briefInput.value,
  };
}

async function persistComposerState() {
  try {
    await window.softwareFactoryDesktop.saveSession(getComposerState());
  } catch {
  }
}

function createStreamCard(title, subtitle, meta, action) {
  const button = createElement("button", "stream-card");
  button.type = "button";
  button.appendChild(createElement("strong", "", title));
  button.appendChild(createElement("span", "", subtitle || ""));
  button.appendChild(createElement("small", "", meta || ""));
  if (action) button.addEventListener("click", action);
  return button;
}

function createSidebarItem(title, meta, action, active = false) {
  const button = createElement("button", `sidebar-item${active ? " active" : ""}`);
  button.type = "button";
  button.appendChild(createElement("strong", "", title));
  button.appendChild(createElement("span", "", meta));
  if (action) button.addEventListener("click", action);
  return button;
}

function createInspectorCard(title, subtitle, meta, action) {
  const card = createElement("button", "inspector-card");
  card.type = "button";
  card.appendChild(createElement("strong", "", title));
  card.appendChild(createElement("span", "", subtitle || ""));
  card.appendChild(createElement("small", "", meta || ""));
  if (action) card.addEventListener("click", action);
  return card;
}

function setComposerFromRun(run) {
  if (run.squad && Array.from(squadSelect.options).some((option) => option.value === run.squad)) {
    squadSelect.value = run.squad;
  }
  providerSelect.value = run.provider || snapshot.defaultProvider;
  renderModels();
  modelSelect.value = run.model || "";
  stageSelect.value = run.stage || "full-run";
  effortSelect.value = run.effort || snapshot.defaultEffort;
  workflowInput.value = run.workflowName || "";
  skillsInput.value = Array.isArray(run.focusSkills) ? run.focusSkills.join(", ") : "";
  dryRunInput.checked = Boolean(run.dryRun);
  briefInput.value = typeof run.brief === "string" ? run.brief : "";
  void persistComposerState();
}

function renderSidebar() {
  sidebarSessions.innerHTML = "";

  if (!sessionHistory.length) {
    sidebarSessions.appendChild(createElement("div", "sidebar-empty", "Nenhuma sessão local ainda."));
    return;
  }

  sessionHistory.slice(0, 8).forEach((entry) => {
    sidebarSessions.appendChild(
      createSidebarItem(
        entry.workflowName || "nova sessão",
        `${entry.provider} · ${entry.stage} · ${compactDate(entry.timestamp)}`,
        () => {
          setComposerFromRun(entry);
          appendFeed("system", "Sessão restaurada", entry.workflowName || "nova sessão");
        },
      ),
    );
  });
}

function renderInspector() {
  inspectorProviders.innerHTML = "";
  inspectorWorkflows.innerHTML = "";
  inspectorMemory.innerHTML = "";

  snapshot.providers.slice(0, 4).forEach((provider) => {
    inspectorProviders.appendChild(
      createInspectorCard(
        provider.provider,
        provider.ready ? "ready" : "not ready",
        provider.activeModel || provider.kind,
        () => {
          providerSelect.value = provider.provider;
          renderModels();
          appendFeed("system", "Provider selecionado", provider.provider);
        },
      ),
    );
  });

  if (!snapshot.workflows.length) {
    inspectorWorkflows.appendChild(createElement("div", "inspector-empty", "Nenhum workflow ainda."));
  } else {
    snapshot.workflows.slice(0, 5).forEach((workflow) => {
      inspectorWorkflows.appendChild(
        createInspectorCard(
          workflow.workflowName,
          `stage ${workflow.currentStage}`,
          summarizeNextAction(workflow.execution, compactDate(workflow.updatedAt)),
          () => {
            workflowInput.value = workflow.workflowName;
            stageSelect.value = workflow.currentStage;
            appendFeed("system", "Workflow carregado", workflow.workflowName);
            void persistComposerState();
          },
        ),
      );
    });
  }

  const memorySource = snapshot.workflows.find((workflow) => workflow.execution?.taskMemoryExcerpt || workflow.execution?.sharedMemoryExcerpt);
  if (!memorySource) {
    inspectorMemory.appendChild(createElement("div", "inspector-empty", "Sem memória consolidada ainda."));
  } else {
    inspectorMemory.appendChild(
      createInspectorCard(
        memorySource.workflowName,
        summarizeExecution(memorySource.execution),
        memorySource.execution?.taskMemoryExcerpt || memorySource.execution?.sharedMemoryExcerpt || "",
        () => {
          workflowInput.value = memorySource.workflowName;
          appendFeed("system", "Memory + handoffs", memorySource.execution?.taskMemoryExcerpt || memorySource.execution?.sharedMemoryExcerpt || "");
          void persistComposerState();
        },
      ),
    );
  }
}

function renderHomeView() {
  const wrapper = createElement("div", "stream-stack");

  const intro = createElement("section", "stream-block intro-block");
  intro.appendChild(createElement("p", "mini-label", "workspace ready"));
  intro.appendChild(createElement("h3", "", "Escolha um provider e rode do centro da interface"));
  intro.appendChild(createElement("p", "block-copy", "A coluna central funciona como uma superfície única de execução. A lateral esquerda concentra histórico e a direita mostra contexto operacional e memória."));
  wrapper.appendChild(intro);

  const providers = createElement("div", "stream-grid two");
  const readyProviders = snapshot.providers.filter((provider) => provider.ready).slice(0, 2);
  if (!readyProviders.length) {
    providers.appendChild(createElement("div", "stream-empty", "Nenhum provider pronto neste workspace."));
  } else {
    readyProviders.forEach((provider) => {
      providers.appendChild(
        createStreamCard(
          provider.provider,
          provider.description,
          provider.activeModel || provider.kind,
          () => {
            providerSelect.value = provider.provider;
            renderModels();
            appendFeed("system", "Provider selecionado", provider.provider);
          },
        ),
      );
    });
  }
  wrapper.appendChild(providers);

  const flows = createElement("section", "stream-block");
  const flowsHeader = createElement("div", "section-inline");
  flowsHeader.appendChild(createElement("h3", "", "Workflows recentes"));
  flowsHeader.appendChild(createElement("span", "mini-note", "atalhos"));
  flows.appendChild(flowsHeader);
  const flowGrid = createElement("div", "stream-grid two");
  const workflowItems = snapshot.workflows.slice(0, 4);
  if (!workflowItems.length) {
    flowGrid.appendChild(createElement("div", "stream-empty", "Nenhum workflow salvo ainda."));
  } else {
    workflowItems.forEach((workflow) => {
      flowGrid.appendChild(
        createStreamCard(
          workflow.workflowName,
          `stage ${workflow.currentStage}`,
          `${summarizeNextAction(workflow.execution, compactDate(workflow.updatedAt))}${workflow.updatedAt ? `\n${compactDate(workflow.updatedAt)}` : ""}`,
          () => {
            workflowInput.value = workflow.workflowName;
            stageSelect.value = workflow.currentStage;
            appendFeed("system", "Workflow selecionado", workflow.workflowName);
            void persistComposerState();
          },
        ),
      );
    });
  }
  flows.appendChild(flowGrid);
  wrapper.appendChild(flows);

  return wrapper;
}

function renderProvidersView() {
  const grid = createElement("div", "stream-grid two");
  snapshot.providers.forEach((provider) => {
    const status = provider.ready ? "ready" : "not ready";
    grid.appendChild(
      createStreamCard(
        provider.provider,
        provider.description,
        `${status} · ${provider.kind}\n${provider.activeModel || "provider-default"}`,
        () => {
          providerSelect.value = provider.provider;
          renderModels();
          appendFeed("system", "Provider selecionado", provider.provider);
        },
      ),
    );
  });
  return grid;
}

function renderWorkflowsView() {
  const grid = createElement("div", "stream-grid two");
  if (!snapshot.workflows.length) {
    grid.appendChild(createElement("div", "stream-empty", "Nenhum workflow encontrado neste workspace."));
    return grid;
  }
  snapshot.workflows.forEach((workflow) => {
    grid.appendChild(
      createStreamCard(
        workflow.workflowName,
        `stage ${workflow.currentStage}`,
        `${summarizeExecution(workflow.execution)}\n${summarizeNextAction(workflow.execution, "abrir workflow")}`,
        () => {
          workflowInput.value = workflow.workflowName;
          stageSelect.value = workflow.currentStage;
          appendFeed("system", "Workflow carregado", workflow.workflowName);
          void persistComposerState();
        },
      ),
    );
  });
  return grid;
}

function renderRunsView() {
  const grid = createElement("div", "stream-grid two");
  if (!snapshot.recentRuns.length) {
    grid.appendChild(createElement("div", "stream-empty", "Nenhum run recente neste workspace."));
    return grid;
  }
  snapshot.recentRuns.forEach((run) => {
    grid.appendChild(
      createStreamCard(
        run.workflowName,
        `${run.stage} · ${run.provider}`,
        `${summarizeExecution(run.execution)}\n${compactDate(run.updatedAt)}`,
        () => {
          setComposerFromRun(run);
          appendFeed("system", "Run carregado no composer", run.runId || run.workflowName);
        },
      ),
    );
  });
  return grid;
}

function renderMemoryView() {
  const grid = createElement("div", "stream-grid two");
  const items = snapshot.workflows.filter((workflow) => workflow.execution?.sharedMemoryExcerpt || workflow.execution?.taskMemoryExcerpt);
  if (!items.length) {
    grid.appendChild(createElement("div", "stream-empty", "Nenhuma memória consolidada ainda nos workflows."));
    return grid;
  }
  items.forEach((workflow) => {
    const excerpt = workflow.execution?.taskMemoryExcerpt || workflow.execution?.sharedMemoryExcerpt || "";
    grid.appendChild(
      createStreamCard(
        workflow.workflowName,
        workflow.execution?.nextAction || "memória do workflow",
        `${summarizeExecution(workflow.execution)}\n${excerpt}`,
        () => {
          workflowInput.value = workflow.workflowName;
          appendFeed("system", "Memória do workflow", excerpt);
          void persistComposerState();
        },
      ),
    );
  });
  return grid;
}

function renderSessionsView() {
  const grid = createElement("div", "stream-grid two");
  if (!sessionHistory.length) {
    grid.appendChild(createElement("div", "stream-empty", "Nenhuma sessão local ainda. Rode algo para começar."));
    return grid;
  }
  sessionHistory.forEach((entry) => {
    grid.appendChild(
      createStreamCard(
        entry.workflowName || "nova sessão",
        `${entry.stage} · ${entry.provider}`,
        `${entry.workspace}\n${compactDate(entry.timestamp)}`,
        () => {
          setComposerFromRun(entry);
          appendFeed("system", "Sessão restaurada", entry.workflowName || "nova sessão");
        },
      ),
    );
  });
  return grid;
}

function renderView() {
  if (!snapshot) return;
  viewContent.innerHTML = "";

  const views = {
    home: { kicker: "home", title: "Visão geral", thread: "Workspace pronto", node: renderHomeView() },
    providers: { kicker: "providers", title: "Providers disponíveis", thread: "Escolha o executor da rodada", node: renderProvidersView() },
    workflows: { kicker: "workflows", title: "Workflows salvos", thread: "Reabra e continue qualquer fluxo", node: renderWorkflowsView() },
    runs: { kicker: "runs", title: "Runs do workspace", thread: "Resultados recentes e recuperação rápida", node: renderRunsView() },
    memory: { kicker: "memory", title: "Memória e handoffs", thread: "Estado durável e próximo passo", node: renderMemoryView() },
    sessions: { kicker: "sessions", title: "Histórico local de sessões", thread: "Restauração do composer", node: renderSessionsView() },
  };

  const selected = views[currentView] || views.home;
  viewKicker.textContent = selected.kicker;
  viewTitle.textContent = selected.title;
  threadTitle.textContent = selected.thread;
  viewContent.appendChild(selected.node);

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === currentView);
  });
}

function renderProviders() {
  providerSelect.innerHTML = "";
  snapshot.providers.forEach((provider) => {
    const option = createElement("option", "", `${provider.provider}${provider.ready ? "" : " (not ready)"}`);
    option.value = provider.provider;
    providerSelect.appendChild(option);
  });
  const target = snapshot.session?.provider || snapshot.defaultProvider;
  providerSelect.value = snapshot.providers.some((provider) => provider.provider === target) ? target : snapshot.defaultProvider;
}

function renderSquads() {
  squadSelect.innerHTML = "";
  const squads = Array.isArray(snapshot.squads) ? snapshot.squads : [];

  squads.forEach((squad) => {
    const option = createElement("option", "", `${squad.icon || "🧩"} ${squad.code}`);
    option.value = squad.code;
    squadSelect.appendChild(option);
  });

  const target = snapshot.session?.squad || squads.find((item) => item.code === "software-factory")?.code || squads[0]?.code || "software-factory";
  if (Array.from(squadSelect.options).some((option) => option.value === target)) {
    squadSelect.value = target;
  }
}

function renderModels() {
  modelSelect.innerHTML = "";
  const providerBlock = snapshot.models.find((provider) => provider.provider === providerSelect.value) || snapshot.models[0];
  const auto = createElement("option", "", "auto");
  auto.value = "";
  modelSelect.appendChild(auto);
  const values = new Set([providerBlock?.activeModel, ...(providerBlock?.suggestedModels || [])].filter(Boolean));
  values.forEach((model) => {
    const option = createElement("option", "", model);
    option.value = model;
    modelSelect.appendChild(option);
  });
  const savedModel = snapshot.session?.model || "";
  modelSelect.value = Array.from(modelSelect.options).some((option) => option.value === savedModel) ? savedModel : "";
}

function applySnapshot(nextSnapshot) {
  snapshot = nextSnapshot;
  workspaceName.textContent = nextSnapshot.workspace.split(/[\\/]/).filter(Boolean).pop() || nextSnapshot.workspace;
  workspacePath.textContent = nextSnapshot.workspace;
  readyCount.textContent = String(nextSnapshot.providers.filter((provider) => provider.ready).length);
  defaultProvider.textContent = `default ${nextSnapshot.defaultProvider}`;
  workflowCount.textContent = String(nextSnapshot.workflows.length);
  runCount.textContent = String(nextSnapshot.recentRuns.length + sessionHistory.length);
  effortSelect.value = nextSnapshot.session?.effort || nextSnapshot.defaultEffort;
  renderSquads();
  renderProviders();
  renderModels();
  stageSelect.value = nextSnapshot.session?.stage || "full-run";
  workflowInput.value = nextSnapshot.session?.workflowName || "";
  skillsInput.value = Array.isArray(nextSnapshot.session?.focusSkills) ? nextSnapshot.session.focusSkills.join(", ") : "";
  dryRunInput.checked = Boolean(nextSnapshot.session?.dryRun);
  briefInput.value = nextSnapshot.session?.brief || "";
  renderSidebar();
  renderInspector();
  renderView();
}

async function refreshSnapshot(loader) {
  setStatus("loading", "loading");
  try {
    const nextSnapshot = await loader();
    if (nextSnapshot) {
      applySnapshot(nextSnapshot);
      setStatus("ready", "idle");
    }
  } catch (error) {
    appendFeed("error", "Falha ao carregar workspace", error instanceof Error ? error.message : String(error));
    setStatus("error", "error");
  }
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    renderView();
  });
});

providerSelect.addEventListener("change", () => { renderModels(); void persistComposerState(); renderInspector(); });
squadSelect.addEventListener("change", () => { void persistComposerState(); });
modelSelect.addEventListener("change", () => { void persistComposerState(); });
stageSelect.addEventListener("change", () => { void persistComposerState(); });
effortSelect.addEventListener("change", () => { void persistComposerState(); });
workflowInput.addEventListener("input", () => { void persistComposerState(); });
skillsInput.addEventListener("input", () => { void persistComposerState(); });
dryRunInput.addEventListener("change", () => { void persistComposerState(); });
briefInput.addEventListener("input", () => { void persistComposerState(); });

chooseFolderButton.addEventListener("click", async () => {
  await refreshSnapshot(() => window.softwareFactoryDesktop.chooseFolder());
});

refreshWorkspaceButton.addEventListener("click", async () => {
  if (!snapshot) return;
  await refreshSnapshot(() => window.softwareFactoryDesktop.refreshWorkspace(snapshot.workspace));
});

runDoctorButton.addEventListener("click", async () => {
  if (!snapshot) return;
  setStatus("doctor", "loading");
  try {
    const result = await window.softwareFactoryDesktop.doctor({ workspace: snapshot.workspace, provider: providerSelect.value });
    appendFeed("system", `Doctor ${providerSelect.value}`, result);
    recordSession({
      id: `doctor-${Date.now()}`,
      timestamp: new Date().toISOString(),
      workspace: snapshot.workspace,
      squad: squadSelect.value,
      provider: providerSelect.value,
      stage: "doctor",
      workflowName: workflowInput.value.trim(),
      model: modelSelect.value,
      effort: effortSelect.value,
      brief: briefInput.value.trim(),
      focusSkills: parseSkillInput(skillsInput.value),
      dryRun: dryRunInput.checked,
    });
    await persistComposerState();
    setStatus("ready", "idle");
    renderSidebar();
  } catch (error) {
    appendFeed("error", "Doctor falhou", error instanceof Error ? error.message : String(error));
    setStatus("error", "error");
  }
});

runButton.addEventListener("click", async () => {
  if (!snapshot) return;
  const brief = briefInput.value.trim();
  if (!brief) {
    appendFeed("error", "Brief obrigatorio", "Digite o objetivo da rodada antes de executar.");
    return;
  }

  setStatus("running", "active");
  appendFeed("user", workflowInput.value || "execução", brief);

  const stage = stageSelect.value;
  const mode = stage === "review" ? "review" : stage === "autonomy" ? "autonomy" : "full-run";
  const focusSkills = parseSkillInput(skillsInput.value);

  try {
    const result = await window.softwareFactoryDesktop.run({
      workspace: snapshot.workspace,
      squad: squadSelect.value,
      provider: providerSelect.value,
      model: modelSelect.value,
      stage,
      mode,
      effort: effortSelect.value,
      workflowName: workflowInput.value.trim(),
      dryRun: dryRunInput.checked,
      brief,
      focusSkills,
    });

    appendFeed("result", `Run ${result.runId}`, result);
    recordSession({
      id: result.runId || `run-${Date.now()}`,
      timestamp: new Date().toISOString(),
      workspace: snapshot.workspace,
      squad: squadSelect.value,
      provider: providerSelect.value,
      stage,
      workflowName: workflowInput.value.trim(),
      model: modelSelect.value,
      effort: effortSelect.value,
      brief,
      focusSkills,
      dryRun: dryRunInput.checked,
    });
    await persistComposerState();
    briefInput.value = "";
    await refreshSnapshot(() => window.softwareFactoryDesktop.refreshWorkspace(snapshot.workspace));
    setStatus("ready", "idle");
  } catch (error) {
    appendFeed("error", "Execução falhou", error instanceof Error ? error.message : String(error));
    setStatus("error", "error");
  }
});

if (!desktopApi) {
  appendFeed("error", "Bridge do desktop indisponivel", "A API preload do Electron nao foi carregada. Reinicie o app ou reinstale o launcher.");
  setStatus("bridge-error", "error");
  throw new Error("softwareFactoryDesktop bridge unavailable");
}

appendFeed("system", "SquadsCli Desktop", "Carregando workspace e preparando o workbench visual.");
await refreshSnapshot(() => desktopApi.getBootstrap());
