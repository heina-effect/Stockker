import { NextResponse } from "next/server";
import { kisConfig, getKisConfig } from "@/server/kis/config";
import { getKisAccessToken } from "@/server/kis/auth";
import { getKisApprovalKey } from "@/server/kis/approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const safeConfig = getKisConfig();
  
  let accessTokenStatus = "unknown";
  let approvalKeyStatus = "unknown";
  const errors: string[] = [];

  try {
    await getKisAccessToken();
    accessTokenStatus = "ready";
  } catch (e: unknown) { // Explicitly type 'e' as unknown for better type safety
    accessTokenStatus = "error";
    errors.push(`AccessToken: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const approval = await getKisApprovalKey();
    approvalKeyStatus = approval ? "ready" : "failed";
  } catch (e: unknown) { // Explicitly type 'e' as unknown for better type safety
    approvalKeyStatus = "error";
    errors.push(`ApprovalKey: ${e instanceof Error ? e.message : String(e)}`);
  }

  return NextResponse.json({
    configured: !!(kisConfig.appKey && kisConfig.appSecret),
    mode: kisConfig.mode,
    realtimeEnabled: kisConfig.enableRealtime,
    sourceCandidate: kisConfig.appKey ? "live" : "mock",
    aliasWarnings: kisConfig.aliasWarnings,
    
    auth: {
      accessToken: accessTokenStatus,
      approvalKey: approvalKeyStatus,
    },
    
    configSummary: safeConfig,
    errors: errors.length > 0 ? errors : undefined,
  });
}
