const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').filter(l => l && !l.startsWith('#')).forEach(line => {
    const [k, ...v] = line.split('=');
    if (k) env[k.trim()] = v.join('=').trim().replace(/"/g, '');
});

const appKey = env.KIS_MOCK_APP_KEY || env.KIS_REAL_APP_KEY;
const appSecret = env.KIS_MOCK_APP_SECRET || env.KIS_REAL_APP_SECRET;

const encKeyRaw = env.KIS_TOKEN_ENCRYPTION_KEY;
let encKey = Buffer.from(encKeyRaw, "utf8");
if (encKey.length !== 32) encKey = Buffer.alloc(32, encKeyRaw);

const tokenFile = path.join(require('os').tmpdir(), 'kis_token_cache.json');
const raw = fs.readFileSync(tokenFile, 'utf8');
const { iv, authTag, data } = JSON.parse(raw);
const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, "base64"));
decipher.setAuthTag(Buffer.from(authTag, "base64"));
const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
]);
const token = JSON.parse(decrypted.toString("utf8")).accessToken;

async function testDaily() {
    console.log("Fetching daily for 005930...");
    const d = new Date();
    const d1 = new Date(d.getTime() - 90 * 24 * 60 * 60 * 1000);
    const formatDate = (date) => date.toISOString().split('T')[0].replace(/-/g, '');
    
    // inquire-daily-itemchartprice
    let url = `https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=005930&FID_INPUT_DATE_1=${formatDate(d1)}&FID_INPUT_DATE_2=${formatDate(d)}&FID_PERIOD_DIV_CODE=D&FID_ORG_ADJ_PRC=0`;
    let res = await fetch(url, { headers: { "Authorization": `Bearer ${token}`, "appkey": appKey, "appsecret": appSecret, "tr_id": "FHKST03010100" } });
    console.log("Daily response:", await res.json());
}
testDaily().catch(console.error);
