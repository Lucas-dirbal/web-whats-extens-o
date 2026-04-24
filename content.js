(function () {
  if (window.__swSupportExtensionLoaded) {
    return;
  }

  window.__swSupportExtensionLoaded = true;

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
  let isSendingMessage = false;

  const statusLabels = {
    unassigned: "Sem atendente",
    pending: "Pendente",
    assigned: "Em atendimento",
    resolved: "Resolvida"
  };

  const ignoredHeaderTexts = new Set([
    "dados do perfil",
    "etiquetar conversa",
    "pesquisar",
    "menu",
    "mais opcoes",
    "mais opções",
    "atribuir atendimento"
  ]);

  function getWelcomeMessage() {
    return `Seja bem-vindo(a) à Interface Sistemas Inteligentes! Aqui é o ${config.attendantName} e estou à disposição para ajudá-lo(a).`;
  }

  function getClosingMessage() {
    return [
      "Atendimento Encerrado",
      "",
      "Agradecemos pelo seu contato e pela confiança na Interface Sistemas Inteligentes.",
      "Caso precise de mais informações ou tenha outras dúvidas, estaremos sempre à disposição para atendê-lo(a)."
    ].join("\n");
  }

  function loadConfig() {
    chrome.storage.sync.get(["attendantName", "apiUrl"], (items) => {
      config = {
        attendantName: items.attendantName || "",
        apiUrl: normalizeApiUrl(items.apiUrl || DEFAULT_API_URL)
      };
      if (items.apiUrl !== config.apiUrl) {
        chrome.storage.sync.set({ apiUrl: config.apiUrl });
      }
      renderPanel();
      startRefresh();
    });
  }

  function normalizeApiUrl(url) {
    const normalized = String(url || DEFAULT_API_URL).replace(/\/+$/, "");
    return normalized.replace("://0.0.0.0:", "://localhost:");
  }

  function getChatTitle() {
    const main = document.querySelector("#main");
    if (!main) return "";

    const header = main.querySelector("header");
    if (!header) return "";

    const headerRect = header.getBoundingClientRect();
    const candidates = Array.from(header.querySelectorAll("span[title], span[dir='auto']"))
      .map((element) => ({
        element,
        text: getElementLabel(element)
      }))
      .filter(({ element, text }) => {
        if (!text) return false;
        if (ignoredHeaderTexts.has(text.toLowerCase())) return false;
        if (element.closest("#sw-header-assign")) return false;
        return isVisible(element);
      });

    const leftSide = candidates.find(({ element }) => {
      const rect = element.getBoundingClientRect();
      return rect.left < headerRect.left + headerRect.width / 2;
    });

    return leftSide?.text || candidates[0]?.text || "";
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
    const assignedTo = state.assignedTo || "Ninguem";
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
          <button class="primary" id="sw-start" ${!canAct() ? "disabled" : ""}>Iniciar atendimento</button>
          <button id="sw-pending" ${!canAct() ? "disabled" : ""}>Pendente</button>
          <button id="sw-complete" ${!canAct() ? "disabled" : ""}>Concluido</button>
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
    if (popup) {
      popup.addEventListener("click", () => showError("Clique no icone da extensao no Chrome para configurar."));
    }

    const start = panel.querySelector("#sw-start");
    if (start) start.addEventListener("click", startAttendance);

    const pending = panel.querySelector("#sw-pending");
    if (pending) {
      pending.addEventListener("click", () => updateConversation("pending", state.assignedTo || config.attendantName));
    }

    const complete = panel.querySelector("#sw-complete");
    if (complete) complete.addEventListener("click", completeAttendance);
  }

  function canAct() {
    return Boolean(config.attendantName && activeChat?.id && !isSendingMessage);
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
    const response = await chrome.runtime.sendMessage({
      type: "api",
      apiUrl: config.apiUrl,
      path,
      method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : undefined
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Erro na API");
    }

    return response.data;
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
      showError(`Nao consegui conectar na API: ${config.apiUrl}`);
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
      showError(`Nao foi possivel salvar na API: ${config.apiUrl}`);
    }
  }

  async function startAttendance() {
    if (!canAct()) return;

    try {
      isSendingMessage = true;
      renderPanel();
      clearError();
      await sendWhatsAppMessage(getWelcomeMessage());
      await updateConversation("assigned", config.attendantName);
    } catch (error) {
      isSendingMessage = false;
      renderPanel();
      showError(error.message || "Nao consegui iniciar o atendimento.");
      return;
    }

    isSendingMessage = false;
    renderPanel();
  }

  async function completeAttendance() {
    if (!canAct()) return;

    try {
      isSendingMessage = true;
      renderPanel();
      clearError();
      await updateConversation("unassigned", "");
      await sendWhatsAppMessage(getClosingMessage());
    } catch (error) {
      isSendingMessage = false;
      renderPanel();
      showError(error.message || "Nao consegui concluir o atendimento.");
      return;
    }

    isSendingMessage = false;
    renderPanel();
  }

  async function sendWhatsAppMessage(message) {
    const input = findMessageInput();
    if (!input) {
      throw new Error("Nao encontrei o campo de mensagem do WhatsApp.");
    }

    input.focus();
    clearMessageInput(input);
    await wait(100);
    insertMessageText(input, message);

    await wait(500);

    const sendButton = findSendButton();
    if (!sendButton) {
      throw new Error("Nao encontrei o botao de enviar do WhatsApp.");
    }

    sendButton.click();
    await wait(300);
  }

  function clearMessageInput(input) {
    const selection = window.getSelection();
    const range = document.createRange();

    input.focus();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand("delete", false, null);
    input.innerHTML = "";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  }

  function insertMessageText(input, message) {
    input.focus();
    document.execCommand("insertText", false, message);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: message }));
  }

  function findMessageInput() {
    const main = document.querySelector("#main");
    if (!main) return null;

    const footer = main.querySelector("footer");
    if (!footer) return null;

    const inputs = Array.from(footer.querySelectorAll("[contenteditable='true'][role='textbox'], [contenteditable='true']"));
    return inputs.find((element) => isVisible(element)) || null;
  }

  function findSendButton() {
    const main = document.querySelector("#main");
    const footer = main?.querySelector("footer");
    if (!footer) return null;

    const labelled = Array.from(footer.querySelectorAll("button, div[role='button']"))
      .find((element) => {
        const label = normalizeText(element.getAttribute("aria-label") || element.getAttribute("title") || "");
        return /enviar|send/i.test(label) && isVisible(element);
      });

    if (labelled) return labelled;

    const buttons = Array.from(footer.querySelectorAll("button, div[role='button']")).filter(isVisible);
    return buttons[buttons.length - 1] || null;
  }

  function startRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshActiveChat();
    refreshTimer = setInterval(refreshActiveChat, REFRESH_MS);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getElementLabel(element) {
    return normalizeText(element.getAttribute("title") || element.textContent || "");
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.attendantName || changes.apiUrl) {
      loadConfig();
    }
  });

  loadConfig();
})();
