const DEFAULT_API_URL = "http://localhost:3333";

const attendantName = document.getElementById("attendantName");
const apiUrl = document.getElementById("apiUrl");
const save = document.getElementById("save");
const status = document.getElementById("status");

chrome.storage.sync.get(["attendantName", "apiUrl"], (items) => {
  attendantName.value = items.attendantName || "";
  apiUrl.value = items.apiUrl || DEFAULT_API_URL;
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
  });
});

function normalizeApiUrl(value) {
  return value.replace(/\/+$/, "");
}
