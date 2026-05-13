import { Clock, AlertCircle } from "lucide-react";
import type { FreshnessState } from "@/types/research";

interface FreshnessLabelProps {
  type: "price" | "news" | "report" | "sentiment";
  state: FreshnessState;
  timestamp: string;
}

export function FreshnessLabel({ type, state, timestamp }: FreshnessLabelProps) {
  // Simple time ago calculator
  // eslint-disable-next-line
  const diffMinutes = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  let timeStr = "";
  
  if (diffMinutes < 1) timeStr = "방금 전";
  else if (diffMinutes < 60) timeStr = `${diffMinutes}분 전`;
  else if (diffMinutes < 1440) timeStr = `${Math.floor(diffMinutes / 60)}시간 전`;
  else timeStr = "하루 이상 지남";

  const typeName = {
    price: "가격",
    news: "뉴스",
    report: "리포트",
    sentiment: "감성점수"
  }[type];

  let config = {
    color: "text-slate-500 bg-slate-100 dark:bg-zinc-800",
    text: type === "report" ? "생성 중" : `${typeName} ${timeStr}`,
    icon: Clock
  };

  if (state === "stale" || state === "error") {
    config = {
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-500 border border-amber-200 dark:border-amber-900",
      text: type === "report" ? (state === "error" ? "최신 데이터 없음" : "근거 부족") : `${typeName} 지연됨`,
      icon: AlertCircle
    };
  } else if (state === "recent") {
    config = {
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900",
      text: type === "report" ? "근거 보통" : `${typeName} ${timeStr}`,
      icon: Clock
    };
  } else if (state === "live") {
    config = {
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900",
      text: type === "report" ? "근거 충분" : `${typeName} 실시간`,
      icon: Clock
    };
  }

  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.text}
    </div>
  );
}
