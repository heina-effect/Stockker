/**
 * 뉴스 API 오류 응답을 로그 한 줄로 요약한다. 일일 한도 소진인지 초당 제한인지 구분하려고
 * HTTP 상태코드와 응답의 오류 메시지만 남긴다. URL·쿼리스트링·키는 넣지 않으며,
 * 혹시 응답 본문에 키가 섞여 오면 가린다.
 *
 * - GNews: { "errors": ["..."] }
 * - NewsAPI: { "status": "error", "code": "rateLimited", "message": "..." }
 */
const MAX_MESSAGE_LENGTH = 200;

export async function describeHttpError(response: Response, secret?: string): Promise<string> {
  let message = "";
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text);
      if (Array.isArray(body?.errors)) {
        message = body.errors.map((e: unknown) => String(e)).join("; ");
      } else if (body?.errors && typeof body.errors === "object") {
        message = Object.values(body.errors).map((e) => String(e)).join("; ");
      } else if (body?.message || body?.code) {
        message = [body.code, body.message].filter(Boolean).join(": ");
      } else {
        message = text;
      }
    } catch {
      message = text;
    }
  } catch {
    message = "(응답 본문 읽기 실패)";
  }

  if (secret) message = message.split(secret).join("***");
  message = message.replace(/\s+/g, " ").trim();
  if (message.length > MAX_MESSAGE_LENGTH) message = `${message.slice(0, MAX_MESSAGE_LENGTH)}…`;

  return `status=${response.status} message=${JSON.stringify(message || "(빈 본문)")}`;
}
