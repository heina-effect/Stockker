# Stockker Setup Guide (Phase 5)

## 1. Environment & Tech Stack
- **Framework:** Next.js 16.1.6 (App Router)
- **Package Manager:** npm
- **Styling:** Tailwind CSS v4, shadcn/ui
- **Language:** TypeScript 5+

## 2. API Keys & .env.local
실제 KIS 데이터를 조회하고 싶다면 아래 키가 필요합니다. 하지만 Phase 5의 AI 리서치 기능은 Mocking 처리되어 있어 키 없이도 작동합니다.
```env
# /Users/hyuna/Desktop/heina/Stockker/.env.local (Required for KIS Live Price)
KIS_APP_KEY="your_api_key_here"
KIS_APP_SECRET="your_app_secret_here"
KIS_TR_MODE="v" # 'v' for vpaper(mock), 'real' for real account
```

## 3. Scripts
- `npm run dev`: 기본 Next.js 로컬 서버 가동
- `npm run dev:reset`: `.next` 폴더 캐시를 전부 지우고 깨끗한 상태로 서버 가동. 브라우저 Lock 에러 발생 시 사용.
- `npm run build`: 프로덕션 빌드
- `npm run validate`: Typecheck 및 Lint 검증 수행 (CI 대체)
- `npm run typecheck`: TypeScript 오류 사전 체크

## 4. Running the Development Server
```bash
npm install
npm run dev
```
브라우저에서 `http://localhost:3000`으로 접속하면, KIS 실시간 인프라 및 결정론형 AI Mock-Stub 데이터가 즉각 렌더링되는 리서치 에디션을 볼 수 있습니다.
