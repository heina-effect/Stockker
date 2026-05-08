#!/usr/bin/env node
/**
 * Phase 20 — Supabase pgvector Schema Migration Runner
 * Run: node scripts/migrate-supabase.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://unuzvliqvwzjmjgzlgwy.supabase.co";
// anon key used for connection test; service role used for DDL via Management API
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVudXp2bGlxdnd6am1qZ3psZ3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMjI2MjMsImV4cCI6MjA5MzY5ODYyM30.HaQWnzq67U9Bxj7y_DXCSb8nZhAXzV47E-i9XoZ1t0M";

const client = createClient(SUPABASE_URL, ANON_KEY);

async function checkTables() {
  console.log("\n🔍 Checking existing tables...");
  const tables = ["news_sources", "source_embeddings", "issue_clusters", "embedding_centroids"];
  const results = {};
  for (const t of tables) {
    const { data, error } = await client.from(t).select("id").limit(0);
    results[t] = error ? `❌ MISSING (${error.code})` : "✅ EXISTS";
    console.log(`  ${t}: ${results[t]}`);
  }
  return results;
}

checkTables().then(results => {
  const missing = Object.entries(results).filter(([, v]) => v.includes("❌"));
  if (missing.length > 0) {
    console.log("\n⚠️  Missing tables:", missing.map(([k]) => k).join(", "));
    console.log("\n📋 Please run the SQL in supabase/migrations/001_pgvector_schema.sql");
    console.log("   → Supabase Dashboard > SQL Editor:");
    console.log("   → https://supabase.com/dashboard/project/unuzvliqvwzjmjgzlgwy/sql/new");
  } else {
    console.log("\n✅ All tables exist. Schema is ready!");
  }
}).catch(console.error);
