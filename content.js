(function () {
  if (window.__swSupportExtensionLoaded) return;
  window.__swSupportExtensionLoaded = true;

  const DEFAULT_API_URL = "http://localhost:3333";
  const REFRESH_MS = 3000;
  const PANEL_POSITION_KEY = "sw-panel-position";

  let config = { attendantName: "", apiUrl: DEFAULT_API_URL };
  let activeChat = null;
  let activeState = null;
  let collapsed = false;
  let refreshTimer = null;
  let isSendingMessage = false;
  let messageDraft = "";
  let uiError = "";
  const resolvedIncomingMarkers = new Map();
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let panelPosition = { top: "auto", right: "16px", bottom: "16px", left: "auto" };

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

  function formatAttendantMessage(messageLines) {
    const lines = Array.isArray(messageLines) ? messageLines : [messageLines];
    return [`*${config.attendantName}:*`, "", ...lines];
  }

  function getWelcomeMessage() {
    return formatAttendantMessage("Seja bem-vindo(a) à Interface Sistemas Inteligentes! Estou à disposição para ajudá-lo(a).");
  }

  function getClosingMessage() {
    return formatAttendantMessage([
      "Atendimento concluído.",
      "Agradecemos seu contato e a confiança na Interface Sistemas Inteligentes. Sempre que precisar, estamos à disposição."
    ]);
  }

  function getInactivityClosingMessage() {
    return formatAttendantMessage("Atendimento encerrado devido à ausência de retorno. Caso precise de suporte, estaremos à disposição.");
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
    const header = main?.querySelector("header");
    if (!header) return "";

    const headerRect = header.getBoundingClientRect();
    const candidates = Array.from(header.querySelectorAll("span[title], span[dir='auto']"))
      .map((element) => ({ element, text: getElementLabel(element) }))
      .filter(({ element, text }) => {
        if (!text) return false;
        if (ignoredHeaderTexts.has(text.toLowerCase())) return false;
        return isVisible(element);
      });

    const leftSide = candidates.find(({ element }) => {
      const rect = element.getBoundingClientRect();
      return rect.left < headerRect.left + headerRect.width / 2;
    });

    return leftSide?.text || candidates[0]?.text || "";
  }

  function getChatId(title) {
    return String(title || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function ensurePanel() {
    let panel = document.getElementById("sw-panel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "sw-panel";
    document.body.appendChild(panel);
    
    loadPanelPosition();
    setupDragListeners(panel);
    
    return panel;
  }

  function loadPanelPosition() {
    try {
      const saved = localStorage.getItem(PANEL_POSITION_KEY);
      if (saved) {
        panelPosition = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Erro ao carregar posição do painel:", e);
    }
  }

  function savePanelPosition() {
    try {
      localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(panelPosition));
    } catch (e) {
      console.warn("Erro ao salvar posição do painel:", e);
    }
  }

  function setupDragListeners(panel) {
    const header = panel.querySelector(".sw-header");
    if (!header) return;

    header.style.cursor = "grab";

    header.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      
      isDragging = true;
      header.style.cursor = "grabbing";
      
      const rect = panel.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
    });
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
    const errorClass = uiError ? "sw-error" : "sw-error sw-hidden";

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
          <button id="sw-complete" ${!canAct() ? "disabled" : ""}>Concluído</button>
          <button class="danger" id="sw-finish" ${!canAct() ? "disabled" : ""}>Finalizar atendimento</button>
          <button class="danger" id="sw-finish-inactivity" ${!canAct() ? "disabled" : ""}>Finalizar por Inatividade</button>
        </div>
        <div class="sw-message-section">
          <label class="sw-label" for="sw-message">Mensagem</label>
          <textarea id="sw-message" class="sw-textarea" placeholder="Digite sua mensagem..." ${!canAct() ? "disabled" : ""}>${escapeHtml(messageDraft)}</textarea>
          <button id="sw-send-message" class="sw-send-btn" ${!canAct() ? "disabled" : ""}>Enviar com atendente</button>
        </div>
        <div id="sw-error" class="${errorClass}">${escapeHtml(uiError)}</div>
      </div>
      <div class="${footerClass}">
        <button id="sw-refresh">Atualizar</button>
        <button id="sw-open-popup">Configurar</button>
      </div>
    `;

    // Aplicar posição salva
    applyPanelPosition(panel);

    panel.querySelector("#sw-toggle").addEventListener("click", () => {
      collapsed = !collapsed;
      renderPanel();
    });

    panel.querySelector("#sw-refresh")?.addEventListener("click", refreshActiveChat);
    panel.querySelector("#sw-open-popup")?.addEventListener("click", () => {
      showError("Clique no ícone da extensão no Chrome para configurar.");
    });
    panel.querySelector("#sw-start")?.addEventListener("click", startAttendance);
    panel.querySelector("#sw-pending")?.addEventListener("click", markPendingAttendance);
    panel.querySelector("#sw-complete")?.addEventListener("click", resolveAttendance);
    panel.querySelector("#sw-finish")?.addEventListener("click", finishAttendance);
    panel.querySelector("#sw-finish-inactivity")?.addEventListener("click", finishAttendanceByInactivity);
    panel.querySelector("#sw-send-message")?.addEventListener("click", sendCustomMessage);
    panel.querySelector("#sw-message")?.addEventListener("input", (event) => {
      messageDraft = event.target.value;
    });

    setupDragListeners(panel);
  }

  function applyPanelPosition(panel) {
    panel.style.position = "fixed";
    panel.style.top = panelPosition.top;
    panel.style.right = panelPosition.right;
    panel.style.bottom = panelPosition.bottom;
    panel.style.left = panelPosition.left;
  }

  function canAct() {
    return Boolean(config.attendantName && activeChat?.id && !isSendingMessage);
  }

  function showError(message) {
    uiError = message;
    const error = document.getElementById("sw-error");
    if (!error) return;
    error.textContent = message;
    error.classList.remove("sw-hidden");
  }

  function clearError() {
    uiError = "";
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
      body: options.body ? (typeof options.body === "string" ? JSON.parse(options.body) : options.body) : undefined
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Erro na API");
    }

    return response.data;
  }

  async function refreshActiveChat() {
    const title = getChatTitle();
    const id = getChatId(title);
    let shouldRender = false;

    if (!id) {
      const hadActiveChat = Boolean(activeChat || activeState || uiError);
      try {
        clearError();
        shouldRender = await moveUnreadResolvedChatsToPending();
      } catch (error) {
        showError(`Não consegui conectar na API: ${config.apiUrl}`);
        shouldRender = true;
      }

      activeChat = null;
      activeState = null;
      if (hadActiveChat || shouldRender) renderPanel();
      return;
    }

    shouldRender = activeChat?.id !== id || activeChat?.title !== title;
    const previousState = JSON.stringify(activeState);
    const previousError = uiError;
    activeChat = { id, title };

    try {
      clearError();
      shouldRender = (await moveUnreadResolvedChatsToPending()) || shouldRender;
      const nextState = await api(`/conversations/${encodeURIComponent(id)}?title=${encodeURIComponent(title)}`);
      shouldRender = shouldRender || previousState !== JSON.stringify(nextState) || Boolean(previousError);
      activeState = nextState;
      shouldRender = (await moveResolvedChatToPendingOnIncomingMessage()) || shouldRender;
    } catch (error) {
      activeState = { status: "unassigned" };
      showError(`Não consegui conectar na API: ${config.apiUrl}`);
      shouldRender = true;
    }

    if (shouldRender) renderPanel();
  }

  async function updateConversation(status, assignedTo) {
    if (!activeChat?.id) return;

    try {
      clearError();
      activeState = await api(`/conversations/${encodeURIComponent(activeChat.id)}`, {
        method: "PUT",
        body: {
          title: activeChat.title,
          status,
          assignedTo,
          updatedBy: config.attendantName,
          lastIncomingMarker: status === "resolved" ? getLatestIncomingMessageMarker() : activeState?.lastIncomingMarker
        }
      });
      if (status === "pending") {
        await markActiveChatAsUnread();
      }
      rememberResolvedIncomingMarker(status);
      renderPanel();
    } catch (error) {
      showError(`Não foi possível salvar na API: ${config.apiUrl}`);
    }
  }

  async function markPendingAttendance() {
    if (!canAct()) return;

    await updateConversation("pending", activeState?.assignedTo || config.attendantName);
  }

  async function moveUnreadResolvedChatsToPending() {
    const unreadChats = getUnreadChatListChats();
    if (!unreadChats.length) return false;

    const conversations = await api("/conversations");
    const conversationsById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
    let changedActiveChat = false;

    for (const unreadChat of unreadChats) {
      const conversation = conversationsById.get(unreadChat.id);
      if (conversation?.status !== "resolved") continue;

      const nextState = await api(`/conversations/${encodeURIComponent(unreadChat.id)}`, {
        method: "PUT",
        body: {
          title: unreadChat.title,
          status: "pending",
          assignedTo: "",
          updatedBy: config.attendantName || "cliente",
          lastIncomingMarker: unreadChat.marker
        }
      });

      if (activeChat?.id === unreadChat.id) {
        activeState = nextState;
        changedActiveChat = true;
      }
    }

    return changedActiveChat;
  }

  async function moveResolvedChatToPendingOnIncomingMessage() {
    if (!activeChat?.id || activeState?.status !== "resolved") {
      return false;
    }

    const currentMarker = getLatestIncomingMessageMarker();
    if (!currentMarker) return false;

    const previousMarker = resolvedIncomingMarkers.get(activeChat.id) || activeState.lastIncomingMarker;
    if (!previousMarker) {
      resolvedIncomingMarkers.set(activeChat.id, currentMarker);
      return false;
    }

    if (previousMarker === currentMarker) {
      return false;
    }

    resolvedIncomingMarkers.set(activeChat.id, currentMarker);
    activeState = await api(`/conversations/${encodeURIComponent(activeChat.id)}`, {
      method: "PUT",
      body: {
        title: activeChat.title,
        status: "pending",
        assignedTo: "",
        updatedBy: config.attendantName || "cliente",
        lastIncomingMarker: currentMarker
      }
    });
    await markActiveChatAsUnread();

    return true;
  }

  function rememberResolvedIncomingMarker(status) {
    if (!activeChat?.id) return;

    if (status !== "resolved") {
      resolvedIncomingMarkers.delete(activeChat.id);
      return;
    }

    const marker = getLatestIncomingMessageMarker();
    if (marker) {
      resolvedIncomingMarkers.set(activeChat.id, marker);
    }
  }

  async function startAttendance() {
    if (!canAct()) return;

    await runSendingAction(async () => {
      await sendWhatsAppMessage(getWelcomeMessage());
      await updateConversation("assigned", config.attendantName);
    }, "Não consegui iniciar o atendimento.");
  }

  async function resolveAttendance() {
    if (!canAct()) return;

    await updateConversation("resolved", config.attendantName);
  }

  async function finishAttendance() {
    if (!canAct()) return;

    await runSendingAction(async () => {
      await sendWhatsAppMessage(getClosingMessage());
      await updateConversation("resolved", config.attendantName);
    }, "Não consegui concluir o atendimento.");
  }

  async function finishAttendanceByInactivity() {
    if (!canAct()) return;

    await runSendingAction(async () => {
      await sendWhatsAppMessage(getInactivityClosingMessage());
      await updateConversation("unassigned", "");
    }, "Não consegui finalizar por inatividade.");
  }

  async function sendCustomMessage() {
    if (!canAct()) return;

    const textarea = document.getElementById("sw-message");
    if (!textarea) return;

    const userMessage = textarea.value.trim();
    if (!userMessage) {
      showError("Digite uma mensagem antes de enviar.");
      return;
    }

    await runSendingAction(async () => {
      const fullMessage = formatAttendantMessage(userMessage.split(/\r?\n/));
      await sendWhatsAppMessage(fullMessage);
      messageDraft = "";
    }, "Não consegui enviar a mensagem.");
  }

  async function runSendingAction(action, fallbackMessage) {
    try {
      isSendingMessage = true;
      renderPanel();
      clearError();
      await action();
    } catch (error) {
      showError(error.message || fallbackMessage);
    } finally {
      isSendingMessage = false;
      renderPanel();
    }
  }

  async function sendWhatsAppMessage(message) {
    const messageLines = normalizeOutgoingMessageLines(message);
    const input = findMessageInput();

    if (!input) {
      throw new Error("Não encontrei o campo de mensagem do WhatsApp.");
    }

    clearMessageInput(input);
    await wait(120);
    await insertMessageText(input, messageLines);
    await wait(350);
    await fixDuplicatedDraft(input, messageLines);
    await wait(150);

    const sendButton = findSendButton();
    if (!sendButton) {
      throw new Error("Não encontrei o botão de enviar do WhatsApp.");
    }

    sendButton.click();
    await wait(300);
  }

  function clearMessageInput(input) {
    input.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand("delete", false, null);
    input.innerHTML = "";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  }

  async function insertMessageText(input, lines) {
    input.focus();
    const message = lines.join("\n");

    if (pasteMessageText(input, message)) {
      await wait(120);
      if (draftMatchesMessage(input, message)) return;
      clearMessageInput(input);
    }

    setMessageText(input, lines);
  }

  function pasteMessageText(input, message) {
    try {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", message);

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData
      });

      input.dispatchEvent(pasteEvent);
      return true;
    } catch (error) {
      return false;
    }
  }

  function setMessageText(input, lines) {
    input.focus();
    input.textContent = "";

    lines.forEach((line, index) => {
      if (index > 0) {
        input.appendChild(document.createElement("br"));
      }

      input.appendChild(document.createTextNode(line));
    });

    placeCaretAtEnd(input);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: lines.join("\n") }));
  }

  async function fixDuplicatedDraft(input, messageLines) {
    const message = messageLines.join("\n");
    const currentText = normalizeOutgoingMessage(getDraftText(input));

    if (!isDuplicatedDraft(currentText, message)) return;

    clearMessageInput(input);
    await insertMessageText(input, messageLines);
  }

  function draftMatchesMessage(input, message) {
    const draftText = normalizeOutgoingMessage(getDraftText(input));
    return draftText === normalizeOutgoingMessage(message);
  }

  function getDraftText(input) {
    return input.innerText || input.textContent || "";
  }

  function placeCaretAtEnd(element) {
    const range = document.createRange();
    const selection = window.getSelection();

    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function isDuplicatedDraft(currentText, message) {
    if (currentText === message) return false;
    if (currentText === `${message}${message}`) return true;
    if (currentText === `${message}\n${message}`) return true;
    if (!currentText.endsWith(message)) return false;

    const firstCopy = currentText.slice(0, -message.length).trim();
    return firstCopy === message || message.endsWith(firstCopy);
  }

  function findMessageInput() {
    const footer = document.querySelector("#main footer");
    if (!footer) return null;

    const inputs = Array.from(footer.querySelectorAll("[contenteditable='true'][role='textbox'], [contenteditable='true']"));
    return inputs.find((element) => isVisible(element)) || null;
  }

  function findSendButton() {
    const footer = document.querySelector("#main footer");
    if (!footer) return null;

    const sendIcon = footer.querySelector("span[data-icon='send']");
    if (sendIcon) {
      return sendIcon.closest("button, div[role='button']");
    }

    const labelled = Array.from(footer.querySelectorAll("button, div[role='button']")).find((element) => {
      const label = normalizeText(element.getAttribute("aria-label") || element.getAttribute("title") || "");
      return /enviar|send/i.test(label) && isVisible(element);
    });

    if (labelled) return labelled;

    const buttons = Array.from(footer.querySelectorAll("button, div[role='button']")).filter(isVisible);
    return buttons[buttons.length - 1] || null;
  }

  async function markActiveChatAsUnread() {
    if (!activeChat?.title) return false;

    const row = findChatListRowByTitle(activeChat.title);
    if (row && hasUnreadIndicator(row)) return true;

    if (row && await markChatListRowAsUnread(row)) return true;

    return triggerMarkUnreadShortcut();
  }

  function findChatListRowByTitle(title) {
    const pane = document.querySelector("#pane");
    if (!pane) return null;

    const id = getChatId(title);
    return getChatListRows(pane).find((row) => getChatId(getChatListRowTitle(row)) === id) || null;
  }

  async function markChatListRowAsUnread(row) {
    row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
    row.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, view: window }));
    await wait(150);

    const menuButton = findChatListRowMenuButton(row);
    if (menuButton) {
      menuButton.click();
      await wait(250);

      if (clickOpenMenuItem(/marcar como n[aã]o lida|mark as unread/i)) {
        await wait(200);
        return true;
      }
    }

    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, view: window }));
    await wait(250);

    if (clickOpenMenuItem(/marcar como n[aã]o lida|mark as unread/i)) {
      await wait(200);
      return true;
    }

    return false;
  }

  function findChatListRowMenuButton(row) {
    const explicitButton = Array.from(row.querySelectorAll("button, [role='button']"))
      .find((element) => {
        const label = normalizeText(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`).toLowerCase();
        return /menu|mais op[cç][oõ]es|more options|chat menu/.test(label) && isVisible(element);
      });

    if (explicitButton) return explicitButton;

    const icon = row.querySelector("span[data-icon='down-context'], span[data-icon='chevron-down'], span[data-icon='menu']");
    return icon?.closest("button, [role='button'], div") || null;
  }

  function clickOpenMenuItem(pattern) {
    const menuItems = Array.from(document.querySelectorAll("[role='menuitem'], li, div[role='button']"))
      .filter(isVisible);

    const item = menuItems.find((element) => pattern.test(normalizeText(element.innerText || element.textContent || "").toLowerCase()));
    if (!item) return false;

    item.click();
    return true;
  }

  function triggerMarkUnreadShortcut() {
    const options = {
      key: "U",
      code: "KeyU",
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      altKey: true,
      shiftKey: true
    };

    document.dispatchEvent(new KeyboardEvent("keydown", options));
    window.dispatchEvent(new KeyboardEvent("keydown", options));
    return false;
  }

  function getLatestIncomingMessageMarker() {
    const main = document.querySelector("#main");
    if (!main) return "";

    const incomingMessages = Array.from(main.querySelectorAll(".message-in")).filter(isVisible);
    const latestMessage = incomingMessages[incomingMessages.length - 1];
    if (!latestMessage) return "";

    const idElement = latestMessage.matches("[data-id]")
      ? latestMessage
      : latestMessage.querySelector("[data-id]");
    const messageId = idElement?.getAttribute("data-id") || "";
    const messageText = normalizeText(latestMessage.innerText || latestMessage.textContent || "");
    const messageTime = getMessageTime(latestMessage);

    return [messageId, messageText, messageTime].filter(Boolean).join("|");
  }

  function getMessageTime(messageElement) {
    const timeElement = messageElement.querySelector("[data-pre-plain-text], .copyable-text");
    const plainText = timeElement?.getAttribute("data-pre-plain-text") || "";
    if (plainText) return plainText;

    const visibleText = messageElement.innerText || "";
    const match = visibleText.match(/\b\d{1,2}:\d{2}\b/);
    return match ? match[0] : "";
  }

  function getUnreadChatListChats() {
    const pane = document.querySelector("#pane");
    if (!pane) return [];

    return getChatListRows(pane)
      .map((row) => {
        const title = getChatListRowTitle(row);
        if (!title || !hasUnreadIndicator(row)) return null;

        return {
          id: getChatId(title),
          title,
          marker: getChatListRowMarker(row)
        };
      })
      .filter(Boolean);
  }

  function getChatListRows(pane) {
    const rows = Array.from(pane.querySelectorAll("[role='row'], [role='listitem']"));
    if (rows.length) return rows.filter(isVisible);

    return Array.from(pane.querySelectorAll("div"))
      .filter((element) => {
        const title = getChatListRowTitle(element);
        return title && isVisible(element);
      });
  }

  function getChatListRowTitle(row) {
    const candidates = Array.from(row.querySelectorAll("span[title]"))
      .map((element) => getElementLabel(element))
      .filter((text) => text && !ignoredHeaderTexts.has(text.toLowerCase()));

    return candidates[0] || "";
  }

  function hasUnreadIndicator(row) {
    const labelledUnread = Array.from(row.querySelectorAll("[aria-label], [title]")).some((element) => {
      const label = normalizeText(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`).toLowerCase();
      return /n[aã]o lida|não lidas|unread|unread message|mensage(ns|m)? n[aã]o lida/.test(label);
    });

    if (labelledUnread) return true;

    return Array.from(row.querySelectorAll("span, div"))
      .filter(isVisible)
      .some((element) => {
        const text = normalizeText(element.textContent || "");
        return /^\d{1,3}$/.test(text) && !isLikelyChatTime(element);
      });
  }

  function isLikelyChatTime(element) {
    const text = normalizeText(element.textContent || "");
    if (/\d{1,2}:\d{2}/.test(text)) return true;

    const label = normalizeText(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`).toLowerCase();
    return /hora|time|data|date/.test(label);
  }

  function getChatListRowMarker(row) {
    const title = getChatListRowTitle(row);
    const unreadText = Array.from(row.querySelectorAll("[aria-label], span, div"))
      .map((element) => normalizeText(element.getAttribute("aria-label") || element.textContent || ""))
      .find((text) => /n[aã]o lida|unread|^\d{1,3}$/.test(text.toLowerCase())) || "";
    const rowText = normalizeText(row.innerText || row.textContent || "");

    return [title, unreadText, rowText].filter(Boolean).join("|");
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

  function normalizeOutgoingMessageLines(value) {
    const rawLines = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);

    return rawLines.map((line) => {
      return String(line || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
    });
  }

  function normalizeOutgoingMessage(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .trim();
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Listeners de drag
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const panel = document.getElementById("sw-panel");
    if (!panel) return;

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    panel.style.left = `${newX}px`;
    panel.style.top = `${newY}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";

    panelPosition = {
      top: `${newY}px`,
      left: `${newX}px`,
      right: "auto",
      bottom: "auto"
    };
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      const header = document.querySelector("#sw-panel .sw-header");
      if (header) header.style.cursor = "grab";
      savePanelPosition();
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.attendantName || changes.apiUrl) {
      loadConfig();
    }
  });

  loadConfig();
})();
