chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "api") return false;

  callApi(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "Erro na API" }));

  return true;
});

async function callApi(message) {
  const apiUrl = normalizeApiUrl(message.apiUrl || "http://localhost:3333");
  const response = await fetch(`${apiUrl}${message.path}`, {
    method: message.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: message.body ? JSON.stringify(message.body) : undefined
  });

  if (!response.ok) {
    throw new Error(`API respondeu ${response.status}`);
  }

  return response.json();
}

function normalizeApiUrl(value) {
  const normalized = String(value || "http://localhost:3333").replace(/\/+$/, "");
  return normalized.replace("://0.0.0.0:", "://localhost:");
}
