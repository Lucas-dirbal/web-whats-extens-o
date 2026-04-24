(function () {
  const DEFAULT_API_URL = "http://localhost:3333";
  const REFRESH_MS = 3000;

  let config = {
    attendantName: "",
    apiUrl: DEFAULT_API_URL
  };

  let activeChat = null;
  let activeState = null;
  let collapsed = false;
  let refreshTimer = null;
  let headerButtonTimer = null;

  const statusLabels = {
    unassigned: "Sem atendente",
    pending: "Pendente",
    assigned: "Em atendimento",
    resolved: "Resolvida"
  };

  function loadConfig() {
    chrome.storage.sync.get(["attendantName", "apiUrl"], (items) => {
      config = {
        attendantName: items.attendantName || "",
        apiUrl: normalizeApiUrl(items.apiUrl || DEFAULT_API_URL)
      };
      renderPanel();
      startRefresh();
    });
  }

  function normalizeApiUrl(url) {
    return String(url || DEFAULT_API_URL).replace(/\/+$/, "");
  }

  function getChatTitle() {
    const main = document.querySelector("#main");
    if (!main) return "";

    const title =
      main.querySelector("header span[title]") ||
      main.querySelector("header [title]");

    return title ? title.getAttribute("title") || title.textContent.trim() : "";
  }

  function getChatId(title) {
    if (!title) return "";
    return title.toLowerCase().replace(/\s+/g, " ").trim();
  }

  function ensurePanel() {
    let panel = document.getElementById("sw-panel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "sw-panel";
    document.body.appendChild(panel);
    return panel;
  }

  function renderPanel() {
    const panel = ensurePanel();
    const title = activeChat?.title || "Abra uma conversa";
    const state = activeState || { status: "unassigned" };
    const status = state.status || "unassigned";
    const assignedTo = state.assignedTo || "Ninguém";
    const hasName = Boolean(config.attendantName);
    const bodyClass = collapsed ? "sw-body sw-hidden" : "sw-body";
    const footerClass = collapsed ? "sw-footer sw-hidden" : "sw-footer";

    panel.innerHTML = `
      <div class="sw-header">
        <div>
          <p class="sw-title">Suporte WhatsApp</p>
          <p class="sw-small">${escapeHtml(hasName ? config.attendantName : "Configure seu nome no popup")}</p>
        </div>
        <button id="sw-toggle" title="Minimizar painel">${collapsed ? "Abrir" : "Fechar"}</button>
      </div>
      <div class="${bodyClass}">
        <div class="sw-row">
          <span class="sw-label">Conversa</span>
          <div class="sw-value">${escapeHtml(title)}</div>
        </div>
        <div class="sw-row">
          <span class="sw-label">Status</span>
          <span class="sw-status ${escapeHtml(status)}">${escapeHtml(statusLabels[status] || status)}</span>
        </div>
        <div class="sw-row">
          <span class="sw-label">Atendente</span>
          <div class="sw-value">${escapeHtml(assignedTo)}</div>
        </div>
        <div class="sw-actions">
          <button class="primary" id="sw-assign" ${!canAct() ? "disabled" : ""}>Pegar conversa</button>
          <button id="sw-pending" ${!canAct() ? "disabled" : ""}>Pendente</button>
          <button id="sw-resolve" ${!canAct() ? "disabled" : ""}>Resolver</button>
          <button id="sw-release" ${!canAct() ? "disabled" : ""}>Liberar</button>
        </div>
        <div id="sw-error" class="sw-error sw-hidden"></div>
      </div>
      <div class="${footerClass}">
        <button id="sw-refresh">Atualizar</button>
        <button id="sw-open-popup">Configurar</button>
      </div>
    `;

    panel.querySelector("#sw-toggle").addEventListener("click", () => {
      collapsed = !collapsed;
      renderPanel();
    });

    const refresh = panel.querySelector("#sw-refresh");
    if (refresh) refresh.addEventListener("click", refreshActiveChat);

    const popup = panel.querySelector("#sw-open-popup");
    if (popup) popup.addEventListener("click", () => showError("Clique no ícone da extensão no Chrome para configurar."));

    const assign = panel.querySelector("#sw-assign");
    if (assign) assign.addEventListener("click", () => updateConversation("assigned", config.attendantName));

    const pending = panel.querySelector("#sw-pending");
    if (pending) pending.addEventListener("click", () => updateConversation("pending", state.assignedTo || config.attendantName));

    const resolve = panel.querySelector("#sw-resolve");
    if (resolve) resolve.addEventListener("click", () => updateConversation("resolved", state.assignedTo || config.attendantName));

    const release = panel.querySelector("#sw-release");
    if (release) release.addEventListener("click", () => updateConversation("unassigned", ""));

    ensureAssignmentButton();
  }

  function ensureAssignmentButton() {
    const main = document.querySelector("#main");
    const header = main?.querySelector("header");
    if (!header) return;

    let button = document.getElementById("sw-header-assign");

    if (!button) {
      button = document.createElement("button");
      button.id = "sw-header-assign";
      button.type = "button";
      button.textContent = "atribuir atendimento";
      button.title = "Atribuir esta conversa ao atendente configurado";
      button.addEventListener("click", async () => {
        await refreshActiveChat();

        if (!config.attendantName) {
          showError("Configure seu nome no popup da extensao.");
          return;
        }

        if (!activeChat?.id) {
          showError("Abra uma conversa antes de atribuir.");
          return;
        }

        updateConversation("assigned", config.attendantName);
      });
    }

    const actions = header.lastElementChild || header;
    if (button.parentElement !== actions) {
      actions.insertBefore(button, actions.firstChild);
    }

    button.disabled = !config.attendantName || !activeChat?.id;
  }

  function canAct() {
    return Boolean(config.attendantName && activeChat?.id);
  }

  function showError(message) {
    const error = document.getElementById("sw-error");
    if (!error) return;
    error.textContent = message;
    error.classList.remove("sw-hidden");
  }

  function clearError() {
    const error = document.getElementById("sw-error");
    if (!error) return;
    error.textContent = "";
    error.classList.add("sw-hidden");
  }

  async function api(path, options = {}) {
    const response = await fetch(`${config.apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      throw new Error(`API respondeu ${response.status}`);
    }

    return response.json();
  }

  async function refreshActiveChat() {
    const title = getChatTitle();
    const id = getChatId(title);

    if (!id) {
      activeChat = null;
      activeState = null;
      renderPanel();
      return;
    }

    activeChat = { id, title };

    try {
      clearError();
      activeState = await api(`/conversations/${encodeURIComponent(id)}?title=${encodeURIComponent(title)}`);
    } catch (error) {
      activeState = { status: "unassigned" };
      showError("Não consegui conectar na API. Confira o endereço no popup.");
    }

    renderPanel();
  }

  async function updateConversation(status, assignedTo) {
    if (!activeChat?.id) return;

    try {
      clearError();
      activeState = await api(`/conversations/${encodeURIComponent(activeChat.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          title: activeChat.title,
          status,
          assignedTo,
          updatedBy: config.attendantName
        })
      });
      renderPanel();
    } catch (error) {
      showError("Não foi possível salvar na API.");
    }
  }

  function startRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    if (headerButtonTimer) clearInterval(headerButtonTimer);
    refreshActiveChat();
    refreshTimer = setInterval(refreshActiveChat, REFRESH_MS);
    headerButtonTimer = setInterval(ensureAssignmentButton, 1000);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.attendantName || changes.apiUrl) {
      loadConfig();
    }
  });

  loadConfig();
})();
