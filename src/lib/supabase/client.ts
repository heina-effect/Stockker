/**
 * Supabase Client — Phase 20
 *
 * 키 정책:
 * - 서버 전용: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (sb_secret_)
 *
 * service_role 키는 절대 브라우저에 노출하지 않습니다.
 * 브라우저에서 Supabase 를 직접 읽는 곳은 없다. 필요해지면 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * (sb_publishable_)로 만든다. 레거시 JWT 키(anon/service_role eyJ...)는 2026-10-29 비활성화 —
 * 공개 히스토리에 노출된 anon 키 폐기.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** 서버 전용 — RLS 우회, Service Role 권한 */
export function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
