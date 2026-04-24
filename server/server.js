const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.PORT || 3333);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "conversations.json");

const app = express();

app.use(cors());
app.use(express.json());

ensureDataFile();

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/conversations", (req, res) => {
  const data = readData();
  const conversations = Object.values(data.conversations).sort((a, b) => {
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });

  res.json(conversations);
});

app.get("/conversations/:id", (req, res) => {
  const data = readData();
  const id = req.params.id;
  const title = req.query.title || id;

  if (!data.conversations[id]) {
    data.conversations[id] = createConversation(id, title);
    writeData(data);
  }

  res.json(data.conversations[id]);
});

app.put("/conversations/:id", (req, res) => {
  const data = readData();
  const id = req.params.id;
  const current = data.conversations[id] || createConversation(id, req.body.title || id);
  const now = new Date().toISOString();

  const next = {
    ...current,
    id,
    title: String(req.body.title || current.title || id),
    status: normalizeStatus(req.body.status),
    assignedTo: String(req.body.assignedTo || ""),
    updatedBy: String(req.body.updatedBy || ""),
    updatedAt: now
  };

  data.conversations[id] = next;
  writeData(data);
  res.json(next);
});

const server = app.listen(PORT, HOST, () => {
  console.log(`API do suporte rodando em http://localhost:${PORT}`);
  getLanAddresses().forEach((address) => {
    console.log(`Para outros computadores: http://${address}:${PORT}`);
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

function createConversation(id, title) {
  const now = new Date().toISOString();

  return {
    id,
    title: String(title || id),
    status: "unassigned",
    assignedTo: "",
    updatedBy: "",
    createdAt: now,
    updatedAt: now
  };
}

function normalizeStatus(status) {
  const allowed = new Set(["unassigned", "pending", "assigned", "resolved"]);
  return allowed.has(status) ? status : "unassigned";
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    writeData({ conversations: {} });
  }
}

function readData() {
  const content = fs.readFileSync(DATA_FILE, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(content);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}
