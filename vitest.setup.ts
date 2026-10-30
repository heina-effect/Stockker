import { vi } from "vitest";

// KIS 설정(src/server/kis/config.ts)은 import 시점에 env를 zod로 검증한다. 테스트 환경에는 .env가
// 없어 이 모듈을 간접 import하는 테스트(storage.test.ts 등)가 수집 단계에서 깨지므로 더미 값을 주입한다.
// 실제 키가 주어진 환경에서는 덮어쓰지 않는다.
process.env.KIS_TOKEN_ENCRYPTION_KEY ??= "test-dummy-encryption-key";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));
