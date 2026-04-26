const DEFAULT_API_URL = "https://whatsapp-suporte-api.vercel.app";
const DEFAULT_FEEDBACK_URL = "https://avaliacao-de-atendimento.vercel.app";
const ATTENDANTS = ["Lucas", "Nicolas", "Leandro", "Pedro", "Willian"];
const LEGACY_API_URLS = new Set([
  "http://localhost:3333",
  "http://127.0.0.1:3333"
]);
const LEGACY_FEEDBACK_URLS = new Set([
  "http://127.0.0.1:3000",
  "http://localhost:3000"
]);

const attendantName = document.getElementById("attendantName");
const apiUrl = document.getElementById("apiUrl");
const feedbackUrl = document.getElementById("feedbackUrl");
const save = document.getElementById("save");
const status = document.getElementById("status");
const refresh = document.getElementById("refresh");
const conversationList = document.getElementById("conversationList");
const filterButtons = Array.from(document.querySelectorAll(".filter"));
let conversationsCache = [];
let activeFilter = "all";

const statusLabels = {
  unassigned: "Sem atendente",
  pending: "Pendente",
  assigned: "Em atendimento",
  resolved: "Resolvida"
};

renderAttendantOptions();

chrome.storage.sync.get(["attendantName", "apiUrl", "feedbackUrl"], (items) => {
  const nextApiUrl = normalizeStoredUrl(items.apiUrl, DEFAULT_API_URL, LEGACY_API_URLS);
  const nextFeedbackUrl = normalizeStoredUrl(items.feedbackUrl, DEFAULT_FEEDBACK_URL, LEGACY_FEEDBACK_URLS);
  const nextAttendantName = normalizeAttendantName(items.attendantName);

  attendantName.value = nextAttendantName;
  apiUrl.value = nextApiUrl;
  feedbackUrl.value = nextFeedbackUrl;

  if (
    items.attendantName !== nextAttendantName ||
    items.apiUrl !== nextApiUrl ||
    items.feedbackUrl !== nextFeedbackUrl
  ) {
    chrome.storage.sync.set({
      attendantName: nextAttendantName,
      apiUrl: nextApiUrl,
      feedbackUrl: nextFeedbackUrl
    });
  }

  loadConversations();
});

save.addEventListener("click", () => {
  const name = normalizeAttendantName(attendantName.value);
  const url = normalizeApiUrl(apiUrl.value.trim() || DEFAULT_API_URL);
  const siteUrl = normalizeFeedbackUrl(feedbackUrl.value.trim() || DEFAULT_FEEDBACK_URL);

  if (!name) {
    status.textContent = "Selecione o atendente.";
    status.style.color = "#b42318";
    return;
  }

  chrome.storage.sync.set({ attendantName: name, apiUrl: url, feedbackUrl: siteUrl }, () => {
    status.textContent = "Configuracao salva.";
    status.style.color = "#0b6b4f";
    loadConversations();
  });
});

refresh.addEventListener("click", loadConversations);
filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter || "all";
    updateFilterButtons();
    renderConversations(conversationsCache);
  });
});

function renderAttendantOptions() {
  attendantName.innerHTML = [
    '<option value="">Selecione um atendente</option>',
    ...ATTENDANTS.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
  ].join("");
}

function normalizeUrl(value, fallbackUrl) {
  const normalized = String(value || fallbackUrl).trim().replace(/\/+$/, "");
  return normalized.replace("://0.0.0.0:", "://localhost:");
}

function normalizeAttendantName(value) {
  const normalized = String(value || "").trim();
  return ATTENDANTS.includes(normalized) ? normalized : "";
}

function normalizeApiUrl(value) {
  return normalizeUrl(value, DEFAULT_API_URL);
}

function normalizeFeedbackUrl(value) {
  return normalizeUrl(value, DEFAULT_FEEDBACK_URL);
}

function normalizeStoredUrl(value, fallbackUrl, legacyUrls) {
  const normalized = normalizeUrl(value || fallbackUrl, fallbackUrl);
  return legacyUrls.has(normalized) ? fallbackUrl : normalized;
}

async function loadConversations() {
  const url = normalizeApiUrl(apiUrl.value.trim() || DEFAULT_API_URL);

  try {
    const response = await fetch(`${url}/conversations`).catch(() => {
      throw new Error("Nao foi possivel conectar a API. Verifique a URL configurada.");
    });

    if (!response.ok) {
      throw new Error(`API respondeu com erro ${response.status}`);
    }

    conversationsCache = await response.json();
    renderConversations(conversationsCache);
  } catch (error) {
    conversationsCache = [];
    conversationList.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

function renderConversations(conversations) {
  const filteredConversations = filterConversations(conversations);

  if (!filteredConversations.length) {
    conversationList.innerHTML = '<p class="empty">Nenhuma conversa registrada ainda.</p>';
    return;
  }

  conversationList.innerHTML = filteredConversations
    .slice(0, 20)
    .map((conversation) => {
      const status = conversation.status || "unassigned";
      const assignedTo = conversation.assignedTo || "Ninguem";

      return `
        <article class="conversation">
          <p class="conversation-title">${escapeHtml(conversation.title || conversation.id)}</p>
          <p class="conversation-meta">
            <span class="badge ${escapeHtml(status)}">${escapeHtml(statusLabels[status] || status)}</span>
            ${escapeHtml(assignedTo)}
          </p>
        </article>
      `;
    })
    .join("");
}

function filterConversations(conversations) {
  if (activeFilter === "all") return conversations;

  return conversations.filter((conversation) => {
    return (conversation.status || "unassigned") === activeFilter;
  });
}

function updateFilterButtons() {
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === activeFilter);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
