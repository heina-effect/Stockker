"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardHeader } from "@/components/home/dashboard-header";
import { Activity, ArrowLeft, ChevronDown, ChevronUp, Info, Search, Star, XCircle } from "lucide-react";

type Verdict = "stopLoss" | "hold" | "neutral" | "watching";

// stage: 추적 종료 재설계(2026-09-11) — 경과일은 "현재 관찰 사이클" entryDate 기준.
// primary(0~10일): 매매 판단 유효기간, 기본 4컬럼 칸반에 노출. secondary(11~30일): 결과 관찰
// 기간(판단 대상 아님), 기본 화면에서는 숨고 검색으로만. ended(30일 초과): 완전 종료, 검색으로만.
type TrackingStage = "primary" | "secondary" | "ended";

interface CorporateActionInfo {
  symbol: string;
  date: string;
  flngClsCode: string;
}

const CORPORATE_ACTION_NOTICE = "자본변동 발생 — 수익률 계산 불가";

interface TrackingItem {
  symbol: string;
  name: string;
  discoveryDate: string; // YYYYMMDD — 현재 관찰 사이클의 entryDate
  daysAfter: number; // 현재 관찰 사이클 entryDate로부터 경과 거래일수
  entryClose: number; // 포착가 (현재 관찰 사이클 entryDate 종가)
  currentClose: number;
  returnPct: number | null; // 예상수익률 (현재 관찰 사이클 포착가 대비). 자본변동이 끼면 null
  verdict: Verdict | null; // 현재 관찰 사이클 기준 판정. 자본변동이 끼면 null
  corporateAction: CorporateActionInfo | null;
  isFavorite: boolean;
  captureCount: number; // 현재 관찰 사이클 내 포착(재등장) 횟수
  captureDates: string[]; // 포착일 목록(현재 사이클), 오름차순
  captureHistory: { date: string; entryClose: number }[]; // 포착일+그날 진입가(현재 사이클), 오름차순
  maxReturnPct: number | null; // 현재 사이클 포착가 대비 이후 최고 등락률(MFE)
  minReturnPct: number | null; // 현재 사이클 포착가 대비 이후 최저 등락률(MAE)
  stage: TrackingStage;
  cycleNumber: number; // 이 종목의 몇 번째 관찰 사이클인지(1부터)
  priorCycleCount: number; // 이전에 완전 종료된(30일 초과 후 리셋된) 사이클 수
  priorCycleEntryDates: string[]; // 이전 사이클들의 시작일(entryDate) 목록, 오름차순
}

// 퀀트 신호 트래커 전용 항목 — 전체 관찰 칸반(TrackingItem/verdict)과 완전히 분리된 별도 체계.
// group==="pending"(신호 발생 후 3일 미만): 아직 verdict 없음, RSI·거래량만 표시.
// group==="result"(3일 이상 경과): 3일차 확정 수익률 + 현재까지 최고수익률을 표시. daysAfter가
// 얼마든 이 트랙에 영구히 남는다(4컬럼처럼 15영업일 지나도 사라지지 않음).
interface QuantSignalItem {
  symbol: string;
  name: string;
  discoveryDate: string; // 퀀트 신호가 뜬 그 발굴일(= 최초 포착일과 다를 수 있음, 재등장 시점 신호)
  daysAfter: number; // 그 발굴일로부터 경과 거래일수
  rsi14: number | null;
  volumeRatio: number | null;
  entryClose: number;
  currentClose: number;
  group: "pending" | "result";
  day3ReturnPct: number | null; // ±10% 보유/손절 판정 지표(3일 규칙). exitDay3Pct와 값은 정의상 동일
  maxReturnSoFarPct: number | null; // 참고용(낙관적) — 실현 아님. 계산 창 0~10일(2026-09-18 축소)
  minReturnSoFarPct: number | null; // maxReturnSoFarPct와 동일 창의 최저(표시 전용, 판정 무관)
  // ── 청산 규칙별 수익률(2026-10-20) — 카드·표·헤드라인이 모두 exitDay3Pct 하나를 주 기준으로 쓴다 ──
  exitDay3Pct: number | null; // 3거래일차 종가 청산(사후 정보 없음) — 주 기준
  exitDay3NetPct: number | null; // exitDay3Pct에서 왕복 비용 차감
  exitStop10Pct: number | null; // day1~3 중 종가 -10% 이하면 그날 청산, 없으면 day3 청산
  peakReturnPct: number | null; // 최고점 청산 상한(종전 realizedReturnPct, 식 동일) — 사후에만 알 수 있어 실현 불가
  endDate: string | null; // daysAfter>=10 도달 시: day10 시점 거래일(종료일자, 고정값)
  endClose: number | null; // daysAfter>=10 도달 시: day10 시점 종가(종료가, 고정값)
  endReturnPct: number | null; // = exitDay10Pct(관측 종료일 종가 청산) — 테이블 "10일차(%)" 참고 컬럼
  haltStartDaysAfter: number | null; // 거래정지 시작 시점(표시 전용 — "거래정지 구간 제외 후 관찰 중" 문구에 사용)
  isValidForStats: boolean;
  elapsedTradingDays: number; // 발견일로부터 경과 거래일(정지일 포함, 거래일 캘린더 기준)
  // 관찰 종료(2026-10-30 통일) = day3 종가 존재(헤드라인 n과 같은 집합), 또는 거래정지로
  // day3 종가 없이 경과 거래일이 추적 상한(32)을 넘은 건(haltIncomplete, 통계 제외).
  observationEnded: boolean;
  haltIncomplete: boolean;
  isRecentlyActive: boolean; // 관찰 지속성 보조표시(참고용) — daysAfter<30이면 항상 false(변경 없음)
  recentRecapture: { date: string; status: "notMet" | "unknown" } | null; // 신호일 이후 재포착 이력(표시용, 판정과 무관)
  corporateAction: CorporateActionInfo | null; // 발굴일 뒤 자본변동 — 있으면 수익률이 전부 null, 통계 제외
}

// 청산 규칙 하나에 대한 성과 묶음 — 백엔드 computeExitStats()가 규칙별로 같은 산식으로 만든다.
interface ExitStats {
  n: number;
  winCount: number;
  lossCount: number;
  winRatePct: number | null; // 수익률 > 0 비율(±10% 임계값과 무관)
  profitFactor: number; // 승 수익 합 / |패 손실 합|
  expectancy: number; // 거래당 평균 수익률
  kellyPct: number | null; // W - (1-W)/R. 승·패가 모두 있어야 정의됨(음수면 베팅 금지 신호)
}

interface QuantSignalStats {
  totalCount: number;
  resultCount: number; // = exitDay3 통계의 n(day3 종가 존재 건)
  observingExcludedCount: number; // 관측 중(day3 미도달)으로 통계에서 제외된 건수
  haltIncompleteCount: number; // 거래정지로 관측 미완 종료 — 통계 제외
  corporateActionExcludedCount: number; // 발굴일 뒤 자본변동 — 통계 제외
  roundTripCostPct: number; // 왕복 비용 가정치(감사용으로 그대로 노출)
  stopLossThresholdPct: number;
  avgDay3ReturnPct: number | null;
  avgMaxReturnSoFarPct: number | null;
  exitDay3: ExitStats; // [주] 3일차 종가 청산
  exitDay3Net: ExitStats; // 비용 차감 후
  exitStop10: ExitStats; // 손절 -10% 적용
  exitDay3Trimmed: ExitStats; // 상·하위 1건 제외(극단값 민감도)
  peak: ExitStats; // 최고점 청산 상한 — 실현 불가, 참고용
  sampleSymbolCount: number; // 신뢰도 배지용 — 이벤트(건) 수가 아니라 unique symbol 수
}

// 표본 부족 경고 기준 — n이 이 값 미만이면 헤드라인에 노이즈 경고를 띄운다(작업지시 2026-10-20).
const QUANT_MIN_RELIABLE_N = 100;

interface TrackingResponse {
  ok: boolean;
  summary: { total: number; stopLoss: number; hold: number; watching: number; corporateActionExcluded: number };
  stageCounts: { primary: number; secondary: number; ended: number };
  items: TrackingItem[];
  quantSignalItems: QuantSignalItem[];
  quantSignalStats: QuantSignalStats;
}

const STAGE_LABEL: Record<Exclude<TrackingStage, "primary">, string> = {
  secondary: "결과 관찰 중(판단 대상 아님)",
  ended: "종료됨(30일 경과)",
};

/** 퀀트 신호 판정 조건. "대박률" 단어는 화면에서 사용 금지 — 참고 통계 토글에서만 문장형으로 서술한다. */
const QUANT_SIGNAL_META = {
  condition: "RSI 50~60 + 거래량 200~400%",
};

// 목표 표본(종전 60종목)은 산출 근거가 없었고 검증도 종료돼 제거했다(2026-11-02). 헤드라인은 표본 종목 수만 쓴다
// — n은 A트랙 발굴 건수가 아니라 unique symbol 수(표본 독립성 문제로 종목 기준).

/**
 * 섹션 헤더에 표시하는 정렬 기준 문구 (하드코딩 상수, 섹션당 1회만 표시). 회복률 등 수치 근거는 싣지 않는다
 * — 3일차 기준 수치라 매일 갱신되는 판정과 대상이 다르고, 가설 검증이 알파 없음으로 종료됐다(2026-11-03).
 */
const SECTION_META: Record<
  Verdict,
  { title: string; sortHint: string; hasReference: boolean; dot: string; bg: string }
> = {
  stopLoss: {
    title: "약세 전환",
    sortHint: "낙폭 큰 순",
    hasReference: true,
    dot: "bg-rose-500",
    bg: "bg-rose-50/70 dark:bg-rose-950/20",
  },
  hold: {
    title: "강세 지속",
    sortHint: "상승폭 큰 순",
    hasReference: true,
    dot: "bg-blue-500",
    bg: "bg-blue-50/70 dark:bg-blue-950/20",
  },
  neutral: {
    title: "혼조",
    sortHint: "최근 포착순",
    hasReference: true,
    dot: "bg-amber-500",
    bg: "bg-amber-50/70 dark:bg-amber-950/20",
  },
  watching: {
    title: "판단 대기",
    sortHint: "최근 포착순",
    hasReference: false,
    dot: "bg-slate-400 dark:bg-zinc-600",
    bg: "bg-slate-100/70 dark:bg-zinc-800/30",
  },
};

const SECTION_ORDER: Verdict[] = ["watching", "neutral", "hold", "stopLoss"];

/** 판정 규칙 정의 (하드코딩 상수). 제작자 본인 대상 화면이라 용어 설명·목적 서술은 생략하고
 * 판정 규칙만 간결하게 제공한다. */
const READ_GUIDE = {
  criteria: [
    { verdict: "약세 전환", condition: "포착 후 2거래일차부터 -10% 초과 하락", meaning: "회복 확률이 낮은 구간" },
    { verdict: "강세 지속", condition: "포착 후 2거래일차부터 +10% 초과 상승", meaning: "추가 상승 가능성이 높은 구간" },
    { verdict: "혼조", condition: "그 사이", meaning: "방향성 불명확" },
    { verdict: "판단 대기", condition: "아직 2일 미도달", meaning: "판단 유보" },
  ],
};

function formatDiscoveryDate(yyyymmdd: string): string {
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  return `${month}/${day}`;
}

// 섹션별 정렬: 손절은 낙폭이 큰 순, 보유는 상승폭이 큰 순, 나머지는 포착일 최신순
function sortSectionItems(verdict: Verdict, sectionItems: TrackingItem[]): TrackingItem[] {
  const sorted = [...sectionItems];
  if (verdict === "stopLoss") {
    sorted.sort((a, b) => (a.returnPct ?? 0) - (b.returnPct ?? 0));
  } else if (verdict === "hold") {
    sorted.sort((a, b) => (b.returnPct ?? 0) - (a.returnPct ?? 0));
  } else {
    sorted.sort((a, b) => b.discoveryDate.localeCompare(a.discoveryDate));
  }
  return sorted;
}

// 색상 규칙: 현재가 > 포착가 = 빨강, 현재가 < 포착가 = 파랑, 동일 = 기본. 예상수익률 셀도 동일 색 적용.
function priceColorClass(currentClose: number, entryClose: number): string {
  if (currentClose > entryClose) return "text-rose-500";
  if (currentClose < entryClose) return "text-blue-500";
  return "text-slate-500 dark:text-zinc-400";
}

// 퀀트신호 "최고 +X%" 전용 색상 — 표시값(소수 1자리 반올림) 기준으로 부호를 판단한다(2026-09-18
// 수정). 원본값이 0.03처럼 아주 작은 양수면 priceColorClass(원본,0)은 빨강을 반환하지만 화면에는
// "+0.0%"로 반올림 표시돼 "0%인데 빨강"으로 보이는 문제가 있었다(삼성전자우·삼성생명 사례).
// 반올림된 값 자체로 판단해 0.0%는 항상 중립(회색)이 되도록 한다.
function maxReturnColorClass(value: number | null): string {
  if (value == null) return "text-slate-400";
  const rounded = Number(value.toFixed(1));
  if (rounded > 0) return "text-rose-500";
  if (rounded < 0) return "text-blue-500";
  return "text-slate-500 dark:text-zinc-400";
}

// 고점 대비 낙폭 — maxReturnSoFarPct(최고 수익률) 대비 기준값(basisReturnPct)이 얼마나
// 빠졌는지(항상 0 이상). 신규 판정이 아니라 두 기존 수치의 단순 차이를 보여주는 표시 전용 값.
function drawdownFromPeak(maxReturnSoFarPct: number | null, basisReturnPct: number | null): number | null {
  if (maxReturnSoFarPct == null || basisReturnPct == null) return null;
  return Number((maxReturnSoFarPct - basisReturnPct).toFixed(2));
}

function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

// 포착(재등장) 횟수 표시. 재등장 날짜(+그날 진입가) 전체 목록은 기본 숨김, 클릭 시 펼침.
//
// [dot 규칙 — 2026-09-04 진단 후 확정]
// - captureCount <= 1: 컴포넌트 자체를 렌더링하지 않음(포착 1회는 카드 중단 줄에 이미
//   포착일이 나와 있어 부가 정보가 불필요)
// - captureCount === 2: dot 2개 + "2회 포착" 텍스트만(최고/최저는 3회 이상부터, 아래 참고)
// - captureCount >= 3: dot(최대 10개, min(count,10) 채움) + "N회 포착 · 최고/최저" 병기
// - captureCount > MAX_DOTS(10): dot 10개 전부 채운 뒤 옆에 "+N"으로 초과분 표시
//   (예: JW신약 13회 → ●●●●●●●●●● +3)
const MAX_DOTS = 10;
function CaptureInfo({
  captureCount,
  captureHistory,
  maxReturnPct,
  minReturnPct,
  expanded,
  onToggleExpand,
}: {
  captureCount: number;
  captureHistory: { date: string; entryClose: number }[];
  maxReturnPct: number | null;
  minReturnPct: number | null;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  if (captureCount <= 1) return null;

  const showDots = captureCount >= 2;
  const showMinMax = captureCount >= 3 && maxReturnPct != null && minReturnPct != null;
  const filledDots = Math.min(captureCount, MAX_DOTS);
  const overflowCount = Math.max(0, captureCount - MAX_DOTS);

  return (
    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-zinc-800/80">
      <div className="flex items-center gap-1.5 flex-wrap">
        {showDots && (
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              {Array.from({ length: MAX_DOTS }).map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${
                    i < filledDots ? "bg-indigo-400 dark:bg-indigo-500" : "bg-slate-200 dark:bg-zinc-700"
                  }`}
                />
              ))}
            </div>
            {overflowCount > 0 && (
              <span className="text-[10px] font-medium text-slate-400 dark:text-zinc-500">+{overflowCount}</span>
            )}
          </div>
        )}
        <span className="text-[11px] text-slate-500 dark:text-zinc-400">
          {captureCount}회 포착
          {showMinMax && (
            <>
              {" "}
              · 최고 {maxReturnPct >= 0 ? "+" : ""}
              {maxReturnPct.toFixed(1)}% / 최저 {minReturnPct >= 0 ? "+" : ""}
              {minReturnPct.toFixed(1)}%
            </>
          )}
        </span>
        <button
          onClick={onToggleExpand}
          className="text-[11px] text-indigo-500 dark:text-indigo-400 hover:underline ml-auto"
        >
          이력 보기 {expanded ? "▲" : "▼"}
        </button>
      </div>
      {expanded && (
        <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1.5 leading-relaxed">
          {captureHistory
            .map((h) => `${formatDiscoveryDate(h.date)} (${h.entryClose.toLocaleString()}원)`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function StarButton({
  isFavorite,
  pending,
  onToggle,
  className = "",
}: {
  isFavorite: boolean;
  pending: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={pending}
      className={`flex-shrink-0 disabled:opacity-50 ${className}`}
      aria-label="즐겨찾기 토글"
    >
      <Star
        className={`w-4 h-4 transition-colors ${
          isFavorite ? "fill-amber-500 text-amber-500" : "text-slate-300 dark:text-zinc-700 hover:text-amber-400"
        }`}
      />
    </button>
  );
}

// 공용 압축 카드 — 4컬럼 칸반과 퀀트 신호 트래커가 동일 컴포넌트를 공유한다(§4-2). 대상
// 데이터만 다르게 넣고 즐겨찾기/하단 정보(footer)는 옵션으로 받는다.
function CompactCard({
  symbol,
  name,
  returnPct,
  dateLabel,
  discoveryDate,
  daysAfter,
  entryClose,
  currentClose,
  favorite,
  footer,
  stageBadge,
  trackTone,
  dateLine,
}: {
  symbol: string;
  name: string;
  returnPct: number | null; // null = 자본변동으로 수익률 계산 불가
  dateLabel: string;
  discoveryDate: string;
  daysAfter: number;
  entryClose: number;
  currentClose: number;
  favorite?: { isFavorite: boolean; pending: boolean; onToggle: () => void };
  footer?: React.ReactNode;
  stageBadge?: string; // primary가 아닌 단계(검색 결과에서만 노출)일 때 상태 라벨(§3)
  trackTone?: "kanban"; // B트랙(칸반) 소속 표시. A트랙(퀀트신호)은 2026-09-18부터 QuantGroupedCard 전용
  dateLine?: React.ReactNode; // 표준 "포착일(N일 경과)·진입가→현재가" 줄을 대체하는 슬롯(현재 미사용,
  // 향후 필요 시 재사용)
}) {
  const priceColor = priceColorClass(currentClose, entryClose);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-transparent shadow-sm">
      {/* 상단 1줄: (즐겨찾기) + 종목명 + (A/B 트랙 라벨) — 좁은 컬럼에서도 이름이 수익률과 공간을
          다투지 않도록 종목명/수익률을 별도 줄로 분리(칸반 좁은 컬럼 폭에서 텍스트 겹침 방지) */}
      <div className="flex items-center gap-1.5 min-w-0">
        {favorite && (
          <StarButton isFavorite={favorite.isFavorite} pending={favorite.pending} onToggle={favorite.onToggle} />
        )}
        <Link
          href={`/stocks/${symbol}`}
          title={name}
          className="font-bold text-slate-900 dark:text-zinc-50 truncate min-w-0 hover:underline hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          {name}
        </Link>
        {trackTone && (
          <span className="text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400">
            일반관찰
          </span>
        )}
      </div>
      {/* 상단 2줄: 종목코드 ↔ 예상수익률 (justify-between으로 항상 여백 확보, 겹침 없음) */}
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="text-xs font-mono text-slate-400 dark:text-zinc-500 truncate min-w-0">{symbol}</span>
        {returnPct == null ? (
          <span className="text-xs font-semibold text-right text-amber-600 dark:text-amber-400">{CORPORATE_ACTION_NOTICE}</span>
        ) : (
          <span className={`text-base font-extrabold flex-shrink-0 ${priceColor}`}>
            {returnPct >= 0 ? "+" : ""}
            {returnPct.toFixed(1)}%
          </span>
        )}
      </div>

      {/* 중단: 포착일·경과일·가격 (현재가는 예상수익률과 동일한 색상 규칙 적용). dateLine이 오면
          표준 줄 대신 그걸 그린다(퀀트 관찰종료 카드 전용 "발굴일→종료일" 형식). */}
      {dateLine ?? (
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5">
          {dateLabel} {formatDiscoveryDate(discoveryDate)} ({daysAfter}일 경과) · {entryClose.toLocaleString()}
          {/* 자본변동 뒤 현재가는 진입가와 기준이 달라 나란히 두지 않는다 */}
          {returnPct != null && (
            <>
              {" → "}
              <span className={priceColor}>{currentClose.toLocaleString()}</span>
            </>
          )}
        </p>
      )}

      {stageBadge && (
        <span className="inline-block mt-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
          {stageBadge}
        </span>
      )}

      {footer}
    </div>
  );
}

// 판단 대기(daysAfter<3)까지 남은 일수, 관찰 단계 카드의 "최고 +XX%" 참고 수치 — 퀀트 신호
// 트래커 카드 footer 전용. 실현손익(승률 판정)이 아니라 참고용 raw 데이터라는 점을 명시.
//
// 카드 상태 라벨(2026-09-16 수정) — 경과일 기준 3단계로만 구분하고 승/패 이분법은 절대
// 노출하지 않는다("결과 확인 중" 단일 문구가 daysAfter와 무관하게 고정 표시되던 문제 수정).
// 씨피시스템처럼 3일차엔 마이너스였다가 이후 크게 반등하는 케이스가 실제로 있어, 특정 시점의
// 등락으로 "승"/"패" 딱지를 붙이면 안 된다 — 그래서 배지 색상도 중립(slate)으로 고정한다.
// 집계 통계(승률/손익비 등)의 "3일차 규칙" 계산 로직(QUANT_SIGNAL_FRESH_DAYS 등)은 이 라벨
// 교체와 무관하게 그대로 유지된다.
const QUANT_SIGNAL_FRESH_DAYS_CLIENT = 3;
// 거래정지로 day3 종가가 안 생기는 건의 관찰 상한 — 서버 TRACKING_WINDOW_DAYS_AFTER와 같은 값(표시 문구용).
const QUANT_TRACKING_WINDOW_DAYS_CLIENT = 32;
// 2026-09-18 — "관찰 종료"가 매도 신호로 오인되지 않도록 명시하는 문구. 트레일링 스탑 등 3일차
// 판정 이후의 청산 규칙은 검증 시도(9/17)했으나 "보유 지속" 표본이 작아 결론을 낼 수
// 없었다 — 즉 아직 존재하지 않는 규칙. 참고 통계 토글에서 재사용한다.
const QUANT_OBSERVATION_END_DISCLAIMER =
  "참고: 이 시점은 관찰을 멈추는 기준일 뿐, 매도 시점을 의미하지 않습니다. 청산 규칙은 아직 검증되지 않았습니다.";

// 종목(symbol) 단위 카드 통합(2026-09-18 재작업) — 동일 종목이 서로 다른 발굴일에 여러 번
// 독립적으로 퀀트 신호 조건을 만족해도(예: 대원전선 7/3·7/14) 별개 카드로 쪼개지 않고 한 카드
// 안에 이력을 세로로 나열한다. "퀀트신호 1/2, 2/2" 배지 방식은 폐기.
interface QuantSymbolGroup {
  symbol: string;
  name: string;
  sortKey: string; // 그룹 정렬용 — 가장 최근 discoveryDate
  events: QuantSignalItem[]; // discoveryDate 오름차순(오래된 것부터, 요청 예시와 동일 순서)
}

function groupQuantItemsBySymbol(items: QuantSignalItem[]): QuantSymbolGroup[] {
  const bySymbol = new Map<string, QuantSignalItem[]>();
  for (const item of items) {
    const list = bySymbol.get(item.symbol);
    if (list) list.push(item);
    else bySymbol.set(item.symbol, [item]);
  }
  const groups: QuantSymbolGroup[] = [];
  for (const [symbol, events] of bySymbol) {
    const sorted = [...events].sort((a, b) => a.discoveryDate.localeCompare(b.discoveryDate));
    groups.push({ symbol, name: sorted[sorted.length - 1].name, sortKey: sorted[sorted.length - 1].discoveryDate, events: sorted });
  }
  // 카드는 관찰 중(day3 미도달) 건만 받으므로 최근 발굴순 정렬만 한다.
  groups.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return groups;
}

// 그룹 카드 안의 이력 한 줄 — 카드는 관찰 중(day3 종가 미도달) 건만 받는다(2026-10-30 통일).
// day3 종가가 생긴 건은 관찰 종료로 QuantEndedTable에만 나온다.
function QuantHistoryRow({ item }: { item: QuantSignalItem }) {
  // 3 − 경과 거래일. 0 이하면 "N일 후 판단 예정"은 거짓이므로 문구 자체를 내지 않는다(클램프 금지).
  // 관찰 중 건만 들어오면 항상 1~3이지만, 방어적으로 0 이하 분기를 명시한다.
  const daysLeft = QUANT_SIGNAL_FRESH_DAYS_CLIENT - item.elapsedTradingDays;
  return (
    <div className="text-xs text-slate-500 dark:text-zinc-400 py-1.5 border-t border-slate-100 dark:border-zinc-800/80 first:border-t-0 first:pt-0">
      <span className="font-semibold text-blue-700 dark:text-blue-400">관찰 중</span>
      {" · "}
      {formatDiscoveryDate(item.discoveryDate)} (D+{item.daysAfter}) · RSI{" "}
      {item.rsi14 != null ? item.rsi14.toFixed(1) : "—"} · 거래량{" "}
      {item.volumeRatio != null ? `${item.volumeRatio.toFixed(0)}% (정규장 거래량, 애프터마켓 제외)` : "—"}
      {item.haltStartDaysAfter != null ? (
        <span className="text-amber-600 dark:text-amber-400">
          {" "}
          · 거래정지로 3일차 종가 대기 (경과 {item.elapsedTradingDays}거래일, {QUANT_TRACKING_WINDOW_DAYS_CLIENT}거래일 초과 시 관측 미완 종료)
        </span>
      ) : daysLeft > 0 ? (
        <span className="text-slate-400 dark:text-zinc-500"> · {daysLeft}일 후 판단 예정</span>
      ) : null}
    </div>
  );
}

// 카드에는 관찰 중 이벤트만 행으로 나오고, 상태는 카드 전체가 아니라 이벤트 단위로 붙인다.
// 같은 종목의 종료 이벤트(endedEvents)는 표에 있으므로 여기서는 날짜·상태 한 줄로만 보여준다.
// 예) 7/8 종료 · 8/20 종료 · 10/29 관찰 중
function QuantGroupedCard({ group, endedEvents }: { group: QuantSymbolGroup; endedEvents: QuantSignalItem[] }) {
  const { symbol, name, events } = group;
  const timeline = [
    ...endedEvents.map((e) => ({ date: e.discoveryDate, ended: true })),
    ...events.map((e) => ({ date: e.discoveryDate, ended: false })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-transparent shadow-sm">
      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
        <Link
          href={`/stocks/${symbol}`}
          title={name}
          className="font-bold text-slate-900 dark:text-zinc-50 truncate hover:underline hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          {name}
        </Link>
        <span className="text-xs font-mono text-slate-400 dark:text-zinc-500 flex-shrink-0">({symbol})</span>
        <span
          className="text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
          title="실험 신호 · 매수 추천 아님 · 추세 필터 미반영"
        >
          퀀트신호
        </span>
      </div>
      {timeline.length > 1 && (
        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
          {timeline.map((t, i) => (
            <span key={t.date}>
              {i > 0 && " · "}
              {formatDiscoveryDate(t.date)}{" "}
              <span className={t.ended ? "" : "font-semibold text-blue-700 dark:text-blue-400"}>{t.ended ? "종료" : "관찰 중"}</span>
            </span>
          ))}
        </p>
      )}
      <div>
        {events.map((item) => (
          <QuantHistoryRow key={item.discoveryDate} item={item} />
        ))}
      </div>
      {events[0]?.recentRecapture && (
        <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-zinc-800/80">
          최근 재포착 {formatDiscoveryDate(events[0].recentRecapture.date)}
        </p>
      )}
    </div>
  );
}

// 관찰 종료(observationEnded) 표본 전용 표(§UI 개선) — 카드 대신 정렬 가능한 표로 전환. 종목 단위
// 그룹핑 없이 발굴 건(신호) 단위로 한 행씩 전부 나열한다(같은 종목이 여러 번 신호를 냈으면
// 여러 행으로 보임 — 카드와 달리 표에서는 종목별로 묶지 않는 편이 비교에 유리하다).
// 컬럼 위계(2026-10-20): "3일차(%)"가 주 컬럼(bold)이고 승패 뱃지와 반드시 같은 필드
// (exitDay3Pct)를 쓴다 — 종전엔 강조 컬럼이 10일차(endReturnPct)인데 승패는 3일차 기준이라
// "수익률은 플러스인데 패"로 보이는 모순이 있었다. "최고점(%)"은 MFE(0~10일 최고 도달)이며
// 사후에만 알 수 있는 값이라 회색으로 격하한다.
// 컬럼 축소(2026-10-20): 기본 노출은 종목·발견일·3일차·최고점·승패 5개. 10일차/최저/반납은
// detail=true일 때만 보여준다(헤더의 "상세" 토글 1개로 일괄 전환).
type QuantEndedSortKey = "discoveryDate" | "exitDay3Pct" | "endReturnPct" | "maxReturnSoFarPct" | "minReturnSoFarPct" | "drawdown";

const QUANT_ENDED_COLUMNS: { key: QuantEndedSortKey; label: string; detail?: boolean }[] = [
  { key: "discoveryDate", label: "발견일" },
  { key: "exitDay3Pct", label: "3일차(%)" },
  { key: "maxReturnSoFarPct", label: "최고점(%)" },
  { key: "endReturnPct", label: "10일차(%)", detail: true },
  { key: "minReturnSoFarPct", label: "최저(%)", detail: true },
  { key: "drawdown", label: "반납(%p)", detail: true },
];

// 접은 상태에서 보여줄 행 수 — 토글이 컬럼만 바꾸면 차이가 체감되지 않아, 행 수까지 함께
// 줄인다(접힘=최신 5건 요약 / 펼침=전체 이력 + 상세 컬럼).
const QUANT_ENDED_COLLAPSED_ROWS = 5;

function QuantEndedTable({ items }: { items: QuantSignalItem[] }) {
  const [sortKey, setSortKey] = useState<QuantEndedSortKey>("discoveryDate");
  const [sortDesc, setSortDesc] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const visibleColumns = QUANT_ENDED_COLUMNS.filter((col) => showDetail || !col.detail);

  const rows = useMemo(() => {
    const withComputed = items.map((item) => {
      // 10일차 미도달이면 null 그대로 둔다 — 종전엔 peakReturnPct로 폴백했는데, 실현 불가 값이
      // 참고 컬럼에 섞여 들어가므로 제거했다.
      const endReturnPct = item.endReturnPct;
      const drawdown = drawdownFromPeak(item.maxReturnSoFarPct, endReturnPct);
      const win = item.exitDay3Pct != null ? item.exitDay3Pct > 0 : null; // null=day3 없음(통계 제외)
      return { item, endReturnPct, drawdown, win };
    });
    const valueOf = (r: (typeof withComputed)[number]): number | string => {
      if (sortKey === "discoveryDate") return r.item.discoveryDate;
      if (sortKey === "drawdown") return r.drawdown ?? -Infinity;
      if (sortKey === "endReturnPct") return r.endReturnPct ?? -Infinity;
      return r.item[sortKey] ?? -Infinity;
    };
    return withComputed.sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDesc ? -cmp : cmp;
    });
  }, [items, sortKey, sortDesc]);

  function toggleSort(key: QuantEndedSortKey) {
    if (key === sortKey) setSortDesc((v) => !v);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function toggleDetail() {
    setShowDetail((v) => {
      const next = !v;
      // 접을 때는 발견일 최신순으로 되돌린다 — 접힘 상태는 "최신 5건 요약"이라 보이지 않는
      // 컬럼(또는 다른 기준)으로 정렬돼 있으면 어떤 5건인지 설명되지 않는다.
      if (!next) {
        setSortKey("discoveryDate");
        setSortDesc(true);
      }
      return next;
    });
  }

  const visibleRows = showDetail ? rows : rows.slice(0, QUANT_ENDED_COLLAPSED_ROWS);
  const hiddenRowCount = rows.length - visibleRows.length;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] text-slate-400 dark:text-zinc-500">
          {showDetail
            ? `전체 ${rows.length}건 · 상세 컬럼 표시 중`
            : `최신 ${visibleRows.length}건 표시 중${hiddenRowCount > 0 ? ` (${hiddenRowCount}건 숨김)` : ""} · 발견일 최신순`}
        </span>
        <button
          onClick={toggleDetail}
          className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex-shrink-0"
        >
          {showDetail ? `최신 ${QUANT_ENDED_COLLAPSED_ROWS}건만 보기 ▲` : `전체 ${rows.length}건 + 상세 보기 ▼`}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400">
              <th className="text-left px-2 py-1.5 font-semibold">종목</th>
              {visibleColumns.map((col) =>
                col.key === "discoveryDate" ? (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="text-left px-2 py-1.5 font-semibold cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none"
                  >
                    {col.label}
                    {sortKey === col.key && (sortDesc ? " ▼" : " ▲")}
                  </th>
                ) : (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="text-right px-2 py-1.5 font-semibold cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none"
                  >
                    {col.label}
                    {sortKey === col.key && (sortDesc ? " ▼" : " ▲")}
                  </th>
                )
              )}
              <th
                className="text-center px-2 py-1.5 font-semibold"
                title="승패 기준: 3일차 종가 청산(exitDay3Pct > 0) — 주 컬럼 '3일차(%)'와 같은 필드"
              >
                승패
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ item, endReturnPct, drawdown, win }) => (
              <tr key={`${item.symbol}::${item.discoveryDate}`} className="border-b border-slate-100 dark:border-zinc-800/60">
                <td className="px-2 py-1.5 text-left">
                  <Link href={`/stocks/${item.symbol}`} className="hover:underline hover:text-indigo-600 dark:hover:text-indigo-400">
                    {item.name}
                  </Link>
                  {item.corporateAction ? (
                    <span className="ml-1 text-[11px] text-amber-600 dark:text-amber-400">{CORPORATE_ACTION_NOTICE}</span>
                  ) : item.haltIncomplete ? (
                    <span className="ml-1 text-[11px] text-amber-600 dark:text-amber-400">거래정지로 관측 미완</span>
                  ) : (
                    item.haltStartDaysAfter != null && (
                      <span className="ml-1 text-amber-600 dark:text-amber-400" title="거래정지 구간 제외 후 관찰">⏸</span>
                    )
                  )}
                </td>
                <td className="px-2 py-1.5 text-left text-slate-500 dark:text-zinc-400">{formatDiscoveryDate(item.discoveryDate)}</td>
                {/* 주 컬럼 — 승패 뱃지와 같은 필드(exitDay3Pct) */}
                <td className={`px-2 py-1.5 text-right font-bold ${maxReturnColorClass(item.exitDay3Pct)}`}>{formatPct(item.exitDay3Pct)}</td>
                {/* 최고점(MFE) — 사후에만 알 수 있는 값이라 회색 격하 */}
                <td
                  className="px-2 py-1.5 text-right text-slate-400 dark:text-zinc-500"
                  title="관측 창(0~10일) 중 최고 도달 수익률 — 사후에만 알 수 있어 실현 불가"
                >
                  {formatPct(item.maxReturnSoFarPct)}
                </td>
                {showDetail && (
                  <>
                    <td className={`px-2 py-1.5 text-right ${maxReturnColorClass(endReturnPct)}`}>{formatPct(endReturnPct)}</td>
                    <td className={`px-2 py-1.5 text-right ${maxReturnColorClass(item.minReturnSoFarPct)}`}>{formatPct(item.minReturnSoFarPct)}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500 dark:text-zinc-400">
                      {drawdown != null ? `-${drawdown.toFixed(1)}%p` : "—"}
                    </td>
                  </>
                )}
                <td className="px-2 py-1.5 text-center">
                  {win == null ? (
                    <span
                      className="text-slate-400 dark:text-zinc-500"
                      title={item.corporateAction ? `${CORPORATE_ACTION_NOTICE} — 통계 제외` : "거래정지로 3일차 종가 없음 — 통계 제외"}
                    >
                      제외
                    </span>
                  ) : win ? (
                    <span className="text-rose-500 font-bold">승</span>
                  ) : (
                    <span className="text-blue-500 font-bold">패</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 접이식 섹션 — ReadGuide(판정 기준)와 퀀트 신호 참고 통계 토글이 공유하는 UI.
function CollapsibleSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        <Info className="w-3.5 h-3.5" />
        {label}
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="mt-3 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl p-4 space-y-3 text-sm">
          {children}
        </div>
      )}
    </div>
  );
}

// 퀀트 신호 참고 통계 토글 — 판정 조건 + 청산 규칙별 성과 표(2026-10-20: 헤드라인에서 내려온
// 승률·손익비·기대값·Kelly 전부를 여기로 이동). 헤드라인은 3줄만 남기고, 상세 수치는 펼쳐야만
// 보이게 해서 "작은 표본의 숫자"가 매매 근거처럼 읽히지 않도록 한다.
function QuantReferenceToggle({ stats }: { stats: QuantSignalStats }) {
  const rows: { label: string; s: ExitStats; muted?: boolean; title?: string }[] = [
    { label: "3일차 종가", s: stats.exitDay3 },
    { label: `3일차 비용차감 (왕복 ${stats.roundTripCostPct}%)`, s: stats.exitDay3Net },
    { label: `손절 ${stats.stopLossThresholdPct}% (종가 기준)`, s: stats.exitStop10 },
    { label: "극단값 제외 (상·하위 각 1건)", s: stats.exitDay3Trimmed },
    {
      label: "최고점 상한 (실현 불가)",
      s: stats.peak,
      muted: true,
      title: "3일차 +10% 이상이면 이후 최고가에 팔았다고 가정 — 사후에만 알 수 있어 실현 불가",
    },
  ];
  return (
    <CollapsibleSection label="퀀트신호 판정 기준 및 통계 근거 보기">
      <p className="text-xs text-slate-600 dark:text-zinc-300">판정 조건: {QUANT_SIGNAL_META.condition}</p>
      {stats.resultCount > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-slate-400 dark:text-zinc-500 border-b border-slate-100 dark:border-zinc-800">
                  <th className="text-left px-2 py-1.5 font-semibold">기준</th>
                  <th className="text-right px-2 py-1.5 font-semibold">승률</th>
                  <th className="text-right px-2 py-1.5 font-semibold">손익비</th>
                  <th className="text-right px-2 py-1.5 font-semibold">기대값</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Kelly</th>
                  <th className="text-right px-2 py-1.5 font-semibold">n</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.label}
                    title={r.title}
                    className={`border-b border-slate-50 dark:border-zinc-800/60 ${
                      r.muted ? "text-slate-400 dark:text-zinc-500" : "text-slate-600 dark:text-zinc-300"
                    }`}
                  >
                    <td className="text-left px-2 py-1.5">{r.label}</td>
                    <td className="text-right px-2 py-1.5">
                      {r.s.winRatePct != null ? `${r.s.winRatePct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="text-right px-2 py-1.5">{r.s.profitFactor}</td>
                    <td className={`text-right px-2 py-1.5 ${r.muted ? "" : priceColorClass(r.s.expectancy, 0)}`}>
                      {r.s.expectancy >= 0 ? "+" : ""}
                      {r.s.expectancy}%
                    </td>
                    <td className="text-right px-2 py-1.5">{r.s.kellyPct != null ? `${r.s.kellyPct}%` : "—"}</td>
                    <td className="text-right px-2 py-1.5">{r.s.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            표본 n&lt;{QUANT_MIN_RELIABLE_N} — 손익비 차이 0.3 이내는 노이즈
          </p>
        </>
      )}
      <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{QUANT_OBSERVATION_END_DISCLAIMER}</p>
    </CollapsibleSection>
  );
}

function ReadGuide() {
  return (
    <div className="mb-6">
      <CollapsibleSection label="칸반 판정 기준 보기">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-slate-400 dark:text-zinc-500 border-b border-slate-100 dark:border-zinc-800">
                <th className="text-left py-1.5 pr-3 font-semibold whitespace-nowrap">판정</th>
                <th className="text-left py-1.5 pr-3 font-semibold whitespace-nowrap">조건</th>
                <th className="text-left py-1.5 font-semibold whitespace-nowrap">의미</th>
              </tr>
            </thead>
            <tbody>
              {READ_GUIDE.criteria.map((row) => (
                <tr key={row.verdict} className="border-b last:border-0 border-slate-50 dark:border-zinc-800/60">
                  <td className="py-1.5 pr-3 font-semibold text-slate-700 dark:text-zinc-200 whitespace-nowrap">
                    {row.verdict}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-600 dark:text-zinc-300 whitespace-nowrap">
                    {row.condition}
                  </td>
                  <td className="py-1.5 text-slate-500 dark:text-zinc-400">{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </div>
  );
}

export default function TrackingPage() {
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [pendingFavorites, setPendingFavorites] = useState<Set<string>>(new Set());
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllQuantResults, setShowAllQuantResults] = useState(false);

  function toggleExpand(symbol: string) {
    setExpandedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  useEffect(() => {
    async function fetchTracking() {
      try {
        const res = await fetch("/api/screening/tracking");
        if (!res.ok) throw new Error("Failed to fetch tracking data");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchTracking();
  }, []);

  // §1 stage 가시성 + §3 검색: 검색어가 없으면 primary(0~10일) 단계만 기본 노출(기존 4컬럼
  // 칸반 동작 유지). 검색어가 있으면 전체 단계(secondary/ended 포함)에서 이름/코드로 매칭되는
  // 종목을 찾아 보여준다 — 추가 API 호출 없이 이미 로드된 data.items에서 클라이언트 필터링.
  const isSearching = searchQuery.trim().length > 0;
  const items = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.items.filter((i) => {
      if (favoriteOnly && !i.isFavorite) return false;
      if (q.length > 0) {
        return i.name.toLowerCase().includes(q) || i.symbol.toLowerCase().includes(q);
      }
      return i.stage === "primary";
    });
  }, [data, favoriteOnly, searchQuery]);

  async function toggleFavorite(item: TrackingItem) {
    // 화면이 symbol 단위로 그룹화됐으므로 즐겨찾기도 symbol을 키로 다룬다(대표 포착일은
    // API 호출 시 등록용으로만 전달 — favorite/route.ts가 symbol 단위로 체크/해제한다).
    const key = item.symbol;
    if (pendingFavorites.has(key)) return;

    const nextFavorite = !item.isFavorite;
    setPendingFavorites((prev) => new Set(prev).add(key));
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) => (i.symbol === item.symbol ? { ...i, isFavorite: nextFavorite } : i)),
          }
        : prev
    );

    try {
      const res = await fetch("/api/screening/tracking/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: item.symbol, discoveryDate: item.discoveryDate, favorite: nextFavorite }),
      });
      if (!res.ok) throw new Error("Failed to toggle favorite");
    } catch (err) {
      console.error(err);
      // 실패 시 낙관적 업데이트 롤백
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((i) => (i.symbol === item.symbol ? { ...i, isFavorite: item.isFavorite } : i)),
            }
          : prev
      );
    } finally {
      setPendingFavorites((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <DashboardHeader />
        <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-5xl animate-pulse">
          <div className="h-6 w-48 bg-slate-200 dark:bg-zinc-800 rounded mb-6" />
          <div className="h-16 bg-slate-100 dark:bg-zinc-800/50 rounded-2xl mb-8" />
          <div className="space-y-4">
            <div className="h-28 bg-slate-50 dark:bg-zinc-950 rounded-2xl" />
            <div className="h-28 bg-slate-50 dark:bg-zinc-950 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <DashboardHeader />
        <main className="flex-1 container mx-auto px-4 py-12 flex flex-col items-center justify-center text-slate-400 dark:text-zinc-500">
          <XCircle className="w-12 h-12 mb-4 text-red-500" />
          <h2 className="text-xl font-bold mb-2">오류 발생</h2>
          <p className="text-sm mb-4">데이터를 불러오는 중 문제가 발생했습니다.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
          >
            다시 시도
          </button>
        </main>
      </div>
    );
  }

  const { summary, quantSignalStats } = data;
  const corporateActionItems = items.filter((i) => i.corporateAction);
  // 퀀트 신호 카드는 즐겨찾기 개념이 없으므로 "즐겨찾기만" 필터가 켜지면 표시하지 않는다.
  // 헤드라인 통계(승률/손익비 등)는 이 즐겨찾기 필터와 무관하게 항상 전체 표본 기준(data.quantSignalStats)
  // 이므로 아래 favoriteOnly/검색 필터링은 카드 목록 표시에만 영향을 준다.
  const quantSignalItemsFavFiltered = favoriteOnly ? [] : data.quantSignalItems;
  // 관찰 중/종료(2026-10-30 통일) — 서버 observationEnded 하나로만 가른다. 종료 = day3 종가 존재
  // (헤드라인 n과 같은 집합) + 거래정지로 관측 미완 종료. 관찰 중 = 발견 후 3거래일 미경과.
  // 엄격 비교 — 필드가 없는 응답(구버전 API 응답이 남아 있는 경우 등)이 관찰 중으로 새지 않게 한다.
  const quantObservingItemsBase = quantSignalItemsFavFiltered.filter((item) => item.observationEnded === false);
  const quantEndedItemsBase = quantSignalItemsFavFiltered.filter((item) => item.observationEnded === true);

  // §4: 검색어는 4컬럼 칸반뿐 아니라 퀀트 신호 트래커(판단대기+결과확인)에도 동일하게 적용된다.
  const quantSearchQuery = searchQuery.trim().toLowerCase();
  const matchesQuantSearch = (item: QuantSignalItem) =>
    quantSearchQuery.length === 0 ||
    item.name.toLowerCase().includes(quantSearchQuery) ||
    item.symbol.toLowerCase().includes(quantSearchQuery);
  const quantObservingItems = quantObservingItemsBase.filter(matchesQuantSearch);
  const quantEndedItems = quantEndedItemsBase.filter(matchesQuantSearch);
  const quantHaltIncompleteCount = quantEndedItems.filter((i) => i.haltIncomplete).length;
  const quantCorporateActionCount = quantEndedItems.filter((i) => i.corporateAction).length;
  const quantEndedWithDay3Count = quantEndedItems.length - quantHaltIncompleteCount - quantCorporateActionCount;

  // 동일 symbol이 서로 다른 발굴일에 여러 번 독립적으로 퀀트 신호 조건을 만족한 경우(정상 설계,
  // 2026-09-17 검증됨 — 예: 대원전선 7/3·7/14), 카드를 이벤트별로 따로 그리지 않고 종목(symbol)
  // 단위로 1장에 합친다(2026-09-18 재작업 — 이전 "퀀트신호 1/2" 배지 방식은 폐기). discoveryDate
  // 오름차순으로 정렬된 이력 목록을 한 카드 안에 세로로 나열한다.
  const quantObservingGroups = groupQuantItemsBySymbol(quantObservingItems);

  // §2: "관찰 중" 카드는 최근 20개 종목(그룹)만 기본 노출 + 토글로 전체 펼침. 검색 중일 때는
  // 페이지네이션을 무시하고 매칭되는 전체를 보여준다(검색 결과가 페이지네이션에 가려지면 안 됨).
  const QUANT_RESULT_PAGE_SIZE = 20;
  const quantObservingGroupsVisible =
    isSearching || showAllQuantResults ? quantObservingGroups : quantObservingGroups.slice(0, QUANT_RESULT_PAGE_SIZE);

  // 고점 대비 낙폭 참고 패널 — 승률/손익비/기대값/극단값 제외/비용 차감은 전부 백엔드
  // quantSignalStats(규칙별 ExitStats)에서 내려오므로 여기서 다시 계산하지 않는다(종전 중복 계산
  // 제거). 낙폭만 "최고점(MFE) 대비 3일차 청산 시 얼마나 반납했는지"로, 헤드라인과 같은
  // 기준(exitDay3Pct)에서 센다. 카드의 "참고" 낙폭(대비 현재가)과는 기준이 다르다.
  const quantStatsResultItems = data.quantSignalItems.filter((i) => i.exitDay3Pct != null);
  const quantExtraStats = (() => {
    const drawdowns = quantStatsResultItems
      .map((it) => drawdownFromPeak(it.maxReturnSoFarPct, it.exitDay3Pct))
      .filter((d): d is number => d != null);
    if (drawdowns.length === 0) return null;
    const avgDrawdown = Number((drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length).toFixed(2));
    return { avgDrawdown };
  })();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />

      <main className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-5xl">
        {/* 상단 */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/overnight"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            <ArrowLeft className="w-4 h-4" />
            오버나이트 스크리닝으로
          </Link>
        </div>

        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-zinc-50 mb-2">
          포착 종목 추적
        </h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mb-3">
          추적 중 {summary.total} · 약세전환 {summary.stopLoss} · 강세지속{" "}
          {summary.hold} · 판단대기 {summary.watching}
          {summary.corporateActionExcluded > 0 && (
            <span className="text-amber-600 dark:text-amber-400"> · 자본변동 제외 {summary.corporateActionExcluded}</span>
          )}
        </p>

        {/* 검색(§3) + 즐겨찾기 필터 — 둘 다 우측 정렬로 나란히 배치(좁은 화면에서는 줄바꿈 허용).
            검색어가 있으면 4컬럼 칸반의 11~30일(결과 관찰)/30일초과(종료) 종목뿐 아니라 퀀트 신호
            트래커(판단대기+결과확인)에서도 동일하게 매칭된다(§4). 추가 API 호출 없이 이미 로드된
            데이터에서 클라이언트 사이드로 필터링한다. */}
        <div className="flex items-center justify-end gap-2 mb-6 flex-wrap">
          <div className="relative w-56 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="종목명 또는 코드 검색..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 transition-colors"
            />
          </div>
          <button
            onClick={() => setFavoriteOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border transition-colors flex-shrink-0 ${
              favoriteOnly
                ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400"
                : "border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700"
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${favoriteOnly ? "fill-amber-500 text-amber-500" : ""}`} />
            즐겨찾기만
          </button>
        </div>

        <ReadGuide />

        {/* 퀀트 신호 트래커 — 칸반(포착 종목 전체 관찰)과 완전히 분리된 별도 트랙. 발굴일 저장 지표
            (stock_trajectory day0 rsi14·vol_ratio_20)가 조건에 걸린 건을 기간 제한 없이 영구히
            추적한다 — quant_signal 컬럼 기준이 아니며, 진행 중인 아웃오브샘플 관측이다.
            3일 미만은 "판단 대기", 3일 이상은 "결과 확인 중"으로 나눠 보여준다. 항목 없으면 섹션 자체를 그리지 않는다. */}
        {quantSignalItemsFavFiltered.length > 0 && (
          <section className="mb-8 bg-amber-50/40 dark:bg-amber-950/10 rounded-3xl p-5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">
              ⚡ 퀀트 신호 트래커{!isSearching && ` ${quantSignalStats.totalCount}건`}
            </h2>
            {/* 선정 기준 한 줄 — 서버 A트랙 쿼리 조건(tracking/route.ts)과 같아야 한다. */}
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              RSI 50~60 · 거래량비 200~400% (발굴일 저장 지표 기준) — 참고용 관찰
            </p>
            {/* 헤드라인(2026-10-29) — 백테스트 검증 종료 결론(analysis/hypothesis-log.md 최종 정리)을
                고정 문구로 둔다. 실시간 기대값으로 상태를 바꾸지 않는다. */}
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400 mt-2">
              검증 완료 — 알파 없음 (가설 10건, 2020~2026)
            </p>
            {/* §1 — 검색 중에는 헤더 건수(전체 표본)와 실제 표시 카드 수가 달라 혼동될 수 있어
                별도로 분리 표시한다. 헤드라인 통계는 검색 여부와 무관하게 항상 전체 표본 기준이므로
                "(전체 표본 기준)"을 명시해 검색 결과 건수와 섞이지 않게 한다. */}
            {isSearching && (
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                검색 결과: {quantObservingItems.length + quantEndedItems.length}건 표시 중
              </p>
            )}

            {/* 실측 요약 2줄 — 승률·손익비·Kelly·비용차감·손절·극단값·최고점 상한·신뢰도 배지·
                표본부족 경고는 전부 아래 "통계 근거 보기" 접기 안의 규칙별 표에 있다. */}
            {quantSignalStats.resultCount > 0 ? (
              <div className="mt-0.5">
                {/* 1줄: 표본 — 기대값은 헤드라인 바로 아래에서 결론("알파 없음")과 모순돼 보여 뺐다
                    (2026-11-02). 비용 차감 전후 기대값은 아래 "통계 근거 보기" 표에 있다. */}
                <p className="text-sm text-slate-700 dark:text-zinc-300 mt-0.5">
                  3일차 결과 {quantSignalStats.resultCount}건
                  <span className="text-slate-400 dark:text-zinc-500">
                    {"  ·  표본 "}
                    {quantSignalStats.sampleSymbolCount}종목
                  </span>
                  {quantSignalStats.corporateActionExcludedCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {"  ·  자본변동 제외 "}
                      {quantSignalStats.corporateActionExcludedCount}건
                    </span>
                  )}
                </p>
                {/* 2줄: 평균 최고 → 3일차 (고점 반납) */}
                {quantSignalStats.avgMaxReturnSoFarPct != null && quantSignalStats.avgDay3ReturnPct != null && (
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    평균 최고 {quantSignalStats.avgMaxReturnSoFarPct >= 0 ? "+" : ""}
                    {quantSignalStats.avgMaxReturnSoFarPct.toFixed(1)}% → 3일차{" "}
                    {quantSignalStats.avgDay3ReturnPct >= 0 ? "+" : ""}
                    {quantSignalStats.avgDay3ReturnPct.toFixed(1)}%
                    {quantExtraStats && ` (고점 반납 -${quantExtraStats.avgDrawdown.toFixed(1)}%p)`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-zinc-500 mt-1">
                3일차 결과 대기 중
              </p>
            )}

            <div className="mt-3 mb-4">
              <QuantReferenceToggle stats={quantSignalStats} />
            </div>

            {/* 헤더 건수는 observationEnded 하나로만 센다 — 관찰 중 + 관찰 종료 = 전체. */}
            {quantObservingItems.length + quantEndedItems.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">
                  관찰 중 {quantObservingItems.length}건({quantObservingGroups.length}종목) · 관찰 종료{" "}
                  {quantEndedItems.length}건
                </h3>
                {quantObservingGroups.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-zinc-500">관찰 중인 신호 없음</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                      {quantObservingGroupsVisible.map((group) => (
                        <QuantGroupedCard
                          key={group.symbol}
                          group={group}
                          endedEvents={quantEndedItems.filter((e) => e.symbol === group.symbol)}
                        />
                      ))}
                    </div>
                    {/* §2 페이지네이션 — 검색 중에는 숨김(전체 매칭 결과를 이미 그대로 보여주는 중) */}
                    {!isSearching && quantObservingGroups.length > QUANT_RESULT_PAGE_SIZE && (
                      <button
                        onClick={() => setShowAllQuantResults((v) => !v)}
                        className="mt-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {showAllQuantResults
                          ? "최근 20종목만 보기"
                          : `전체 이력 보기 (${quantObservingGroups.length}종목)`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 관찰 종료(observationEnded) 건은 카드 대신 정렬 가능한 표로. day3 종가가 있는 건수가
                헤드라인 n과 같고, 거래정지로 관측 미완 종료된 건은 따로 센다(통계 제외). */}
            {quantEndedItems.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">
                  관찰 종료 {quantEndedWithDay3Count}건
                  {quantHaltIncompleteCount > 0 && (
                    <span className="ml-1 text-xs font-normal text-amber-600 dark:text-amber-400">
                      + 거래정지로 관측 미완 {quantHaltIncompleteCount}건(통계 제외)
                    </span>
                  )}
                  {quantCorporateActionCount > 0 && (
                    <span className="ml-1 text-xs font-normal text-amber-600 dark:text-amber-400">
                      + 자본변동 {quantCorporateActionCount}건(통계 제외)
                    </span>
                  )}
                </h3>
                <QuantEndedTable items={quantEndedItems} />
              </div>
            )}

          </section>
        )}

        {/* 굵은 구분선 — A트랙(퀀트신호, 위)과 B트랙(칸반, 아래)의 성격 차이를 시각적으로 분리(§2).
            A는 RSI·거래량 조건의 장기 통계 검증용, B는 오버나이트 발굴 종목의 단기 상태 관찰용으로
            서로 완전히 다른 체계다 — 동일 종목이 양쪽에 동시에 나타날 수 있는 것도 이 때문이다. */}
        <hr className="my-8 border-t-4 border-slate-200 dark:border-zinc-800 rounded-full" />
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">
          오버나이트 스크리닝 발굴 종목의 단기(최근 10일) 상태 관찰
        </p>

        <div className="bg-blue-50/30 dark:bg-blue-950/10 rounded-3xl p-5">
        {items.length === 0 ? (
          <div className="py-16 bg-white dark:bg-zinc-900 rounded-[24px] border border-transparent shadow-sm flex flex-col items-center justify-center text-slate-400 dark:text-zinc-500">
            <Activity className="w-10 h-10 mb-2 opacity-50" />
            <span>
              {isSearching
                ? "일치하는 종목 없음"
                : favoriteOnly
                  ? "즐겨찾기한 종목이 없습니다."
                  : "추적 중인 종목이 없습니다."}
            </span>
          </div>
        ) : (
          <>
            {/* 데스크톱(sm 이상): 4컬럼 칸반. 컬럼은 min-w-[220px] 아래로 줄어들지 않고, 화면이
                좁아 4개를 다 못 담으면 컬럼이 깨지는 대신 칸반 전체가 가로 스크롤된다(스크롤바는
                시각적으로만 숨김, no-scrollbar). 컬럼 내부 카드 목록도 세로 스크롤은 유지하되
                스크롤바만 숨긴다. 드래그 앤 드롭 없음. */}
            <div className="hidden sm:block overflow-x-auto no-scrollbar">
              <div className="flex gap-3 items-start pb-1">
                {SECTION_ORDER.map((verdict) => {
                  const sectionItems = sortSectionItems(
                    verdict,
                    items.filter((i) => i.verdict === verdict)
                  );
                  const meta = SECTION_META[verdict];

                  return (
                    <div
                      key={verdict}
                      className={`flex flex-col flex-1 basis-0 min-w-[220px] rounded-2xl p-3 ${meta.bg}`}
                    >
                      {/* 헤더 높이를 4컬럼 공통 고정값으로 맞춰, 통계 문구 줄바꿈 여부와 무관하게
                          아래 카드 목록의 시작 지점(헤더 하단선)이 컬럼마다 수평으로 일치하도록 함.
                          구역 구분을 위해 dot과 동일 색의 테두리를 두르고, 제목은 가운데 정렬 + 확대. */}
                      <div className="min-h-[76px]">
                        <h2 className="flex items-center justify-center gap-1.5 text-sm font-bold text-slate-700 dark:text-zinc-300">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                          <span className="truncate">
                            {meta.title} {sectionItems.length}건
                          </span>
                        </h2>
                        <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 text-center">
                          ({meta.sortHint})
                        </p>
                        {meta.hasReference && (
                          <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1 text-center">
                            과거 유사구간 참고
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 mt-3 max-h-[calc(100vh-320px)] min-h-[120px] overflow-y-auto no-scrollbar pr-1">
                        {sectionItems.length === 0 ? (
                          <div className="py-8 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl text-center text-xs text-slate-400 dark:text-zinc-500">
                            해당 없음
                          </div>
                        ) : (
                          sectionItems.map((item) => (
                            <CompactCard
                              key={item.symbol}
                              symbol={item.symbol}
                              name={item.name}
                              returnPct={item.returnPct}
                              dateLabel="현재 사이클 시작"
                              discoveryDate={item.discoveryDate}
                              daysAfter={item.daysAfter}
                              entryClose={item.entryClose}
                              currentClose={item.currentClose}
                              favorite={{
                                isFavorite: item.isFavorite,
                                pending: pendingFavorites.has(item.symbol),
                                onToggle: () => toggleFavorite(item),
                              }}
                              stageBadge={item.stage !== "primary" ? STAGE_LABEL[item.stage] : undefined}
                              trackTone="kanban"
                              footer={
                                <>
                                  <CaptureInfo
                                    captureCount={item.captureCount}
                                    captureHistory={item.captureHistory}
                                    maxReturnPct={item.maxReturnPct}
                                    minReturnPct={item.minReturnPct}
                                    expanded={expandedSymbols.has(item.symbol)}
                                    onToggleExpand={() => toggleExpand(item.symbol)}
                                  />
                                  {item.priorCycleEntryDates.length > 0 && (
                                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                                      이전 사이클 시작: {item.priorCycleEntryDates.map(formatDiscoveryDate).join(", ")}
                                    </p>
                                  )}
                                </>
                              }
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 모바일(sm 미만): 기존 세로 섹션 방식 유지 (퀀트 신호는 위 독립 섹션에서 이미 표시) */}
            <div className="sm:hidden">
              {SECTION_ORDER.map((verdict) => {
                const sectionItems = sortSectionItems(
                  verdict,
                  items.filter((i) => i.verdict === verdict)
                );
                if (sectionItems.length === 0) return null;

                const meta = SECTION_META[verdict];

                return (
                  <section key={verdict} className="mb-10">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                      {meta.title} {sectionItems.length}건
                      <span className="text-xs font-normal text-slate-400 dark:text-zinc-500">({meta.sortHint})</span>
                    </h2>
                    {meta.hasReference ? (
                      <p className="text-xs text-slate-400 dark:text-zinc-500 mb-3">과거 유사구간 참고</p>
                    ) : (
                      <div className="mb-3" />
                    )}

                    <div className="grid grid-cols-1 gap-3">
                      {sectionItems.map((item) => (
                        <CompactCard
                          key={item.symbol}
                          symbol={item.symbol}
                          name={item.name}
                          returnPct={item.returnPct}
                          dateLabel="현재 사이클 시작"
                          discoveryDate={item.discoveryDate}
                          daysAfter={item.daysAfter}
                          entryClose={item.entryClose}
                          currentClose={item.currentClose}
                          favorite={{
                            isFavorite: item.isFavorite,
                            pending: pendingFavorites.has(item.symbol),
                            onToggle: () => toggleFavorite(item),
                          }}
                          stageBadge={item.stage !== "primary" ? STAGE_LABEL[item.stage] : undefined}
                          trackTone="kanban"
                          footer={
                            <>
                              <CaptureInfo
                                captureCount={item.captureCount}
                                captureHistory={item.captureHistory}
                                maxReturnPct={item.maxReturnPct}
                                minReturnPct={item.minReturnPct}
                                expanded={expandedSymbols.has(item.symbol)}
                                onToggleExpand={() => toggleExpand(item.symbol)}
                              />
                              {item.priorCycleEntryDates.length > 0 && (
                                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                                  이전 사이클 시작: {item.priorCycleEntryDates.map(formatDiscoveryDate).join(", ")}
                                </p>
                              )}
                            </>
                          }
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* 자본변동 건은 판정이 없어 칸반 어디에도 속하지 않는다 — 데스크톱·모바일 공통으로 따로 둔다 */}
            {corporateActionItems.length > 0 && (
              <section className="mt-4">
                <h2 className="text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">
                  자본변동 제외 {corporateActionItems.length}건
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {corporateActionItems.map((item) => (
                    <CompactCard
                      key={item.symbol}
                      symbol={item.symbol}
                      name={item.name}
                      returnPct={item.returnPct}
                      dateLabel="현재 사이클 시작"
                      discoveryDate={item.discoveryDate}
                      daysAfter={item.daysAfter}
                      entryClose={item.entryClose}
                      currentClose={item.currentClose}
                      stageBadge={item.stage !== "primary" ? STAGE_LABEL[item.stage] : undefined}
                      trackTone="kanban"
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        </div>
      </main>
    </div>
  );
}
