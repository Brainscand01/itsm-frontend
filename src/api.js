// ── ITSM Backend API Service Layer ──────────────────────────
// Backend: https://itsm-backend-delta.vercel.app
// API Key: OlO9agvGA2

import { getToken } from "./auth";

const STORAGE_KEY = "itsm_api_config";

function getConfig() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) { /* ignore */ }
  return { baseUrl: "https://itsm-backend-delta.vercel.app", apiKey: "OlO9agvGA2" };
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
  const h = {
    "Content-Type": "application/json",
    "X-API-Key": key(),
  };
  const token = getToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
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

// ── Agent machines ─────────────────────────────────────────
export async function fetchMachines() {
  const res = await fetch(`${base()}/api/agent/machines`, { headers: headers() });
  return res.json();
}

export async function fetchMachineDetail(machineName) {
  const res = await fetch(`${base()}/api/agent/machines/${encodeURIComponent(machineName)}`, { headers: headers() });
  return res.json();
}

export async function sendAgentCommand(machineName, command, params = {}) {
  const res = await fetch(`${base()}/api/agent/commands`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ machine_name: machineName, command, params }),
  });
  return res.json();
}

// ── Auth ────────────────────────────────────────────────────
export async function apiLogin(email, password) {
  const res = await fetch(`${base()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function apiMe() {
  const res = await fetch(`${base()}/api/auth/me`, {
    headers: headers(),
  });
  return res.json();
}

export async function apiChangePassword(currentPassword, newPassword) {
  const res = await fetch(`${base()}/api/auth/change-password`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  return res.json();
}

// ── Requesters ─────────────────────────────────────────────
export async function fetchRequesters() {
  const res = await fetch(`${base()}/api/requesters`, { headers: headers() });
  return res.json();
}

export async function createRequester(body) {
  const res = await fetch(`${base()}/api/requesters`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateRequester(id, body) {
  const res = await fetch(`${base()}/api/requesters/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteRequester(id) {
  const res = await fetch(`${base()}/api/requesters/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  return res.json();
}

// ── Email Config ───────────────────────────────────────────
export async function fetchEmailConfig() {
  const res = await fetch(`${base()}/api/email/config`, { headers: headers() });
  return res.json();
}

export async function saveEmailConfig(body) {
  const res = await fetch(`${base()}/api/email/config`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function testEmailConnection() {
  const res = await fetch(`${base()}/api/email/test`, {
    method: "POST",
    headers: headers(),
  });
  return res.json();
}

// ── Email Templates ────────────────────────────────────────
export async function fetchEmailTemplates() {
  const res = await fetch(`${base()}/api/email/templates`, { headers: headers() });
  return res.json();
}

export async function updateEmailTemplate(id, body) {
  const res = await fetch(`${base()}/api/email/templates/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Email Log ──────────────────────────────────────────────
export async function fetchEmailLog() {
  const res = await fetch(`${base()}/api/email/log`, { headers: headers() });
  return res.json();
}

// ── AI Usage ──────────────────────────────────────────────
export async function fetchAIUsage() {
  const res = await fetch(`${base()}/api/ai/usage`, { headers: headers() });
  return res.json();
}
