const storageKey = "software-factory-desktop-session-history";

const workspaceName = document.getElementById("workspace-name");
const workspacePath = document.getElementById("workspace-path");
const readyCount = document.getElementById("ready-count");
const defaultProvider = document.getElementById("default-provider");
const workflowCount = document.getElementById("workflow-count");
const runCount = document.getElementById("run-count");
const providerSelect = document.getElementById("provider-select");
const modelSelect = document.getElementById("model-select");
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
const navButtons = Array.from(document.querySelectorAll(".rail-link"));

let snapshot = null;
let currentView = "home";
let sessionHistory = loadSessionHistory();

function setText(node, value) {
  node.textContent = value || "";
}

function createTextNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function loadSessionHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function persistSessionHistory() {
  localStorage.setItem(storageKey, JSON.stringify(sessionHistory.slice(0, 20)));
}

function recordSession(entry) {
  sessionHistory = [entry, ...sessionHistory.filter((item) => item.id !== entry.id)].slice(0, 20);
  persistSessionHistory();
  renderView();
}

function appendFeed(kind, title, body) {
  const article = document.createElement("article");
  article.className = `feed-card ${kind}`;

  const heading = document.createElement("h3");
  heading.textContent = title;
  article.appendChild(heading);

  const pre = document.createElement("pre");
  pre.textContent = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  article.appendChild(pre);

  feed.prepend(article);
}

function setStatus(label, kind) {
  statusBadge.textContent = label;
  statusBadge.className = `status-badge ${kind}`;
}

function parseSkillInput(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getComposerState() {
  return {
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

function createCard(title, subtitle, meta, action) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "content-card";
  card.appendChild(createTextNode("strong", "", title));
  card.appendChild(createTextNode("span", "", subtitle || ""));
  card.appendChild(createTextNode("small", "", meta || ""));
  if (action) {
    card.addEventListener("click", action);
  }
  return card;
}

function summarizeExecution(execution) {
  if (!execution) {
    return "sem plano persistido";
  }

  const handoffs = execution.steps.filter((step) => step.handoffTo).length;
  return `${execution.status} · ${execution.steps.length} steps · ${handoffs} handoffs`;
}

function setComposerFromRun(run) {
  providerSelect.value = run.provider || snapshot.defaultProvider;
  renderModels();
  modelSelect.value = run.model || "";
  stageSelect.value = run.stage || "full-run";
  effortSelect.value = run.effort || snapshot.defaultEffort;
  workflowInput.value = run.workflowName || "";
  skillsInput.value = Array.isArray(run.focusSkills) ? run.focusSkills.join(", ") : "";
  dryRunInput.checked = Boolean(run.dryRun);
  if (typeof run.brief === "string") {
    briefInput.value = run.brief;
  }
  void persistComposerState();
}

function renderHomeView() {
  const wrapper = document.createElement("div");
  wrapper.className = "content-stack";

  const hero = document.createElement("section");
  hero.className = "subpanel";
  hero.appendChild(createTextNode("p", "subheading", "command surface"));
  hero.appendChild(createTextNode("h3", "", "Workspace pronto para rodar"));
  hero.appendChild(
    createTextNode(
      "p",
      "subcopy",
      "Escolha um provider, selecione um workflow existente ou comece um novo fluxo diretamente pelo composer.",
    ),
  );
  wrapper.appendChild(hero);

  const grid = document.createElement("div");
  grid.className = "card-grid three";

  const readyProviders = snapshot.providers.filter((provider) => provider.ready);
  readyProviders.slice(0, 3).forEach((provider) => {
    grid.appendChild(
      createCard(
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

  if (grid.children.length === 0) {
    grid.appendChild(createTextNode("div", "empty-card", "Nenhum provider pronto neste workspace."));
  }

  wrapper.appendChild(grid);

  const flows = document.createElement("div");
  flows.className = "subpanel";
  const flowsHeader = document.createElement("div");
  flowsHeader.className = "subpanel-header";
  flowsHeader.appendChild(createTextNode("h3", "", "Workflows recentes"));
  flowsHeader.appendChild(createTextNode("span", "", "atalhos"));
  flows.appendChild(flowsHeader);

  const list = document.createElement("div");
  list.className = "card-grid two";
  const workflowItems = snapshot.workflows.slice(0, 4);

  if (workflowItems.length === 0) {
    list.appendChild(createTextNode("div", "empty-card", "Nenhum workflow salvo ainda."));
  } else {
    workflowItems.forEach((workflow) => {
      list.appendChild(
        createCard(
          workflow.workflowName,
          `stage ${workflow.currentStage}`,
          workflow.execution?.nextAction || workflow.updatedAt,
          () => {
            workflowInput.value = workflow.workflowName;
            stageSelect.value = workflow.currentStage;
            appendFeed("system", "Workflow selecionado", workflow.workflowName);
          },
        ),
      );
    });
  }

  flows.appendChild(list);
  wrapper.appendChild(flows);

  return wrapper;
}

function renderProvidersView() {
  const grid = document.createElement("div");
  grid.className = "card-grid three";

  snapshot.providers.forEach((provider) => {
    const status = provider.ready ? "ready" : "not ready";
    grid.appendChild(
      createCard(
        provider.provider,
        provider.description,
        `${status} · ${provider.kind}`,
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
  const grid = document.createElement("div");
  grid.className = "card-grid two";

  if (!snapshot.workflows.length) {
    grid.appendChild(createTextNode("div", "empty-card", "Nenhum workflow encontrado neste workspace."));
    return grid;
  }

  snapshot.workflows.forEach((workflow) => {
    grid.appendChild(
      createCard(
        workflow.workflowName,
        `stage ${workflow.currentStage}`,
        workflow.execution?.nextAction || summarizeExecution(workflow.execution),
        () => {
          workflowInput.value = workflow.workflowName;
          stageSelect.value = workflow.currentStage;
          appendFeed("system", "Workflow carregado", workflow.workflowName);
        },
      ),
    );
  });

  return grid;
}

function renderRunsView() {
  const grid = document.createElement("div");
  grid.className = "card-grid two";

  if (!snapshot.recentRuns.length) {
    grid.appendChild(createTextNode("div", "empty-card", "Nenhum run recente neste workspace."));
    return grid;
  }

  snapshot.recentRuns.forEach((run) => {
    grid.appendChild(
      createCard(
        run.workflowName,
        `${run.stage} · ${run.provider}`,
        summarizeExecution(run.execution),
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
  const grid = document.createElement("div");
  grid.className = "card-grid two";

  const items = snapshot.workflows.filter((workflow) => workflow.execution?.sharedMemoryExcerpt || workflow.execution?.taskMemoryExcerpt);
  if (!items.length) {
    grid.appendChild(createTextNode("div", "empty-card", "Nenhuma memória consolidada ainda nos workflows."));
    return grid;
  }

  items.forEach((workflow) => {
    const excerpt = workflow.execution?.taskMemoryExcerpt || workflow.execution?.sharedMemoryExcerpt || "";
    grid.appendChild(
      createCard(
        workflow.workflowName,
        workflow.execution?.nextAction || "memória do workflow",
        excerpt,
        () => {
          workflowInput.value = workflow.workflowName;
          appendFeed("system", "Memória do workflow", excerpt);
        },
      ),
    );
  });

  return grid;
}

function renderSessionsView() {
  const grid = document.createElement("div");
  grid.className = "card-grid two";

  if (!sessionHistory.length) {
    grid.appendChild(createTextNode("div", "empty-card", "Nenhuma sessão local ainda. Rode algo para começar."));
    return grid;
  }

  sessionHistory.forEach((entry) => {
    grid.appendChild(
      createCard(
        entry.workflowName || "nova sessão",
        `${entry.stage} · ${entry.provider}`,
        `${entry.workspace}\n${entry.timestamp}`,
        () => {
          providerSelect.value = entry.provider || snapshot.defaultProvider;
          renderModels();
          modelSelect.value = entry.model || "";
          stageSelect.value = entry.stage || "full-run";
          effortSelect.value = entry.effort || snapshot.defaultEffort;
          workflowInput.value = entry.workflowName || "";
          skillsInput.value = Array.isArray(entry.focusSkills) ? entry.focusSkills.join(", ") : "";
          dryRunInput.checked = Boolean(entry.dryRun);
          briefInput.value = entry.brief || "";
          appendFeed("system", "Sessão restaurada", entry.workflowName || "nova sessão");
        },
      ),
    );
  });

  return grid;
}

function renderView() {
  if (!snapshot) {
    return;
  }

  viewContent.innerHTML = "";

  const views = {
    home: { kicker: "home", title: "Visão geral", node: renderHomeView() },
    providers: { kicker: "providers", title: "Providers disponíveis", node: renderProvidersView() },
    workflows: { kicker: "workflows", title: "Workflows salvos", node: renderWorkflowsView() },
    runs: { kicker: "runs", title: "Runs do workspace", node: renderRunsView() },
    memory: { kicker: "memory", title: "Memória e handoffs", node: renderMemoryView() },
    sessions: { kicker: "sessions", title: "Histórico local de sessões", node: renderSessionsView() },
  };

  const selected = views[currentView] || views.home;
  viewKicker.textContent = selected.kicker;
  viewTitle.textContent = selected.title;
  viewContent.appendChild(selected.node);

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === currentView);
  });
}

function renderProviders() {
  providerSelect.innerHTML = "";
  snapshot.providers.forEach((provider) => {
    const option = document.createElement("option");
    option.value = provider.provider;
    option.textContent = `${provider.provider}${provider.ready ? "" : " (not ready)"}`;
    providerSelect.appendChild(option);
  });
  const target = snapshot.session?.provider || snapshot.defaultProvider;
  providerSelect.value = snapshot.providers.some((provider) => provider.provider === target)
    ? target
    : snapshot.defaultProvider;
}

function renderModels() {
  modelSelect.innerHTML = "";
  const providerBlock = snapshot.models.find((provider) => provider.provider === providerSelect.value) || snapshot.models[0];

  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = "auto";
  modelSelect.appendChild(auto);

  const values = new Set([providerBlock?.activeModel, ...(providerBlock?.suggestedModels || [])].filter(Boolean));
  values.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
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
  renderProviders();
  renderModels();
  stageSelect.value = nextSnapshot.session?.stage || "full-run";
  workflowInput.value = nextSnapshot.session?.workflowName || "";
  skillsInput.value = Array.isArray(nextSnapshot.session?.focusSkills) ? nextSnapshot.session.focusSkills.join(", ") : "";
  dryRunInput.checked = Boolean(nextSnapshot.session?.dryRun);
  briefInput.value = nextSnapshot.session?.brief || "";
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

providerSelect.addEventListener("change", () => {
  renderModels();
  void persistComposerState();
});

modelSelect.addEventListener("change", () => {
  void persistComposerState();
});

stageSelect.addEventListener("change", () => {
  void persistComposerState();
});

effortSelect.addEventListener("change", () => {
  void persistComposerState();
});

workflowInput.addEventListener("input", () => {
  void persistComposerState();
});

skillsInput.addEventListener("input", () => {
  void persistComposerState();
});

dryRunInput.addEventListener("change", () => {
  void persistComposerState();
});

briefInput.addEventListener("input", () => {
  void persistComposerState();
});

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
    const result = await window.softwareFactoryDesktop.doctor({
      workspace: snapshot.workspace,
      provider: providerSelect.value,
    });
    appendFeed("system", `Doctor ${providerSelect.value}`, result);
    recordSession({
      id: `doctor-${Date.now()}`,
      timestamp: new Date().toISOString(),
      workspace: snapshot.workspace,
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

appendFeed("system", "Desktop launcher", "Carregando workspace e preparando a superfície visual do launcher.");
await refreshSnapshot(() => window.softwareFactoryDesktop.getBootstrap());
