#!/usr/bin/env node
/**
 * Upload a built Tauri installer to the Supabase "builds" storage bucket.
 *
 * Usage:
 *   node scripts/upload-build.mjs <macos|windows>
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY
 * in the environment (or .env.local) — the service role key is required
 * because the "builds" bucket has no anon/authenticated insert policy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}
loadDotEnv();

const platform = process.argv[2];
if (!["macos", "windows"].includes(platform)) {
  console.error("Usage: node scripts/upload-build.mjs <macos|windows>");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set in .env.local or the environment)."
  );
  process.exit(1);
}

const version = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src-tauri/tauri.conf.json"), "utf8")
).version;

// Where `tauri build` drops installers, per platform/target.
const BUNDLE_DIRS = {
  macos: [
    { dir: "src-tauri/target/release/bundle/dmg", exts: [".dmg"] },
  ],
  windows: [
    { dir: "src-tauri/target/release/bundle/nsis", exts: [".exe"] },
    { dir: "src-tauri/target/release/bundle/msi", exts: [".msi"] },
  ],
};

const files = [];
for (const { dir, exts } of BUNDLE_DIRS[platform]) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const name of fs.readdirSync(abs)) {
    if (exts.includes(path.extname(name))) files.push(path.join(abs, name));
  }
}

if (files.length === 0) {
  console.error(`No installer found for ${platform} under src-tauri/target/release/bundle/. Did the build run?`);
  process.exit(1);
}

// Uses the Storage REST API directly (rather than @supabase/supabase-js) so
// this plain upload script doesn't pull in the realtime client, which needs
// a WebSocket polyfill on Node < 22.
for (const filePath of files) {
  const filename = path.basename(filePath);
  const objectPath = `meetly/${version}/${platform}/${filename}`;
  const body = fs.readFileSync(filePath);

  console.log(`Uploading ${filename} (${(body.length / 1e6).toFixed(1)} MB) -> ${objectPath}`);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/builds/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) {
    console.error(`Upload failed for ${filename}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  console.log(`Done: ${SUPABASE_URL}/storage/v1/object/public/builds/${objectPath}`);
}
