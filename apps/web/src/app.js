const healthOutput = document.getElementById("health-output");
const modelsOutput = document.getElementById("models-output");
const providersOutput = document.getElementById("providers-output");
const workflowsOutput = document.getElementById("workflows-output");
const refreshButton = document.getElementById("refresh-all");
const serverInput = document.getElementById("server-url");

const workspaceDir = "C:/Users/veron/OneDrive/Área de Trabalho/MeuSquadProtagonista/Projetos/software-factory-cli";

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function refresh() {
  const base = serverInput.value.trim().replace(/\/$/, "");
  healthOutput.textContent = "Carregando...";
  modelsOutput.textContent = "Carregando...";
  providersOutput.textContent = "Carregando...";
  workflowsOutput.textContent = "Carregando...";

  try {
    const [health, models, providers, workflows] = await Promise.all([
      fetchJson(`${base}/health`),
      fetchJson(`${base}/models?workspaceDir=${encodeURIComponent(workspaceDir)}`),
      fetchJson(`${base}/providers?workspaceDir=${encodeURIComponent(workspaceDir)}`),
      fetchJson(`${base}/workflows?workspaceDir=${encodeURIComponent(workspaceDir)}`),
    ]);

    healthOutput.textContent = JSON.stringify(health, null, 2);
    modelsOutput.textContent = JSON.stringify(models, null, 2);
    providersOutput.textContent = JSON.stringify(providers, null, 2);
    workflowsOutput.textContent = JSON.stringify(workflows, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    healthOutput.textContent = `Erro: ${message}`;
    modelsOutput.textContent = `Erro: ${message}`;
    providersOutput.textContent = `Erro: ${message}`;
    workflowsOutput.textContent = `Erro: ${message}`;
  }
}

refreshButton.addEventListener("click", () => {
  void refresh();
});

void refresh();
