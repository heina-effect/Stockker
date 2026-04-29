# Stockker Setup Guide (Phase 12)

## 1. Environment & Tech Stack
- **Framework:** Next.js 16.1.6 (App Router)
- **Package Manager:** npm
- **Styling:** Tailwind CSS v4, shadcn/ui
- **Language:** TypeScript 5+

## 2. API Keys & .env.local
실제 KIS 데이터 및 공시 조회를 위해 아래 키가 필요합니다. 
```env
# /Users/hyuna/Desktop/heina/Stockker/.env.local 
KIS_APP_KEY="your_api_key_here"
KIS_APP_SECRET="your_app_secret_here"
KIS_TR_MODE="v" # 'v' for vpaper(mock), 'real' for real account

# DART API (Phase 12+)
DART_API_KEY="your_dart_api_key_here"
```

## 3. Scripts
- `npm run dev`: 기본 Next.js 로컬 서버 가동
- `npm run dev:reset`: `.next` 폴더 캐시를 전부 지우고 깨끗한 상태로 서버 가동. 브라우저 Lock 에러 발생 시 사용.
- `npm run build`: 프로덕션 빌드
- `npm run validate`: Typecheck 및 Lint 검증 수행 (CI 대체)
- `npm run validate:full`: 전체 테스트 및 빌드 파이프라인 수행

## 4. Running the Development Server
```bash
npm install
npm run dev
```
브라우저에서 `http://localhost:3000`으로 접속하면, KIS 실시간 인프라 및 Open DART 공시 연동 리서치 에디션을 볼 수 있습니다.
