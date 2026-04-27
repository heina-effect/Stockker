import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* 공통 REST 응답 스키마                                                       */
/* -------------------------------------------------------------------------- */

/**
 * KIS REST API 응답 공통 스키마
 *
 * rt_cd
 * - "0": 성공
 * - 그 외: 실패
 */
export const kisApiResponseSchema = z.object({
  rt_cd: z.string(),
  msg_cd: z.string(),
  msg1: z.string(),
  output: z.any().optional(),
});

/* -------------------------------------------------------------------------- */
/* 웹소켓 메시지 기본 스키마                                                   */
/* -------------------------------------------------------------------------- */

/**
 * KIS 실시간 체결/호가 데이터를 파싱하기 위한 기본 스키마
 * 세부 body 구조는 TR ID별로 다르므로 추후 세분화 가능
 */
export const kisWebsocketMessageSchema = z.object({
  header: z.object({
    tr_id: z.string(),
    tr_key: z.string(),
    encrypt: z.string().optional(),
  }),
  body: z.any(),
});

/* -------------------------------------------------------------------------- */
/* OAuth / Approval 인증 스키마                                                */
/* -------------------------------------------------------------------------- */

/**
 * KIS access token 발급 응답 스키마
 */
export const kisOauthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  access_token_token_expired: z.string().optional(),
  expires_in: z.union([z.string(), z.number()]).optional(),
  token_type: z.string().optional(),
  msg_cd: z.string().optional(),
  msg1: z.string().optional(),
});

/**
 * KIS websocket approval key 발급 응답 스키마
 */
export const kisApprovalKeyResponseSchema = z.object({
  approval_key: z.string().min(1),
  msg_cd: z.string().optional(),
  msg1: z.string().optional(),
});

/* -------------------------------------------------------------------------- */
/* 타입 추론                                                                   */
/* -------------------------------------------------------------------------- */

export type KisApiResponse = z.infer<typeof kisApiResponseSchema>;
export type KisWebsocketMessage = z.infer<typeof kisWebsocketMessageSchema>;
export type KisOauthTokenResponse = z.infer<
  typeof kisOauthTokenResponseSchema
>;
export type KisApprovalKeyResponse = z.infer<
  typeof kisApprovalKeyResponseSchema
>;