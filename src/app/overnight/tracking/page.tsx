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

interface TrackingItem {
  symbol: string;
  name: string;
  discoveryDate: string; // YYYYMMDD — 현재 관찰 사이클의 entryDate
  daysAfter: number; // 현재 관찰 사이클 entryDate로부터 경과 거래일수
  entryClose: number; // 포착가 (현재 관찰 사이클 entryDate 종가)
  currentClose: number;
  returnPct: number; // 예상수익률 (현재 관찰 사이클 포착가 대비)
  verdict: Verdict; // 현재 관찰 사이클 기준 판정
  isFavorite: boolean;
  captureCount: number; // 현재 관찰 사이클 내 포착(재등장) 횟수
  captureDates: string[]; // 포착일 목록(현재 사이클), 오름차순
  captureHistory: { date: string; entryClose: number }[]; // 포착일+그날 진입가(현재 사이클), 오름차순
  maxReturnPct: number; // 현재 사이클 포착가 대비 이후 최고 등락률(MFE)
  minReturnPct: number; // 현재 사이클 포착가 대비 이후 최저 등락률(MAE)
  stage: TrackingStage;
  cycleNumber: number; // 이 종목의 몇 번째 관찰 사이클인지(1부터)
  priorCycleCount: number; // 이전에 완전 종료된(30일 초과 후 리셋된) 사이클 수
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
  day3ReturnPct: number | null;
  maxReturnSoFarPct: number | null; // 참고용(낙관적) — 실현 아님. 계산 창 0~10일(2026-09-18 축소)
  realizedReturnPct: number | null; // 3일차 규칙 실현손익 시뮬레이션 — 헤드라인 승률의 기준(변경 없음)
  endDate: string | null; // daysAfter>=10 도달 시: day10 시점 거래일(종료일자, 고정값)
  endClose: number | null; // daysAfter>=10 도달 시: day10 시점 종가(종료가, 고정값)
  endReturnPct: number | null; // (endClose-entryClose)/entryClose — 카드에 표시하는 "실현수익률"
  isRecentlyActive: boolean; // 관찰 지속성 보조표시(참고용) — daysAfter<30이면 항상 false(변경 없음)
}

interface QuantSignalStats {
  totalCount: number;
  resultCount: number;
  avgDay3ReturnPct: number | null;
  avgMaxReturnSoFarPct: number | null;
  realizedWinCount: number; // 헤드라인 승률의 승 건수(3일차 규칙 실현손익 기준)
  realizedLossCount: number;
  realizedWinRatePct: number | null;
  profitFactor: number;
  expectancy: number;
  sampleSymbolCount: number; // 신뢰도 배지용 — 이벤트(건) 수가 아니라 unique symbol 수
}

interface TrackingResponse {
  ok: boolean;
  summary: { total: number; stopLoss: number; hold: number; watching: number };
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

// 표본 부족 신뢰도 배지 (2026-09-09 stockker_findings.md 정리 결과 반영) — n은 quant_signal 이벤트
// 건수가 아니라 unique symbol 수(표본 독립성 문제로 종목 기준). 임계값은 하드코딩 상수.
// n>=60 도달 시에도 이 배지는 자동으로 "검증 완료"를 의미하지 않는다 — 실제 재검증 쿼리를 별도로
// 돌려 수치를 갱신한 뒤에만 결론을 신뢰할 수 있음(자동 판정 금지).
const QUANT_RELIABILITY_TARGET_N = 60;
function quantSignalReliability(n: number): { emoji: string; label: string; showProgress: boolean } {
  if (n >= QUANT_RELIABILITY_TARGET_N) {
    return { emoji: "🟢", label: "신뢰도: 검증 중(재평가 완료)", showProgress: false };
  }
  if (n >= 30) {
    return { emoji: "🟡", label: "신뢰도: 낮음 (표본 부족, 검증 진행 중)", showProgress: true };
  }
  return { emoji: "🔴", label: "신뢰도: 매우 낮음 (표본 부족, 검증 진행 중)", showProgress: true };
}

/**
 * 섹션 헤더에 표시하는 정렬 기준 문구 (하드코딩 상수, 섹션당 1회만 표시). 상세 수치 근거(회복률 등)는
 * 상시 노출하지 않고 ReadGuide(상단 "판정 기준" 토글)의 evidence로만 제공한다.
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
 * 판정 규칙과 수치 근거만 간결하게 제공한다. */
const READ_GUIDE = {
  criteria: [
    { verdict: "약세 전환", condition: "2일차 이후 -10% 초과 하락", meaning: "회복 확률이 낮은 구간" },
    { verdict: "강세 지속", condition: "2일차 이후 +10% 초과 상승", meaning: "추가 상승 가능성이 높은 구간" },
    { verdict: "혼조", condition: "그 사이", meaning: "방향성 불명확" },
    { verdict: "판단 대기", condition: "아직 2일 미도달", meaning: "판단 유보" },
  ],
  evidenceIntro:
    "2026 6~8월 포착 250건(102종목) · 30거래일 궤적 기준. 역배열 하락장 데이터라 국면 전환 시 재검증 필요.",
  evidence: [
    "3일차 +10% 이상: 회복률 63~69%, 최대 +25~60%, 최대 낙폭 -8%",
    "3일차 -10% 이하: 회복률 28~37%, 최대 낙폭 -27~-40%",
    "그 사이: 회복률 38~52%",
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
    sorted.sort((a, b) => a.returnPct - b.returnPct);
  } else if (verdict === "hold") {
    sorted.sort((a, b) => b.returnPct - a.returnPct);
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
  maxReturnPct: number;
  minReturnPct: number;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  if (captureCount <= 1) return null;

  const showDots = captureCount >= 2;
  const showMinMax = captureCount >= 3;
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
  returnPct: number;
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
        <span className={`text-base font-extrabold flex-shrink-0 ${priceColor}`}>
          {returnPct >= 0 ? "+" : ""}
          {returnPct.toFixed(1)}%
        </span>
      </div>

      {/* 중단: 포착일·경과일·가격 (현재가는 예상수익률과 동일한 색상 규칙 적용). dateLine이 오면
          표준 줄 대신 그걸 그린다(퀀트 관찰종료 카드 전용 "발굴일→종료일" 형식). */}
      {dateLine ?? (
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5">
          {dateLabel} {formatDiscoveryDate(discoveryDate)} ({daysAfter}일 경과) · {entryClose.toLocaleString()} →{" "}
          <span className={priceColor}>{currentClose.toLocaleString()}</span>
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
// 2026-09-18 수정: "관찰 종료" 기준을 30영업일→10영업일로 축소(9/9 확정 실전 관리 규칙 —
// 3일차 판정 후 +10%면 최대 2주(약 10영업일) 보유 — 와 정합). B트랙(4컬럼 칸반) 값과 우연히
// 같은 10이지만 완전히 별개 상수다. "관찰 종료" 여부는 (raw daysAfter가 아니라) 백엔드가 day10
// halt-safe 데이터로 실제 계산해준 item.endDate 존재 여부로 판단한다 — halt로 day10 전에 끊긴
// 극히 드문 경우 무리하게 종료 처리하지 않고 "관찰 중"으로 안전하게 폴백하기 위함.
const QUANT_OBSERVATION_END_DAYS_AFTER_CLIENT = 10;
// 2026-09-18 — "관찰 종료"가 매도 신호로 오인되지 않도록 명시하는 문구. 트레일링 스탑 등 3일차
// 판정 이후의 청산 규칙은 검증 시도(9/17)했으나 "보유 지속" 표본이 작아 결론을 낼 수
// 없었다 — 즉 아직 존재하지 않는 규칙. 배지 툴팁과 참고 통계 토글 양쪽에서 동일 문구를 재사용한다.
const QUANT_OBSERVATION_END_DISCLAIMER =
  "참고: 이 시점은 관찰을 멈추는 기준일 뿐, 매도 시점을 의미하지 않습니다. 청산 규칙은 아직 검증되지 않았습니다.";

// 관찰 종료(endDate 존재) 카드의 상단 배지/가격 표시값 — "실현수익률"(endClose 기준)로 전환.
// 아직 종료 전(또는 halt로 day10 데이터를 못 얻은 경우)이면 기존처럼 현재가/실시간 수익률 사용.
function quantDisplayClose(item: QuantSignalItem): number {
  return item.endClose ?? item.currentClose;
}
function quantDisplayReturnPct(item: QuantSignalItem): number {
  const close = quantDisplayClose(item);
  return ((close - item.entryClose) / item.entryClose) * 100;
}
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
  // 관찰 중(아직 끝나지 않은 신호가 하나라도 있는 카드)을 관찰 종료보다 먼저 보여준 뒤,
  // 각 그룹 내에서는 최근 발굴순으로 정렬한다.
  groups.sort((a, b) => {
    const aEnded = a.events.every((e) => e.group === "result" && e.endDate != null);
    const bEnded = b.events.every((e) => e.group === "result" && e.endDate != null);
    if (aEnded !== bEnded) return aEnded ? 1 : -1;
    return b.sortKey.localeCompare(a.sortKey);
  });
  return groups;
}

// 그룹 카드 안의 이력 한 줄 — pending(판단 대기)/관찰 중/관찰 종료 세 가지 형태를 전부 처리한다.
function QuantHistoryRow({ item }: { item: QuantSignalItem }) {
  if (item.group === "pending") {
    const daysLeft = QUANT_SIGNAL_FRESH_DAYS_CLIENT - item.daysAfter;
    return (
      <div className="text-xs text-slate-500 dark:text-zinc-400 py-1.5 border-t border-slate-100 dark:border-zinc-800/80 first:border-t-0 first:pt-0">
        {formatDiscoveryDate(item.discoveryDate)} (D+{item.daysAfter}) · RSI{" "}
        {item.rsi14 != null ? item.rsi14.toFixed(1) : "—"} · 거래량{" "}
        {item.volumeRatio != null ? `${item.volumeRatio.toFixed(0)}%` : "—"}
        <span className="text-slate-400 dark:text-zinc-500"> · {daysLeft}일 후 판단 예정</span>
      </div>
    );
  }

  const isEnded = item.endDate != null;
  const displayClose = quantDisplayClose(item);
  const displayReturnPct = quantDisplayReturnPct(item);
  const priceColor = priceColorClass(displayClose, item.entryClose);
  const mrColor = maxReturnColorClass(item.maxReturnSoFarPct);

  return (
    <div className="text-xs py-1.5 border-t border-slate-100 dark:border-zinc-800/80 first:border-t-0 first:pt-0 flex items-center justify-between gap-2 flex-wrap">
      <span className="text-slate-500 dark:text-zinc-400">
        {isEnded ? (
          <>
            {formatDiscoveryDate(item.discoveryDate)} → {formatDiscoveryDate(item.endDate!)} (
            {QUANT_OBSERVATION_END_DAYS_AFTER_CLIENT}영업일)
          </>
        ) : (
          <>
            {formatDiscoveryDate(item.discoveryDate)} (D+{item.daysAfter})
          </>
        )}{" "}
        · {item.entryClose.toLocaleString()} → <span className={priceColor}>{displayClose.toLocaleString()}</span>
      </span>
      <span className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`font-bold ${priceColor}`}>
          {displayReturnPct >= 0 ? "+" : ""}
          {displayReturnPct.toFixed(1)}%
        </span>
        <span className="text-slate-400 dark:text-zinc-500">
          (최고{" "}
          <span className={mrColor}>
            {item.maxReturnSoFarPct != null
              ? `${item.maxReturnSoFarPct >= 0 ? "+" : ""}${item.maxReturnSoFarPct.toFixed(1)}%`
              : "—"}
          </span>
          )
        </span>
      </span>
    </div>
  );
}

function QuantGroupedCard({ group }: { group: QuantSymbolGroup }) {
  const { symbol, name, events } = group;
  const allPending = events.every((e) => e.group === "pending");
  const allEnded = events.every((e) => e.group === "result" && e.endDate != null);
  const headerStateLabel = allPending ? "판단 대기" : allEnded ? "관찰 종료" : "관찰 중";

  // 관찰 지속성 보조표시(참고용 — 규칙 아님, daysAfter>=30 기준 변경 없음). 2026-09-18 재배치 —
  // 이전엔 이력 행마다 따로 붙었으나, 모든 카드가 동일한 요소 순서를 갖도록 카드 맨 아래 한
  // 곳으로 모은다. 신호가 여러 번이라 해당 건이 2개 이상이면 각각 날짜를 명시해 구분한다.
  const recentlyActiveEvents = events.filter((e) => e.endDate != null && e.isRecentlyActive);

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
        <span className="text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
          퀀트신호
        </span>
        <span
          className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
            headerStateLabel === "관찰 중"
              ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
              : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"
          }`}
          title={headerStateLabel === "관찰 종료" ? QUANT_OBSERVATION_END_DISCLAIMER : undefined}
        >
          {headerStateLabel}
        </span>
      </div>
      {events.length > 1 && (
        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">신호 {events.length}회 발생</p>
      )}
      <div>
        {events.map((item) => (
          <QuantHistoryRow key={item.discoveryDate} item={item} />
        ))}
      </div>
      {recentlyActiveEvents.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-zinc-800/80">
          {recentlyActiveEvents.map((item) => (
            <p key={item.discoveryDate} className="text-[11px] text-slate-400 dark:text-zinc-500">
              ⚡ 최근에도 변동성 지속 중 (참고)
              {events.length > 1 && ` — ${formatDiscoveryDate(item.discoveryDate)} 신호`}
            </p>
          ))}
        </div>
      )}
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

// 퀀트 신호 참고 통계 토글(§2-3) — 판정 조건 + 과거 유사조건 참고 통계(문장형, "대박률" 금지) +
// 최고점 기준 낙관적 시나리오(실현 아님 명시). 헤드라인 승률(§2-2)과 절대 섞이지 않도록 분리.
function QuantReferenceToggle({ stats }: { stats: QuantSignalStats }) {
  return (
    <CollapsibleSection label="퀀트신호 판정 기준 및 통계 근거 보기">
      <p className="text-xs text-slate-600 dark:text-zinc-300">판정 조건: {QUANT_SIGNAL_META.condition}</p>
      <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
        과거 통계는 표본이 작고 검증 중이라 화면에 표시하지 않습니다.
      </p>
      {stats.resultCount > 0 && (
        <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
          참고 지표: 거래당 기대값{" "}
          <span className={stats.expectancy > 0 ? "text-rose-500" : stats.expectancy < 0 ? "text-blue-500" : ""}>
            {stats.expectancy > 0 ? "+" : ""}
            {stats.expectancy}%
          </span>
          , 평균 최고수익률{" "}
          <span className={stats.avgMaxReturnSoFarPct && stats.avgMaxReturnSoFarPct > 0 ? "text-rose-500" : stats.avgMaxReturnSoFarPct && stats.avgMaxReturnSoFarPct < 0 ? "text-blue-500" : ""}>
            {stats.avgMaxReturnSoFarPct != null
              ? `${stats.avgMaxReturnSoFarPct >= 0 ? "+" : ""}${stats.avgMaxReturnSoFarPct.toFixed(2)}%`
              : "—"}
          </span>
        </p>
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

        <div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mb-1.5">
            {READ_GUIDE.evidenceIntro}
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            {READ_GUIDE.evidence.map((line, idx) => (
              <li key={idx} className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                {line}
              </li>
            ))}
          </ul>
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
  // 퀀트 신호 카드는 즐겨찾기 개념이 없으므로 "즐겨찾기만" 필터가 켜지면 표시하지 않는다.
  // 헤드라인 통계(승률/손익비 등)는 이 즐겨찾기 필터와 무관하게 항상 전체 표본 기준(data.quantSignalStats)
  // 이므로 아래 favoriteOnly/검색 필터링은 카드 목록 표시에만 영향을 준다.
  const quantSignalItemsFavFiltered = favoriteOnly ? [] : data.quantSignalItems;
  const quantPendingItemsBase = quantSignalItemsFavFiltered.filter((item) => item.group === "pending");
  const quantResultItemsBase = quantSignalItemsFavFiltered.filter((item) => item.group === "result");

  // §4: 검색어는 4컬럼 칸반뿐 아니라 퀀트 신호 트래커(판단대기+결과확인)에도 동일하게 적용된다.
  const quantSearchQuery = searchQuery.trim().toLowerCase();
  const matchesQuantSearch = (item: QuantSignalItem) =>
    quantSearchQuery.length === 0 ||
    item.name.toLowerCase().includes(quantSearchQuery) ||
    item.symbol.toLowerCase().includes(quantSearchQuery);
  const quantPendingItems = quantPendingItemsBase.filter(matchesQuantSearch);
  const quantResultItems = quantResultItemsBase.filter(matchesQuantSearch);

  // 동일 symbol이 서로 다른 발굴일에 여러 번 독립적으로 퀀트 신호 조건을 만족한 경우(정상 설계,
  // 2026-09-17 검증됨 — 예: 대원전선 7/3·7/14), 카드를 이벤트별로 따로 그리지 않고 종목(symbol)
  // 단위로 1장에 합친다(2026-09-18 재작업 — 이전 "퀀트신호 1/2" 배지 방식은 폐기). discoveryDate
  // 오름차순으로 정렬된 이력 목록을 한 카드 안에 세로로 나열한다.
  const quantPendingGroups = groupQuantItemsBySymbol(quantPendingItems);
  const quantResultGroups = groupQuantItemsBySymbol(quantResultItems);

  // §2: "결과 확인 중" 카드는 최근 20개 종목(그룹)만 기본 노출 + 토글로 전체 펼침. 검색 중일 때는
  // 페이지네이션을 무시하고 매칭되는 전체를 보여준다(검색 결과가 페이지네이션에 가려지면 안 됨).
  // 2026-09-18 재작업으로 카드 단위가 "이벤트"에서 "종목"으로 바뀌어 페이지 크기도 종목 수 기준.
  const QUANT_RESULT_PAGE_SIZE = 20;
  const quantResultGroupsVisible =
    isSearching || showAllQuantResults ? quantResultGroups : quantResultGroups.slice(0, QUANT_RESULT_PAGE_SIZE);

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

        {/* 퀀트 신호 트래커 — 칸반(포착 종목 전체 관찰)과 완전히 분리된 별도 트랙. "우리가 검증한
            진입 조건이 실제로 맞는지"를 기간 제한 없이 영구히 추적한다. 3일 미만은 "판단 대기",
            3일 이상은 "결과 확인 중"으로 나눠 보여준다. 항목 없으면 섹션 자체를 그리지 않는다. */}
        {quantSignalItemsFavFiltered.length > 0 && (
          <section className="mb-8 bg-amber-50/40 dark:bg-amber-950/10 rounded-3xl p-5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">
              ⚡ 퀀트 신호 트래커{!isSearching && ` ${quantSignalStats.totalCount}건`}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              RSI·거래량 조건 기반 장기 통계 검증 (몇 개월 단위 데이터 축적용)
            </p>
            {/* §1 — 검색 중에는 헤더 건수(전체 표본)와 실제 표시 카드 수가 달라 혼동될 수 있어
                별도로 분리 표시한다. 헤드라인 통계는 검색 여부와 무관하게 항상 전체 표본 기준이므로
                "(전체 표본 기준)"을 명시해 검색 결과 건수와 섞이지 않게 한다. */}
            {isSearching && (
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                검색 결과: {quantPendingItems.length + quantResultItems.length}건 표시 중
              </p>
            )}

            {/* 헤드라인 승률(§2-2) — 화면에 노출하는 유일한 "승률" 숫자. 3일차 규칙 실현손익
                시뮬레이션 기준(백엔드 realizedReturnPct)이며, 과거 통계상 참고 수치·최고점 기준
                낙관적 시나리오와는 절대 섞이지 않는다(그것들은 아래 토글에서만 노출). */}
            <p className="text-sm text-slate-700 dark:text-zinc-300 mt-1">
              {quantSignalStats.resultCount > 0 ? (
                <>
                  <span className="text-slate-400 dark:text-zinc-500">(전체 표본 기준)</span> 실전 검증{" "}
                  {quantSignalStats.resultCount}건({quantSignalStats.sampleSymbolCount}종목) · {quantSignalStats.realizedWinCount}승{" "}
                  {quantSignalStats.realizedLossCount}패 · 승률{" "}
                  <span className="font-bold">
                    {quantSignalStats.realizedWinRatePct != null
                      ? `${quantSignalStats.realizedWinRatePct.toFixed(1)}%`
                      : "—"}
                  </span>{" "}
                  · 손익비{" "}
                  <span className="font-bold">{quantSignalStats.profitFactor}</span>{" "}
                  <span className="text-slate-400 dark:text-zinc-500">(3일차 규칙 적용, 거래정지 종목 제외, 전체 이력 기준)</span>
                </>
              ) : (
                <span className="text-slate-400 dark:text-zinc-500">실전 검증 대기 중 (3일차 판정 필요)</span>
              )}
            </p>

            {/* 신뢰도 배지(§3) — 표본(unique 종목 수) 기준 등급. n≥60(목표 표본) 도달 전까지는
                자동으로 결론을 확정하지 않는다는 점을 명시해 과신을 방지한다. */}
            {(() => {
              const reliability = quantSignalReliability(quantSignalStats.sampleSymbolCount);
              return (
                <div className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                  <p>
                    {reliability.emoji} {reliability.label}
                  </p>
                  {reliability.showProgress && (
                    <p className="mt-0.5">
                      목표 표본 n≥{QUANT_RELIABILITY_TARGET_N}(종목기준) 도달 시 재평가 예정 (현재{" "}
                      {quantSignalStats.sampleSymbolCount}/{QUANT_RELIABILITY_TARGET_N})
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="mt-3 mb-4">
              <QuantReferenceToggle stats={quantSignalStats} />
            </div>

            {quantPendingItemsBase.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">
                  판단 대기 {quantPendingItems.length}건({quantPendingGroups.length}종목)
                </h3>
                {quantPendingGroups.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-zinc-500">일치하는 종목 없음</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                    {quantPendingGroups.map((group) => (
                      <QuantGroupedCard key={group.symbol} group={group} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {quantResultItemsBase.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">
                  결과 확인 중 {quantResultItems.length}건({quantResultGroups.length}종목)
                </h3>
                {quantResultGroups.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-zinc-500">일치하는 종목 없음</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                      {quantResultGroupsVisible.map((group) => (
                        <QuantGroupedCard key={group.symbol} group={group} />
                      ))}
                    </div>
                    {/* §2 페이지네이션 — 검색 중에는 숨김(전체 매칭 결과를 이미 그대로 보여주는 중) */}
                    {!isSearching && quantResultGroups.length > QUANT_RESULT_PAGE_SIZE && (
                      <button
                        onClick={() => setShowAllQuantResults((v) => !v)}
                        className="mt-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {showAllQuantResults
                          ? "최근 20종목만 보기"
                          : `전체 이력 보기 (${quantResultGroups.length}종목)`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {quantSignalStats.resultCount > 0 && (
              <div className="mt-4 bg-slate-50 dark:bg-zinc-950 rounded-2xl p-3 text-center">
                <p className="text-xs text-slate-600 dark:text-zinc-300">
                  평균 3일차 수익률{" "}
                  <span
                    className={
                      quantSignalStats.avgDay3ReturnPct != null
                        ? priceColorClass(quantSignalStats.avgDay3ReturnPct, 0)
                        : ""
                    }
                  >
                    {quantSignalStats.avgDay3ReturnPct != null
                      ? `${quantSignalStats.avgDay3ReturnPct >= 0 ? "+" : ""}${quantSignalStats.avgDay3ReturnPct.toFixed(2)}%`
                      : "—"}
                  </span>
                  , 평균 최고수익률{" "}
                  <span
                    className={
                      quantSignalStats.avgMaxReturnSoFarPct != null
                        ? priceColorClass(quantSignalStats.avgMaxReturnSoFarPct, 0)
                        : ""
                    }
                  >
                    {quantSignalStats.avgMaxReturnSoFarPct != null
                      ? `${quantSignalStats.avgMaxReturnSoFarPct >= 0 ? "+" : ""}${quantSignalStats.avgMaxReturnSoFarPct.toFixed(2)}%`
                      : "—"}
                  </span>{" "}
                  <span className="text-slate-400 dark:text-zinc-500">(참고 수치, 승률 아님)</span>
                </p>
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
                              dateLabel="최초 포착"
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
                                <CaptureInfo
                                  captureCount={item.captureCount}
                                  captureHistory={item.captureHistory}
                                  maxReturnPct={item.maxReturnPct}
                                  minReturnPct={item.minReturnPct}
                                  expanded={expandedSymbols.has(item.symbol)}
                                  onToggleExpand={() => toggleExpand(item.symbol)}
                                />
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
                          dateLabel="최초 포착"
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
                            <CaptureInfo
                              captureCount={item.captureCount}
                              captureHistory={item.captureHistory}
                              maxReturnPct={item.maxReturnPct}
                              minReturnPct={item.minReturnPct}
                              expanded={expandedSymbols.has(item.symbol)}
                              onToggleExpand={() => toggleExpand(item.symbol)}
                            />
                          }
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
        </div>
      </main>
    </div>
  );
}
