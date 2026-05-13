import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ENV_PATH = ".env.local";
const CORP_MASTER_PATH = "src/data/dart/corp-master.json";
const CHUNK_SIZE = 500;

const FRIENDLY_NAMES = {
  "000060": "메리츠화재",
  "000810": "삼성화재",
  "005380": "현대차",
  "010120": "LS ELECTRIC",
  "010620": "HD현대미포",
  "030200": "KT",
  "036570": "엔씨소프트",
};

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

function inferMarket(symbol, existingMarket) {
  if (existingMarket === "KOSPI" || existingMarket === "KOSDAQ") return existingMarket;
  return symbol.startsWith("00") ? "KOSPI" : "KOSDAQ";
}

function toStockRows(corpMaster, existingBySymbol) {
  const rows = [];
  for (const row of Object.values(corpMaster)) {
    const symbol = row?.stock_code;
    const corpName = row?.corp_name;
    if (!/^\d{6}$/.test(symbol ?? "") || !corpName) continue;

    const existing = existingBySymbol.get(symbol);
    rows.push({
      symbol,
      name: FRIENDLY_NAMES[symbol] ?? corpName,
      market: inferMarket(symbol, existing?.market),
      sector_tag: existing?.sector_tag ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

async function fetchExistingRows(db) {
  const rows = [];
  for (let from = 0; ; from += CHUNK_SIZE) {
    const { data, error } = await db
      .from("stock_master")
      .select("symbol, market, sector_tag, is_active")
      .range(from, from + CHUNK_SIZE - 1);
    if (error) throw new Error(`stock_master 조회 실패: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < CHUNK_SIZE) break;
  }
  return new Map(rows.map((row) => [row.symbol, row]));
}

async function upsertChunks(db, rows) {
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await db
      .from("stock_master")
      .upsert(chunk, { onConflict: "symbol" });
    if (error) throw new Error(`stock_master upsert 실패: ${error.message}`);
    upserted += chunk.length;
  }
  return upserted;
}

async function deactivateMissingRows(db, corpSymbols) {
  const data = [];
  for (let from = 0; ; from += CHUNK_SIZE) {
    const { data: page, error } = await db
      .from("stock_master")
      .select("symbol, market, is_active")
      .eq("is_active", true)
      .in("market", ["KOSPI", "KOSDAQ"])
      .range(from, from + CHUNK_SIZE - 1);
    if (error) throw new Error(`비활성 후보 조회 실패: ${error.message}`);
    data.push(...(page ?? []));
    if (!page || page.length < CHUNK_SIZE) break;
  }

  const missing = data
    .filter((row) => !corpSymbols.has(row.symbol))
    .map((row) => row.symbol);

  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    const chunk = missing.slice(i, i + CHUNK_SIZE);
    const { error: updateError } = await db
      .from("stock_master")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("symbol", chunk);
    if (updateError) throw new Error(`비활성 처리 실패: ${updateError.message}`);
  }

  return missing.length;
}

async function main() {
  loadEnvFile();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.");
  }

  const corpMaster = JSON.parse(fs.readFileSync(CORP_MASTER_PATH, "utf8"));
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existingBySymbol = await fetchExistingRows(db);
  const rows = toStockRows(corpMaster, existingBySymbol);
  const corpSymbols = new Set(rows.map((row) => row.symbol));
  const upserted = await upsertChunks(db, rows);
  const deactivated = process.argv.includes("--deactivate-missing")
    ? await deactivateMissingRows(db, corpSymbols)
    : 0;

  console.log(`stock_master sync complete: ${upserted} DART rows upserted, ${deactivated} missing rows deactivated`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
