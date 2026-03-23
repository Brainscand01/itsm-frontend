// ── ITSM Backend API Service Layer ──────────────────────────
// Backend: https://itsmbackend.vercel.app
// API Key: OlO9agvGA2

const STORAGE_KEY = "itsm_api_config";

function getConfig() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) { /* ignore */ }
  return { baseUrl: "https://itsmbackend.vercel.app", apiKey: "OlO9agvGA2" };
}

export function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function loadConfig() {
  return getConfig();
}

function base() { return getConfig().baseUrl; }
function key()  { return getConfig().apiKey; }

function headers() {
  return {
    "Content-Type": "application/json",
    "X-API-Key": key(),
  };
}

// ── Field mapping ───────────────────────────────────────────
// Frontend short names → backend full names
const FIELD_MAP_TO_BACKEND = {
  cat: "category",
  pri: "priority",
  st: "status",
  cls: "classification",
  grp: "group_type",
  user: "user_name",
  mac: "machine_name",
  ip: "ip_address",
  asgn: "assignee",
  created: "created_at",
};

// Backend full names → frontend short names
const FIELD_MAP_FROM_BACKEND = {};
for (const [k, v] of Object.entries(FIELD_MAP_TO_BACKEND)) {
  FIELD_MAP_FROM_BACKEND[v] = k;
}

export function toBackend(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const mapped = FIELD_MAP_TO_BACKEND[k] || k;
    out[mapped] = v;
  }
  return out;
}

export function fromBackend(obj) {
  if (!obj) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const mapped = FIELD_MAP_FROM_BACKEND[k] || k;
    out[mapped] = v;
  }
  return out;
}

function fromBackendArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(fromBackend);
}

// ── Tickets ─────────────────────────────────────────────────
export async function fetchTickets() {
  const res = await fetch(`${base()}/api/tickets`);
  const json = await res.json();
  if (json.data) json.data = fromBackendArray(json.data);
  return json;
}

export async function fetchTicket(id) {
  const res = await fetch(`${base()}/api/tickets/${id}`);
  const json = await res.json();
  if (json.data) json.data = fromBackend(json.data);
  return json;
}

export async function createTicket(body) {
  const res = await fetch(`${base()}/api/tickets`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(toBackend(body)),
  });
  const json = await res.json();
  if (json.data) json.data = fromBackend(json.data);
  return json;
}

export async function updateTicket(id, patch) {
  const res = await fetch(`${base()}/api/tickets/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(toBackend(patch)),
  });
  const json = await res.json();
  if (json.data) json.data = fromBackend(json.data);
  return json;
}

export async function deleteTicket(id) {
  const res = await fetch(`${base()}/api/tickets/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  return res.json();
}

// ── Notes ───────────────────────────────────────────────────
export async function fetchNotes(id) {
  const res = await fetch(`${base()}/api/tickets/${id}/notes`);
  return res.json();
}

export async function addNote(id, body) {
  const res = await fetch(`${base()}/api/tickets/${id}/notes`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function fetchInternalNotes(id) {
  const res = await fetch(`${base()}/api/tickets/${id}/internal-notes`, {
    headers: headers(),
  });
  return res.json();
}

export async function addInternalNote(id, body) {
  const res = await fetch(`${base()}/api/tickets/${id}/internal-notes`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Health ──────────────────────────────────────────────────
export async function fetchHealth() {
  const res = await fetch(`${base()}/api/health`);
  return res.json();
}

export async function fetchHealthEvents() {
  const res = await fetch(`${base()}/api/health/events`);
  return res.json();
}

// ── Agent payloads ──────────────────────────────────────────
export async function fetchAgentPayloads(ticketId) {
  const res = await fetch(`${base()}/api/agent/payload?ticket_id=${ticketId}`, {
    headers: headers(),
  });
  return res.json();
}
