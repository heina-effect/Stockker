const https = require("https");
const { readFileSync } = require("fs");

async function run() {
  const tokenCache = readFileSync("/tmp/kis_token_cache.json", "utf-8");
  const tokenData = JSON.parse(JSON.parse(tokenCache).data); 
  // Wait, token is encrypted. Nevermind.
}
