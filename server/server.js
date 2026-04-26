const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { get: getBlob, list: listBlobs, put: putBlob } = require("@vercel/blob");

const PORT = Number(process.env.PORT || 3333);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "conversations.json");
const CONVERSATIONS_PREFIX = "conversations/";

const app = express();

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, max-age=0");
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

app.get("/health", asyncHandler(async (req, res) => {
  const mode = hasBlobStorage() ? "blob" : "file";
  res.json({ ok: true, storage: mode });
}));

app.get("/conversations", asyncHandler(async (req, res) => {
  const conversations = await listConversations();
  res.json(conversations);
}));

app.get("/conversations/:id", asyncHandler(async (req, res) => {
  const id = String(req.params.id || "").trim();

  if (!id) {
    res.status(400).json({ error: "O identificador da conversa e obrigatorio." });
    return;
  }

  const title = String(req.query.title || id);
  const conversation = await getConversation(id, title);
  res.json(conversation);
}));

app.put("/conversations/:id", asyncHandler(async (req, res) => {
  const id = String(req.params.id || "").trim();

  if (!id) {
    res.status(400).json({ error: "O identificador da conversa e obrigatorio." });
    return;
  }

  const current = await getConversation(id, req.body?.title || id);
  const next = mergeConversation(current, id, req.body || {});
  await saveConversation(next);
  res.json(next);
}));

app.use((error, req, res, next) => {
  console.error("Erro na API de suporte:", error);
  res.status(error.statusCode || 500).json({
    error: error.message || "Erro interno na API."
  });
});

module.exports = app;

if (require.main === module) {
  startLocalServer();
}

function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isVercelRuntime() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_URL);
}

function ensureWritableStorage() {
  if (hasBlobStorage() || !isVercelRuntime()) {
    return;
  }

  const error = new Error(
    "A publicacao na Vercel precisa da variavel BLOB_READ_WRITE_TOKEN para salvar conversas."
  );
  error.statusCode = 500;
  throw error;
}

function conversationBlobPath(id) {
  return `${CONVERSATIONS_PREFIX}${encodeURIComponent(id)}.json`;
}

function sortConversations(conversations) {
  return conversations.sort((a, b) => {
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
}

function createConversation(id, title) {
  const now = new Date().toISOString();

  return {
    id: String(id || ""),
    title: String(title || id || ""),
    status: "unassigned",
    assignedTo: "",
    updatedBy: "",
    createdAt: now,
    updatedAt: now,
    lastIncomingMarker: ""
  };
}

function normalizeStatus(status) {
  const allowed = new Set(["unassigned", "pending", "assigned", "resolved"]);
  const normalized = String(status || "").trim().toLowerCase();
  return allowed.has(normalized) ? normalized : "unassigned";
}

function normalizeConversation(conversation, fallbackId, fallbackTitle) {
  const base = conversation || createConversation(fallbackId, fallbackTitle);
  const createdAt = String(base.createdAt || new Date().toISOString());

  return {
    id: String(base.id || fallbackId || ""),
    title: String(base.title || fallbackTitle || fallbackId || ""),
    status: normalizeStatus(base.status),
    assignedTo: String(base.assignedTo || ""),
    updatedBy: String(base.updatedBy || ""),
    createdAt,
    updatedAt: String(base.updatedAt || createdAt),
    lastIncomingMarker: String(base.lastIncomingMarker || "")
  };
}

function mergeConversation(current, id, payload) {
  const now = new Date().toISOString();

  return normalizeConversation(
    {
      ...current,
      id,
      title: String(payload.title || current.title || id),
      status: normalizeStatus(payload.status),
      assignedTo: String(payload.assignedTo || ""),
      updatedBy: String(payload.updatedBy || ""),
      lastIncomingMarker: String(payload.lastIncomingMarker || current.lastIncomingMarker || ""),
      updatedAt: now
    },
    id,
    payload.title || current.title || id
  );
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    await writeLocalData({ conversations: {} });
  }
}

async function readLocalData() {
  await ensureDataFile();

  try {
    const content = (await fs.readFile(DATA_FILE, "utf8")).replace(/^\uFEFF/, "");
    const parsed = JSON.parse(content);
    return {
      conversations: parsed?.conversations && typeof parsed.conversations === "object"
        ? parsed.conversations
        : {}
    };
  } catch (error) {
    console.error("Erro ao ler arquivo de dados, resetando...", error);
    const defaultData = { conversations: {} };
    await writeLocalData(defaultData);
    return defaultData;
  }
}

async function writeLocalData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

async function streamToText(stream) {
  if (!stream) {
    return "";
  }

  if (typeof stream.getReader === "function") {
    return new Response(stream).text();
  }

  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function getBlobJson(pathname) {
  const result = await getBlob(pathname, { access: "private" });

  if (!result || result.statusCode !== 200) {
    return null;
  }

  try {
    return JSON.parse(await streamToText(result.stream));
  } catch (error) {
    return null;
  }
}

async function putBlobJson(pathname, payload) {
  await putBlob(pathname, JSON.stringify(payload, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8"
  });
}

async function listBlobConversations() {
  const result = await listBlobs({ prefix: CONVERSATIONS_PREFIX });
  const items = result?.blobs?.length
    ? await Promise.all(result.blobs.map((blob) => getBlobJson(blob.pathname)))
    : [];

  return sortConversations(
    items
      .filter(Boolean)
      .map((conversation) => normalizeConversation(conversation))
  );
}

async function getBlobConversation(id, title) {
  const current = await getBlobJson(conversationBlobPath(id));

  if (current) {
    return normalizeConversation(current, id, title);
  }

  const created = createConversation(id, title);
  await putBlobJson(conversationBlobPath(id), created);
  return created;
}

async function saveBlobConversation(conversation) {
  await putBlobJson(conversationBlobPath(conversation.id), conversation);
  return conversation;
}

async function listLocalConversations() {
  const data = await readLocalData();
  const conversations = Object.values(data.conversations).map((conversation) =>
    normalizeConversation(conversation)
  );

  return sortConversations(conversations);
}

async function getLocalConversation(id, title) {
  const data = await readLocalData();

  if (!data.conversations[id]) {
    data.conversations[id] = createConversation(id, title);
    await writeLocalData(data);
  }

  return normalizeConversation(data.conversations[id], id, title);
}

async function saveLocalConversation(conversation) {
  const data = await readLocalData();
  data.conversations[conversation.id] = normalizeConversation(
    conversation,
    conversation.id,
    conversation.title
  );
  await writeLocalData(data);
  return data.conversations[conversation.id];
}

async function listConversations() {
  if (hasBlobStorage()) {
    return listBlobConversations();
  }

  return listLocalConversations();
}

async function getConversation(id, title) {
  ensureWritableStorage();

  if (hasBlobStorage()) {
    return getBlobConversation(id, title);
  }

  return getLocalConversation(id, title);
}

async function saveConversation(conversation) {
  ensureWritableStorage();

  if (hasBlobStorage()) {
    return saveBlobConversation(conversation);
  }

  return saveLocalConversation(conversation);
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

function startLocalServer() {
  ensureDataFile()
    .then(() => {
      const server = app.listen(PORT, HOST, () => {
        console.log(`API do suporte rodando em http://localhost:${PORT}`);
        getLanAddresses().forEach((address) => {
          console.log(`Para outros computadores na rede local: http://${address}:${PORT}`);
        });
      });

      server.on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          console.error(`A API ja esta rodando ou a porta ${PORT} esta ocupada.`);
          console.error(`Teste no navegador: http://localhost:${PORT}/health`);
          process.exit(0);
        }

        throw error;
      });
    })
    .catch((error) => {
      console.error("Nao foi possivel iniciar a API local.", error);
      process.exit(1);
    });
}
