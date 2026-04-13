const workspacePath = document.getElementById("workspace-path");
const providerSelect = document.getElementById("provider-select");
const modelSelect = document.getElementById("model-select");
const stageSelect = document.getElementById("stage-select");
const effortSelect = document.getElementById("effort-select");
const workflowInput = document.getElementById("workflow-input");
const dryRunInput = document.getElementById("dry-run-input");
const chooseFolderButton = document.getElementById("choose-folder");
const refreshWorkspaceButton = document.getElementById("refresh-workspace");
const runDoctorButton = document.getElementById("run-doctor");
const runButton = document.getElementById("run-button");
const briefInput = document.getElementById("brief-input");
const feed = document.getElementById("feed");
const recentRuns = document.getElementById("recent-runs");
const statusBadge = document.getElementById("status-badge");

let snapshot = null;

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

function renderProviders() {
  providerSelect.innerHTML = "";
  snapshot.providers.forEach((provider) => {
    const option = document.createElement("option");
    option.value = provider.provider;
    option.textContent = `${provider.provider}${provider.ready ? "" : " (not ready)"}`;
    providerSelect.appendChild(option);
  });
  providerSelect.value = snapshot.defaultProvider;
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
}

function renderRecentRuns() {
  recentRuns.innerHTML = "";
  if (!snapshot.recentRuns.length) {
    recentRuns.textContent = "Nenhum run ainda.";
    return;
  }

  snapshot.recentRuns.slice(0, 8).forEach((run) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `<strong>${run.workflowName}</strong><span>${run.stage} · ${run.provider}</span>`;
    recentRuns.appendChild(item);
  });
}

function applySnapshot(nextSnapshot) {
  snapshot = nextSnapshot;
  workspacePath.textContent = snapshot.workspace;
  effortSelect.value = snapshot.defaultEffort;
  renderProviders();
  renderModels();
  renderRecentRuns();
}

async function refreshSnapshot(loader) {
  setStatus("loading", "loading");
  try {
    applySnapshot(await loader());
    setStatus("ready", "idle");
  } catch (error) {
    appendFeed("error", "Falha ao carregar workspace", error instanceof Error ? error.message : String(error));
    setStatus("error", "error");
  }
}

providerSelect.addEventListener("change", () => {
  renderModels();
});

chooseFolderButton.addEventListener("click", async () => {
  await refreshSnapshot(() => window.softwareFactoryDesktop.chooseFolder());
});

refreshWorkspaceButton.addEventListener("click", async () => {
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
  appendFeed("user", workflowInput.value || "execucao", brief);

  const stage = stageSelect.value;
  const mode = stage === "review" ? "review" : stage === "autonomy" ? "autonomy" : "full-run";

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
      focusSkills: [],
    });

    appendFeed("result", `Run ${result.runId}`, result);
    briefInput.value = "";
    await refreshSnapshot(() => window.softwareFactoryDesktop.refreshWorkspace(snapshot.workspace));
    setStatus("ready", "idle");
  } catch (error) {
    appendFeed("error", "Execucao falhou", error instanceof Error ? error.message : String(error));
    setStatus("error", "error");
  }
});

appendFeed("system", "Desktop launcher", "Carregando workspace e preparando o launcher.");
await refreshSnapshot(() => window.softwareFactoryDesktop.getBootstrap());
