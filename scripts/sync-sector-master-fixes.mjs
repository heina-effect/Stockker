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

  const { error: sectorError } = await db
    .from("sector_master")
    .update({
      member_symbols: ["011200", "028670", "005880", "044450", "003280"],
      representative_symbols: ["011200", "028670"],
      updated_at: new Date().toISOString(),
    })
    .eq("sector_id", "sec-shipping");
  if (sectorError) throw new Error(`sec-shipping 업데이트 실패: ${sectorError.message}`);

  const { error: stockError } = await db
    .from("stock_master")
    .upsert([
      { symbol: "005880", name: "대한해운", market: "KOSPI", sector_tag: "해운", is_active: true, updated_at: new Date().toISOString() },
      { symbol: "044450", name: "KSS해운", market: "KOSPI", sector_tag: "해운", is_active: true, updated_at: new Date().toISOString() },
      { symbol: "003280", name: "흥아해운", market: "KOSPI", sector_tag: "해운", is_active: true, updated_at: new Date().toISOString() },
    ], { onConflict: "symbol" });
  if (stockError) throw new Error(`해운 stock_master 업데이트 실패: ${stockError.message}`);

  console.log("sector_master fix complete: sec-shipping members corrected");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
