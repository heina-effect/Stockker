import fs from "node:fs";

const metadata = fs.readFileSync("src/lib/stocks/metadata.ts", "utf8");
const taxonomy = fs.readFileSync("src/data/sectors/taxonomy.ts", "utf8");
const corpMaster = JSON.parse(fs.readFileSync("src/data/dart/corp-master.json", "utf8"));

const displayNameAliases = {
  "005380": ["현대자동차"],
  "036570": ["NC"],
  "010120": ["엘에스일렉트릭"],
  "000810": ["삼성화재해상보험"],
  "000060": ["메리츠화재해상보험"],
  "010620": ["에이치디현대미포"],
  "030200": ["케이티"],
};

function corpNameBySymbol() {
  const map = {};
  for (const row of Object.values(corpMaster)) {
    if (row?.stock_code && row?.corp_name) map[row.stock_code] = row.corp_name;
  }
  return map;
}

function parseStocks() {
  const stocks = {};
  const re = /"(\d{4,6})":\s*\{([\s\S]*?)\n\s*\}/g;
  let match;
  while ((match = re.exec(metadata))) {
    const body = match[2];
    const name = body.match(/"name":\s*"([^"]+)"/)?.[1];
    const market = body.match(/"market":\s*"([^"]+)"/)?.[1];
    const sector = body.match(/"sector":\s*"([^"]+)"/)?.[1];
    stocks[match[1]] = { symbol: match[1], name, market, sector };
  }
  return stocks;
}

function parseSectorMembers() {
  const sectors = [];
  const re = /"(sec-[^"]+)":\s*\{([\s\S]*?)\n\s*\}/g;
  let match;
  while ((match = re.exec(taxonomy))) {
    const body = match[2];
    const membersRaw = body.match(/memberSymbols:\s*\[([^\]]*)\]/)?.[1] || "";
    const repsRaw = body.match(/representativeSymbols:\s*\[([^\]]*)\]/)?.[1] || "";
    const members = [...membersRaw.matchAll(/"([^"]+)"/g)].map(v => v[1]);
    const reps = [...repsRaw.matchAll(/"([^"]+)"/g)].map(v => v[1]);
    sectors.push({ sectorId: match[1], members, reps });
  }
  return sectors;
}

function isAcceptedName(symbol, name, dartName) {
  return name === dartName || (displayNameAliases[symbol] || []).includes(dartName);
}

const dartNames = corpNameBySymbol();
const stocks = parseStocks();
const sectors = parseSectorMembers();
const issues = [];

for (const stock of Object.values(stocks)) {
  if (stock.market === "INDEX" || stock.market === "ETF") continue;
  const dartName = dartNames[stock.symbol];
  if (!dartName) {
    issues.push({ severity: "warning", code: "stock_missing_in_dart", symbol: stock.symbol, message: `${stock.symbol} ${stock.name} is not present in local DART corp-master` });
  } else if (!isAcceptedName(stock.symbol, stock.name, dartName)) {
    issues.push({ severity: "error", code: "stock_name_mismatch", symbol: stock.symbol, message: `${stock.symbol} metadata name "${stock.name}" does not match DART "${dartName}"` });
  }
}

for (const sector of sectors) {
  for (const symbol of sector.members) {
    const stock = stocks[symbol];
    const dartName = dartNames[symbol];
    if (!stock && !dartName) {
      issues.push({ severity: "error", code: "sector_member_unknown_symbol", symbol, message: `${sector.sectorId} includes unknown member symbol ${symbol}` });
    }
    if (stock && dartName && !isAcceptedName(symbol, stock.name, dartName)) {
      issues.push({ severity: "error", code: "sector_member_name_mismatch", symbol, message: `${sector.sectorId} member ${symbol} metadata name "${stock.name}" does not match DART "${dartName}"` });
    }
  }
  for (const symbol of sector.reps) {
    if (!sector.members.includes(symbol)) {
      issues.push({ severity: "error", code: "representative_not_member", symbol, message: `${sector.sectorId} representative ${symbol} is not in memberSymbols` });
    }
  }
}

const errors = issues.filter(issue => issue.severity === "error");
const warnings = issues.filter(issue => issue.severity === "warning");

console.log(`master validation: ${errors.length} errors, ${warnings.length} warnings`);
for (const issue of issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code}${issue.symbol ? ` ${issue.symbol}` : ""}: ${issue.message}`);
}

if (errors.length > 0) process.exit(1);
