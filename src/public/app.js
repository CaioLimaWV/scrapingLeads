const state = {
  sources: [],
  sourceMap: new Map(),
  manualSourceId: null,
  selectedFieldArea: "",
  executionsPagination: {
    limit: 20,
    offset: 0
  },
  leadsPagination: {
    limit: 20,
    offset: 0
  },
  runPanel: {
    isManualMode: false
  }
};

const elements = {
  healthBadge: document.getElementById("healthBadge"),
  runPanel: document.getElementById("runPanel"),
  fieldAreaSelect: document.getElementById("fieldAreaSelect"),
  sourceSelect: document.getElementById("sourceSelect"),
  leadsSourceFilter: document.getElementById("leadsSourceFilter"),
  leadsGenderFilter: document.getElementById("leadsGenderFilter"),
  leadsPageSize: document.getElementById("leadsPageSize"),
  prevLeads: document.getElementById("prevLeads"),
  nextLeads: document.getElementById("nextLeads"),
  leadsPageLabel: document.getElementById("leadsPageLabel"),
  runButton: document.getElementById("runButton"),
  toggleManualMode: document.getElementById("toggleManualMode"),
  runToken: document.getElementById("runToken"),
  runStatus: document.getElementById("runStatus"),
  manualUrl: document.getElementById("manualUrl"),
  manualFields: document.getElementById("manualFields"),
  manualConsent: document.getElementById("manualConsent"),
  manualRunButton: document.getElementById("manualRunButton"),
  manualBackToApi: document.getElementById("manualBackToApi"),
  manualStatus: document.getElementById("manualStatus"),
  executionsBody: document.getElementById("executionsBody"),
  prevExecutions: document.getElementById("prevExecutions"),
  nextExecutions: document.getElementById("nextExecutions"),
  executionsPageLabel: document.getElementById("executionsPageLabel"),
  leadsBody: document.getElementById("leadsBody"),
  refreshExecutions: document.getElementById("refreshExecutions"),
  refreshLeads: document.getElementById("refreshLeads"),
  metricTotalLeads: document.getElementById("metricTotalLeads"),
  metricFemaleLeads: document.getElementById("metricFemaleLeads"),
  metricMaleLeads: document.getElementById("metricMaleLeads"),
  metricActiveSources: document.getElementById("metricActiveSources"),
  metricCompleted: document.getElementById("metricCompleted")
};

function formatFieldArea(area) {
  const map = {
    politica: "Politica",
    manual: "Manual",
    economia: "Economia",
    demografia: "Demografia",
    educacao: "Educacao",
    energia: "Energia",
    engenharia: "Engenharia",
    lojas: "Lojas",
    shopping: "Shopping",
    odontologia: "Odontologia",
    veterinaria: "Veterinaria",
    cnpj: "CNPJ",
    saude: "Saude",
    juridico: "Juridico",
    financeiro: "Financeiro",
    inovacao: "Inovacao",
    governo: "Governo",
    transporte: "Transporte",
    rh_trabalho: "RH / Trabalho",
    consumidor: "Consumidor",
    alimentacao: "Alimentacao",
    hotelaria: "Hotelaria",
    esporte: "Esporte",
    imobiliario: "Imobiliario",
    religioso: "Religioso",
    tecnologia: "Tecnologia"
  };

  if (!area) {
    return "Sem area";
  }

  return map[area] || area;
}

function toLocalDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${response.status}`);
  }
  return response.json();
}

function setHealth(ok, label) {
  elements.healthBadge.textContent = label;
  elements.healthBadge.style.color = ok ? "#2e8b57" : "#a93c3c";
}

function setRunPanelMode(isManualMode) {
  state.runPanel.isManualMode = Boolean(isManualMode);
  elements.runPanel.classList.toggle("is-manual-mode", state.runPanel.isManualMode);
  elements.toggleManualMode.textContent = state.runPanel.isManualMode ? "Voltar ao Modo Padrao" : "Scraping Manual";

  if (state.runPanel.isManualMode) {
    elements.runStatus.textContent = "";
  } else {
    elements.manualStatus.textContent = "";
  }
}

async function loadHealth() {
  try {
    await requestJson("/health");
    setHealth(true, "API: online");
  } catch (error) {
    setHealth(false, "API: offline");
  }
}

function renderSourceOptions() {
  elements.sourceSelect.textContent = "";
  elements.leadsSourceFilter.textContent = "";

  const API_MANUAL_SOURCE_NAME = "scraping-manual";

  const allOptionRun = document.createElement("option");
  allOptionRun.value = "";
  allOptionRun.textContent = "Todas as fontes ativas";
  elements.sourceSelect.appendChild(allOptionRun);

  const allOptionFilter = document.createElement("option");
  allOptionFilter.value = "";
  allOptionFilter.textContent = "Todas as fontes";
  elements.leadsSourceFilter.appendChild(allOptionFilter);

  const runSources = (state.selectedFieldArea
    ? state.sources.filter((source) => source.field_area === state.selectedFieldArea)
    : state.sources).filter((source) => source.name !== API_MANUAL_SOURCE_NAME);

  for (const source of runSources) {
    const area = source.field_area;
    const label = `${source.name} [${formatFieldArea(area)}]${source.is_active ? "" : " (inativa)"}`;

    const optionRun = document.createElement("option");
    optionRun.value = String(source.id);
    optionRun.textContent = label;
    if (!source.is_active) {
      optionRun.disabled = true;
    }

    elements.sourceSelect.appendChild(optionRun);
  }

  const orderedFilterSources = [...state.sources].sort((a, b) => {
    if (a.name === API_MANUAL_SOURCE_NAME && b.name !== API_MANUAL_SOURCE_NAME) {
      return -1;
    }
    if (a.name !== API_MANUAL_SOURCE_NAME && b.name === API_MANUAL_SOURCE_NAME) {
      return 1;
    }
    return a.name.localeCompare(b.name, "pt-BR");
  });

  for (const source of orderedFilterSources) {
    const area = source.field_area;
    const label = `${source.name} [${formatFieldArea(area)}]${source.is_active ? "" : " (inativa)"}`;

    const optionFilter = document.createElement("option");
    optionFilter.value = String(source.id);
    optionFilter.textContent = label;

    elements.leadsSourceFilter.appendChild(optionFilter);
  }
}

function renderFieldAreaOptions() {
  const previousValue = elements.fieldAreaSelect.value;
  elements.fieldAreaSelect.textContent = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "Todos os campos";
  elements.fieldAreaSelect.appendChild(allOption);

  const uniqueAreas = Array.from(
    new Set(state.sources.map((source) => source.field_area).filter(Boolean))
  ).sort();

  for (const area of uniqueAreas) {
    const option = document.createElement("option");
    option.value = area;
    option.textContent = formatFieldArea(area);
    elements.fieldAreaSelect.appendChild(option);
  }

  if (previousValue && uniqueAreas.includes(previousValue)) {
    elements.fieldAreaSelect.value = previousValue;
    state.selectedFieldArea = previousValue;
  } else {
    elements.fieldAreaSelect.value = "";
    state.selectedFieldArea = "";
  }
}

async function loadSources() {
  const payload = await requestJson("/api/sources");
  state.sources = payload.data || [];
  state.sourceMap = new Map(state.sources.map((source) => [source.id, source.name]));
  const manualSource = state.sources.find((source) => source.name === "scraping-manual");
  state.manualSourceId = manualSource ? manualSource.id : null;
  renderFieldAreaOptions();
  renderSourceOptions();
}

function renderExecutions(rows) {
  elements.executionsBody.textContent = "";

  for (const row of rows) {
    const tr = document.createElement("tr");

    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `badge ${row.status}`;
    badge.textContent = row.status;
    statusCell.appendChild(badge);

    const cells = [
      row.id,
      state.sourceMap.get(row.source_id) || `#${row.source_id}`,
      null,
      row.total_scraped,
      row.total_saved,
      row.duplicates_found,
      row.errors_count,
      toLocalDate(row.finished_at)
    ];

    cells.forEach((value, index) => {
      if (index === 2) {
        tr.appendChild(statusCell);
        return;
      }
      const td = document.createElement("td");
      td.textContent = String(value ?? "-");
      tr.appendChild(td);
    });

    elements.executionsBody.appendChild(tr);
  }
}

async function loadExecutions() {
  const qs = new URLSearchParams({
    limit: String(state.executionsPagination.limit),
    offset: String(state.executionsPagination.offset)
  });

  const payload = await requestJson(`/api/executions?${qs.toString()}`);
  const rows = payload.data || [];
  renderExecutions(rows);

  const page = Math.floor(state.executionsPagination.offset / state.executionsPagination.limit) + 1;
  elements.executionsPageLabel.textContent = `Pagina ${page}`;
  elements.prevExecutions.disabled = state.executionsPagination.offset === 0;
  elements.nextExecutions.disabled = rows.length < state.executionsPagination.limit;
}

function formatTemperature(value) {
  const map = { cold: "Frio", warm: "Morno", hot: "Quente", lost: "Fora" };
  return map[value] || value || "-";
}

function formatFunnel(value) {
  const map = { top: "Topo", middle: "Meio", bottom: "Fundo", lost: "Perdido" };
  return map[value] || value || "-";
}

function renderLeads(rows) {
  elements.leadsBody.textContent = "";

  for (const row of rows) {
    const tr = document.createElement("tr");
    const values = [
      row.id,
      row.name,
      row.email,
      row.phone || "-",
      row.engagement_score ?? 0,
      formatTemperature(row.temperature),
      formatFunnel(row.funnel_stage),
      row.gender || "-",
      state.sourceMap.get(row.source_id) || `#${row.source_id}`,
      toLocalDate(row.created_at)
    ];

    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = String(value ?? "-");
      tr.appendChild(td);
    }

    elements.leadsBody.appendChild(tr);
  }
}

async function loadLeads() {
  const sourceId = elements.leadsSourceFilter.value;
  const gender = elements.leadsGenderFilter.value;
  const qs = new URLSearchParams({
    limit: String(state.leadsPagination.limit),
    offset: String(state.leadsPagination.offset)
  });
  if (sourceId) {
    qs.set("source_id", sourceId);
  }
  if (gender) {
    qs.set("gender", gender);
  }

  const payload = await requestJson(`/api/leads?${qs.toString()}`);
  const rows = payload.data || [];
  renderLeads(rows);

  const page = Math.floor(state.leadsPagination.offset / state.leadsPagination.limit) + 1;
  elements.leadsPageLabel.textContent = `Pagina ${page}`;
  elements.prevLeads.disabled = state.leadsPagination.offset === 0;
  elements.nextLeads.disabled = rows.length < state.leadsPagination.limit;
}

async function loadSummary() {
  const payload = await requestJson("/api/dashboard/summary");
  const data = payload.data || {};

  elements.metricTotalLeads.textContent = String(data.totalLeads ?? 0);
  elements.metricFemaleLeads.textContent = String(data.femaleLeads ?? 0);
  elements.metricMaleLeads.textContent = String(data.maleLeads ?? 0);
  elements.metricActiveSources.textContent = String(data.activeSources ?? 0);
  elements.metricCompleted.textContent = String(data.statuses?.completed ?? 0);
}

async function runScraping() {
  elements.runButton.disabled = true;
  elements.runStatus.textContent = "Executando scraping...";
  elements.runStatus.style.color = "#0f7a6a";

  try {
    const sourceId = elements.sourceSelect.value;
    const token = elements.runToken.value.trim();

    const payload = await requestJson("/api/scrape/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-panel-token": token } : {})
      },
      body: JSON.stringify({ sourceId: sourceId || null })
    });

    const totals = payload.data?.totals;
    elements.runStatus.textContent = `Finalizado: scraped=${totals?.scraped ?? 0}, salvos=${totals?.saved ?? 0}, duplicados=${totals?.duplicates ?? 0}, erros=${totals?.errors ?? 0}`;
    elements.runStatus.style.color = "#2e8b57";

    await Promise.all([loadSummary(), loadExecutions(), loadLeads()]);
  } catch (error) {
    elements.runStatus.textContent = `Falha: ${error.message}`;
    elements.runStatus.style.color = "#a93c3c";
  } finally {
    elements.runButton.disabled = false;
  }
}

function getSelectedManualFields() {
  const checkboxes = elements.manualFields.querySelectorAll('input[type="checkbox"]');
  const selected = [];
  for (const checkbox of checkboxes) {
    if (checkbox.checked) {
      selected.push(checkbox.value);
    }
  }
  return selected;
}

async function runManualScraping() {
  elements.manualRunButton.disabled = true;
  elements.manualStatus.textContent = "Executando scraping manual...";
  elements.manualStatus.style.color = "#0f7a6a";

  try {
    const token = elements.runToken.value.trim();
    const url = elements.manualUrl.value.trim();
    const fields = getSelectedManualFields();
    const consent = elements.manualConsent.checked;

    if (!url) {
      throw new Error("Informe uma URL valida.");
    }

    if (fields.length === 0) {
      throw new Error("Selecione pelo menos um campo para extracao.");
    }

    if (!consent) {
      throw new Error("Confirme o consentimento LGPD para salvar em Leads.");
    }

    const payload = await requestJson("/api/scrape/manual", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-panel-token": token } : {})
      },
      body: JSON.stringify({
        url,
        fields,
        consent,
        fetchAll: true
      })
    });

    const resultData = payload.data || {};
    const counts = resultData.counts || {};
    const persisted = resultData.persist?.result?.counters;
    const warnings = resultData.persist?.result?.warnings || [];
    const totalExtracted = Math.max(0, ...Object.values(counts));

    const persistSummary = persisted
      ? `salvos=${persisted.saved}, duplicados=${persisted.duplicates}, erros=${persisted.errors}`
      : "salvos=0, duplicados=0, erros=0";
    const warningSummary = warnings.length > 0 ? ` | avisos: ${warnings.join(" | ")}` : "";

    elements.manualStatus.textContent = `Finalizado (extraidos=${totalExtracted}, ${persistSummary})${warningSummary}`;
    elements.manualStatus.style.color = "#2e8b57";

    if (state.manualSourceId) {
      elements.leadsSourceFilter.value = String(state.manualSourceId);
    }
    state.leadsPagination.offset = 0;
    await Promise.all([loadSummary(), loadLeads()]);
  } catch (error) {
    elements.manualStatus.textContent = `Falha: ${error.message}`;
    elements.manualStatus.style.color = "#a93c3c";
  } finally {
    elements.manualRunButton.disabled = false;
  }
}

async function initialLoad() {
  try {
    elements.leadsPageSize.value = String(state.leadsPagination.limit);
    await loadHealth();
    await loadSources();
    await Promise.all([loadSummary(), loadExecutions(), loadLeads()]);
  } catch (error) {
    elements.runStatus.textContent = `Erro inicial: ${error.message}`;
    elements.runStatus.style.color = "#a93c3c";
  }
}

elements.runButton.addEventListener("click", runScraping);
elements.toggleManualMode.addEventListener("click", () => {
  setRunPanelMode(!state.runPanel.isManualMode);
});
elements.manualBackToApi.addEventListener("click", () => {
  setRunPanelMode(false);
});
elements.manualRunButton.addEventListener("click", runManualScraping);
elements.refreshExecutions.addEventListener("click", () => {
  state.executionsPagination.offset = 0;
  loadExecutions();
});
elements.refreshLeads.addEventListener("click", () => {
  state.leadsPagination.offset = 0;
  loadLeads();
});
elements.prevExecutions.addEventListener("click", () => {
  state.executionsPagination.offset = Math.max(0, state.executionsPagination.offset - state.executionsPagination.limit);
  loadExecutions();
});
elements.nextExecutions.addEventListener("click", () => {
  state.executionsPagination.offset += state.executionsPagination.limit;
  loadExecutions();
});
elements.prevLeads.addEventListener("click", () => {
  state.leadsPagination.offset = Math.max(0, state.leadsPagination.offset - state.leadsPagination.limit);
  loadLeads();
});
elements.nextLeads.addEventListener("click", () => {
  state.leadsPagination.offset += state.leadsPagination.limit;
  loadLeads();
});
elements.fieldAreaSelect.addEventListener("change", () => {
  state.selectedFieldArea = elements.fieldAreaSelect.value;
  renderSourceOptions();
});
elements.leadsSourceFilter.addEventListener("change", () => {
  state.leadsPagination.offset = 0;
  loadLeads();
});
elements.leadsGenderFilter.addEventListener("change", () => {
  state.leadsPagination.offset = 0;
  loadLeads();
});
elements.leadsPageSize.addEventListener("change", () => {
  const selectedLimit = Number(elements.leadsPageSize.value);
  state.leadsPagination.limit = Number.isInteger(selectedLimit) && selectedLimit > 0 ? selectedLimit : 20;
  state.leadsPagination.offset = 0;
  loadLeads();
});

setRunPanelMode(false);

setInterval(loadExecutions, 20000);
setInterval(loadSummary, 20000);

initialLoad();
