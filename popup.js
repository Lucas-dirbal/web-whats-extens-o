const DEFAULT_API_URL = "http://localhost:3333";

const attendantName = document.getElementById("attendantName");
const apiUrl = document.getElementById("apiUrl");
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

chrome.storage.sync.get(["attendantName", "apiUrl"], (items) => {
  attendantName.value = items.attendantName || "";
  apiUrl.value = items.apiUrl || DEFAULT_API_URL;
  loadConversations();
});

save.addEventListener("click", () => {
  const name = attendantName.value.trim();
  const url = normalizeApiUrl(apiUrl.value.trim() || DEFAULT_API_URL);

  if (!name) {
    status.textContent = "Informe o nome do atendente.";
    status.style.color = "#b42318";
    return;
  }

  chrome.storage.sync.set({ attendantName: name, apiUrl: url }, () => {
    status.textContent = "Configuração salva.";
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

function normalizeApiUrl(value) {
  const normalized = value.replace(/\/+$/, "");
  return normalized.replace("://0.0.0.0:", "://localhost:");
}

async function loadConversations() {
  const url = normalizeApiUrl(apiUrl.value.trim() || DEFAULT_API_URL);

  try {
    const response = await fetch(`${url}/conversations`).catch(e => {
      throw new Error("Não foi possível conectar à API. Verifique se o servidor está rodando.");
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
      const assignedTo = conversation.assignedTo || "Ninguém";

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
