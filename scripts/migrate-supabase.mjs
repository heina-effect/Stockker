#!/usr/bin/env node
/**
 * Phase 20 — Supabase pgvector Schema Migration Runner
 * Run: node scripts/migrate-supabase.mjs
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ENV_PATH = ".env.local";

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return;
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// anon key used for connection test; service role used for DDL via Management API
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다. .env.local을 확인하세요."
  );
  process.exit(1);
}

const client = createClient(SUPABASE_URL, ANON_KEY);

async function checkTables() {
  console.log("\n🔍 Checking existing tables...");
  const tables = [
    "news_sources", "source_embeddings", "issue_clusters", "embedding_centroids",
    "stock_research_snapshots", "sector_research_snapshots",
    "overnight_screening_records", "overnight_screening_items"
  ];
  const results = {};
  for (const t of tables) {
    const { error } = await client.from(t).select("*").limit(0);
    results[t] = error ? `❌ MISSING (${error.code})` : "✅ EXISTS";
    console.log(`  ${t}: ${results[t]}`);
  }
  return results;
}

checkTables().then(results => {
  const missing = Object.entries(results).filter(([, v]) => v.includes("❌"));
  if (missing.length > 0) {
    console.log("\n⚠️  Missing tables:", missing.map(([k]) => k).join(", "));
    console.log("\n📋 Please run the SQL in supabase/migrations/001_pgvector_schema.sql, 002_research_snapshots.sql, and 003_overnight_screening.sql");
    console.log("   → Supabase Dashboard > SQL Editor:");
    console.log("   → https://supabase.com/dashboard/project/unuzvliqvwzjmjgzlgwy/sql/new");
  } else {
    console.log("\n✅ All tables exist. Schema is ready!");
  }
}).catch(console.error);
