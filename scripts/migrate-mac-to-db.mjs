#!/usr/bin/env node
/**
 * Import Mac desktop localStorage → local Supabase (Docker).
 *
 * Usage:
 *   node scripts/migrate-mac-to-db.mjs
 *   MIGRATE_EMAIL=you@example.com MIGRATE_PASSWORD=secret node scripts/migrate-mac-to-db.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const API_URL = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const EMAIL = process.env.MIGRATE_EMAIL || "meetly@local.dev";
const PASSWORD = process.env.MIGRATE_PASSWORD || "meetly123456";

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

function findLocalStorageDb() {
  const base = path.join(os.homedir(), "Library/WebKit/ai-meeting-recorder/WebsiteData/Default");
  if (!fs.existsSync(base)) throw new Error(`No Tauri WebKit data at ${base}`);
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) stack.push(full);
      else if (name === "localstorage.sqlite3") return full;
    }
  }
  throw new Error("localstorage.sqlite3 not found under WebKit/ai-meeting-recorder");
}

function readZustandState(dbPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "meetly-migrate-"));
  const tmpDb = path.join(tmpDir, "localstorage.sqlite3");
  fs.copyFileSync(dbPath, tmpDb);
  for (const suffix of ["-wal", "-shm"]) {
    const src = dbPath + suffix;
    if (fs.existsSync(src)) fs.copyFileSync(src, tmpDb + suffix);
  }
  try {
    execFileSync("sqlite3", [tmpDb, "PRAGMA wal_checkpoint(FULL);"], { stdio: "ignore" });
  } catch {
    /* ignore */
  }

  const py = `
import sqlite3, json, sys
con = sqlite3.connect(${JSON.stringify(tmpDb)})
out = {}
for key, value in con.execute("SELECT key, value FROM ItemTable"):
    for enc in ("utf-16-le", "utf-8"):
        try:
            s = value.decode(enc)
            if s.lstrip().startswith(("{", "[", '"')):
                out[key] = json.loads(s)
                break
        except Exception:
            pass
json.dump(out, sys.stdout)
`;
  const raw = execFileSync("python3", ["-c", py], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(raw.toString("utf8"));
}

function now() {
  return new Date().toISOString();
}

function projectRow(p, uid, ts) {
  return {
    id: p.id,
    user_id: uid,
    teamspace_id: ts,
    name: p.name,
    emoji: p.emoji ?? "📁",
    color: p.color ?? "#2383e2",
    description: p.description ?? null,
    updated_at: now(),
  };
}

function meetingRow(m, uid, ts) {
  return {
    id: m.id,
    user_id: uid,
    teamspace_id: ts,
    title: m.title,
    emoji: m.emoji ?? "🎙️",
    project_id: m.projectId ?? null,
    started_at: m.startedAt,
    ended_at: m.endedAt ?? null,
    duration_secs: m.durationSecs ?? 0,
    status: m.status === "recording" ? "ready" : m.status,
    participants: m.participants ?? [],
    speakers: m.speakers ?? [],
    transcript: m.transcript ?? [],
    summary: m.summary ?? null,
    action_items: m.actionItems ?? [],
    updated_at: now(),
  };
}

function taskRow(t, uid, ts) {
  return {
    id: t.id,
    user_id: uid,
    teamspace_id: ts,
    project_id: t.projectId ?? null,
    title: t.title,
    status: t.status,
    owner: t.owner ?? null,
    due: t.due ?? null,
    source_meeting_id: t.sourceMeetingId ?? null,
    source_action_item_id: t.sourceActionItemId ?? null,
    updated_at: now(),
  };
}

function usageRow(u, uid, ts) {
  return {
    id: u.id,
    user_id: uid,
    teamspace_id: ts,
    at: u.at,
    provider: u.provider,
    model: u.model,
    kind: u.kind,
    meeting_id: u.meetingId ?? null,
    audio_seconds: u.audioSeconds ?? null,
    input_tokens: u.inputTokens ?? null,
    output_tokens: u.outputTokens ?? null,
    cost_usd: u.costUsd ?? 0,
    estimated: u.estimated ?? false,
  };
}

async function api(method, urlPath, body) {
  const res = await fetch(`${API_URL}${urlPath}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function ensureUser() {
  const listed = await api("GET", "/auth/v1/admin/users?per_page=100");
  const existing = (listed.users || []).find((u) => u.email === EMAIL);
  if (existing) {
    console.log(`Using existing user ${EMAIL} (${existing.id})`);
    return existing.id;
  }
  const created = await api("POST", "/auth/v1/admin/users", {
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  console.log(`Created user ${EMAIL} (${created.id})`);
  console.log(`Password: ${PASSWORD}`);
  return created.id;
}

// Every domain row must belong to a teamspace, or the app's teamspace-scoped
// RLS + queries will never surface it. Create the owner's personal teamspace.
async function ensureTeamspace(uid) {
  const compact = uid.replace(/-/g, "");
  const tsId = `ts-${compact}`;
  const memId = `tm-${compact}`;
  const slug = `workspace-${compact.slice(0, 12)}`;
  await upsert("teamspaces", [
    { id: tsId, name: "My workspace", slug, emoji: "🏢", created_by: uid },
  ]);
  await upsert("teamspace_members", [
    { id: memId, teamspace_id: tsId, user_id: uid, role: "owner", status: "active" },
  ]);
  console.log(`Ensured teamspace ${tsId} for ${uid}`);
  return tsId;
}

async function upsert(table, rows) {
  if (!rows.length) return;
  const res = await fetch(`${API_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`upsert ${table} → ${res.status}: ${await res.text()}`);
}

async function main() {
  loadDotEnv();
  const dbPath = findLocalStorageDb();
  console.log(`Reading Mac data from:\n  ${dbPath}`);
  const store = readZustandState(dbPath);
  const meetingsState = store["meetly-meetings"]?.state;
  const costState = store["meetly-cost-ledger"]?.state;
  if (!meetingsState) throw new Error("meetly-meetings not found in localStorage");

  const projects = meetingsState.projects ?? [];
  const meetings = meetingsState.meetings ?? [];
  const tasks = meetingsState.tasks ?? [];
  const records = costState?.records ?? [];

  console.log(
    `Found ${projects.length} projects, ${meetings.length} meetings, ${tasks.length} tasks, ${records.length} usage records`,
  );

  const uid = await ensureUser();
  const ts = await ensureTeamspace(uid);

  await upsert("projects", projects.map((p) => projectRow(p, uid, ts)));
  console.log(`Upserted ${projects.length} projects`);
  await upsert("meetings", meetings.map((m) => meetingRow(m, uid, ts)));
  console.log(`Upserted ${meetings.length} meetings`);
  await upsert("tasks", tasks.map((t) => taskRow(t, uid, ts)));
  console.log(`Upserted ${tasks.length} tasks`);

  const chunk = 100;
  for (let i = 0; i < records.length; i += chunk) {
    await upsert("usage_records", records.slice(i, i + chunk).map((r) => usageRow(r, uid, ts)));
  }
  console.log(`Upserted ${records.length} usage records`);

  console.log("\nDone. Sign in on web/desktop with:");
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log("Studio: http://127.0.0.1:54323");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
