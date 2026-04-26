const DEFAULT_API_URL = "https://whatsapp-suporte-api.vercel.app";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "api") return false;

  callApi(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "Erro na API" }));

  return true;
});

async function callApi(message) {
  const apiUrl = normalizeApiUrl(message.apiUrl || DEFAULT_API_URL);
  const response = await fetch(buildRequestUrl(apiUrl, message.path), {
    method: message.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: message.body ? JSON.stringify(message.body) : undefined
  });

  if (!response.ok) {
    throw new Error(await buildApiError(response));
  }

  return response.json();
}

function normalizeApiUrl(value) {
  const normalized = String(value || DEFAULT_API_URL).replace(/\/+$/, "");
  return normalized.replace("://0.0.0.0:", "://localhost:");
}

function buildRequestUrl(baseUrl, path) {
  return new URL(path || "/", `${baseUrl}/`).toString();
}

async function buildApiError(response) {
  const fallback = `API respondeu ${response.status}`;

  try {
    const text = await response.text();
    if (!text) return fallback;

    try {
      const payload = JSON.parse(text);
      return payload?.error || fallback;
    } catch (error) {
      return `${fallback}: ${text}`;
    }
  } catch (error) {
    return fallback;
  }
}
