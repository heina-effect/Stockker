import { getKisAccessToken } from "./src/server/kis/auth";
import { kisConfig } from "./src/server/kis/config";

async function testIndex() {
    const token = await getKisAccessToken();
    const query = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "U", 
      FID_INPUT_ISCD: "0001"
    });
    const url = `${kisConfig.restBaseUrl}/uapi/domestic-stock/v1/quotations/inquire-index-price?${query.toString()}`;
    
    const res = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${token}`,
            "appkey": kisConfig.appKey!,
            "appsecret": kisConfig.appSecret!,
            "tr_id": "FHPST01150000"
        }
    });
    console.log(JSON.stringify(await res.json(), null, 2));
}
testIndex().catch(console.error);
