import { getKisAccessToken } from "./src/server/kis/auth";
import { kisConfig } from "./src/server/kis/config";
import fs from "fs";

async function testIndex() {
    const token = await getKisAccessToken();
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
    const query = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "U", 
      FID_INPUT_ISCD: "0001",
      FID_INPUT_DATE_1: formatDate(lastWeek),
      FID_INPUT_DATE_2: formatDate(today),
      FID_PERIOD_DIV_CODE: "D",
      FID_ORG_ADJ_PRC: "0"
    });
    
    const url = `${kisConfig.restBaseUrl}/uapi/domestic-stock/v1/quotations/inquire-index-price?${query.toString()}`;
    const res = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${token}`,
            "appkey": kisConfig.appKey!,
            "appsecret": kisConfig.appSecret!,
            "tr_id": "FHKST03010100"
        }
    });
    const json = await res.json();
    fs.writeFileSync("dump.json", JSON.stringify(json, null, 2));
    console.log("Dumped to dump.json");
}
testIndex().catch(console.error);
