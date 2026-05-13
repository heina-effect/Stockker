import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ENV_PATH = ".env.local";
const CORP_MASTER_PATH = "src/data/dart/corp-master.json";
const PAGE_SIZE = 500;

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

function corpNameBySymbol() {
  const corpMaster = JSON.parse(fs.readFileSync(CORP_MASTER_PATH, "utf8"));
  const map = new Map();
  for (const row of Object.values(corpMaster)) {
    if (/^\d{6}$/.test(row?.stock_code ?? "") && row?.corp_name) {
      map.set(row.stock_code, row.corp_name);
    }
  }
  return map;
}

function addIssue(issues, severity, code, message) {
  issues.push({ severity, code, message });
}

async function selectAll(db, table, columns, configure = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const query = configure(db.from(table).select(columns)).range(from, from + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  loadEnvFile();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.");
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const dartNames = corpNameBySymbol();
  const issues = [];

  const stocks = await selectAll(
    db,
    "stock_master",
    "symbol, name, market, sector_tag, is_active",
    (query) => query.eq("is_active", true)
  );
  const sectors = await selectAll(
    db,
    "sector_master",
    "sector_id, member_symbols, representative_symbols, is_active",
    (query) => query.eq("is_active", true)
  );

  const activeStocks = stocks;
  const stockSymbols = new Set(activeStocks.map((row) => row.symbol));

  for (const row of activeStocks) {
    if ((row.market === "KOSPI" || row.market === "KOSDAQ") && !dartNames.has(row.symbol)) {
      addIssue(issues, "warning", "active_stock_missing_in_dart", `${row.symbol} ${row.name} is active but absent from local DART corp-master`);
    }
  }

  for (const sector of sectors) {
    for (const symbol of sector.member_symbols ?? []) {
      if (!stockSymbols.has(symbol) && !dartNames.has(symbol)) {
        addIssue(issues, "error", "sector_member_unknown_symbol", `${sector.sector_id} includes unknown member ${symbol}`);
      }
    }
    for (const symbol of sector.representative_symbols ?? []) {
      if (!(sector.member_symbols ?? []).includes(symbol)) {
        addIssue(issues, "error", "representative_not_member", `${sector.sector_id} representative ${symbol} is not in member_symbols`);
      }
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  console.log(`db master validation: ${errors.length} errors, ${warnings.length} warnings, ${activeStocks.length} active stocks, ${sectors.length} active sectors`);
  for (const issue of issues) {
    console.log(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
  }

  if (errors.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
