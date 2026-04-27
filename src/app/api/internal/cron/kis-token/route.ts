import { NextRequest, NextResponse } from "next/server";

import { kisConfig } from "@/server/kis/config";
import { getKisAccessToken } from "@/server/kis/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");

    const isAuthorized = kisConfig.cronSecret
        ? authHeader === `Bearer ${kisConfig.cronSecret}`
        : process.env.NODE_ENV === "development";

    if (!isAuthorized) {
        return NextResponse.json(
            { ok: false, error: "Unauthorized" },
            { status: 401 }
        );
    }

    try {
    await getKisAccessToken(true); // forceRefresh

    return NextResponse.json({
      ok: true,
      refreshed: true,
      mode: kisConfig.mode
    });
  } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                error:
                    error instanceof Error ? error.message : "Unknown cron error",
            },
            { status: 500 }
        );
    }
}