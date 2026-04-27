const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Get keys from .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').filter(l => l && !l.startsWith('#')).forEach(line => {
    const [k, ...v] = line.split('=');
    if (k) env[k.trim()] = v.join('=').trim().replace(/"/g, '');
});

const mode = env.NEXT_PUBLIC_KIS_MODE || 'real';
const appKey = mode === 'real' ? env.KIS_REAL_APP_KEY : env.KIS_MOCK_APP_KEY;
const appSecret = mode === 'real' ? env.KIS_REAL_APP_SECRET : env.KIS_MOCK_APP_SECRET;

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
const tokenInfo = JSON.parse(decrypted.toString("utf8"));
const token = tokenInfo.accessToken;

async function test() {
    const stockUrl = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=005930";
    const resStock = await fetch(stockUrl, {
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "appkey": appKey,
            "appsecret": appSecret,
            "tr_id": "FHKST01010100"
        }
    });
    console.log("Samsung (005930):", await resStock.json());

    const url = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-index-price?FID_COND_MRKT_DIV_CODE=U&FID_INPUT_ISCD=0001";
    const res = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "appkey": appKey,
            "appsecret": appSecret,
            "tr_id": "FHKST03010100"
        }
    });
    console.log("KOSPI (0001):", await res.json());
}
test().catch(console.error);
