const DEFAULT_API_URL = "http://localhost:3333";

const attendantName = document.getElementById("attendantName");
const apiUrl = document.getElementById("apiUrl");
const save = document.getElementById("save");
const status = document.getElementById("status");
const refresh = document.getElementById("refresh");
const conversationList = document.getElementById("conversationList");

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

function normalizeApiUrl(value) {
  return value.replace(/\/+$/, "");
}

async function loadConversations() {
  const url = normalizeApiUrl(apiUrl.value.trim() || DEFAULT_API_URL);

  try {
    const response = await fetch(`${url}/conversations`);

    if (!response.ok) {
      throw new Error(`API respondeu ${response.status}`);
    }

    const conversations = await response.json();
    renderConversations(conversations);
  } catch (error) {
    conversationList.innerHTML = '<p class="empty">API offline ou endereço incorreto.</p>';
  }
}

function renderConversations(conversations) {
  if (!conversations.length) {
    conversationList.innerHTML = '<p class="empty">Nenhuma conversa registrada ainda.</p>';
    return;
  }

  conversationList.innerHTML = conversations
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
