import * as React from "react";

import { cn } from "@/lib/utils";

const PADDING = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
} as const;

type SurfaceCardProps = React.ComponentProps<"div"> & {
  padding?: keyof typeof PADDING;
  /**
   * "none" 이면 기본 배경(bg-white dark:bg-zinc-900)을 빼고 className 의 배경만 쓴다.
   * 그라데이션(bg-gradient-*)은 tailwind-merge 상 bg-color 와 다른 그룹이라
   * className 으로 넘겨도 기본 배경이 지워지지 않기 때문에 별도 스위치를 둔다.
   */
  background?: "default" | "none";
};

/** 화면 최상위 카드의 공통 골격. 레이아웃 클래스는 호출부 className 으로 넘긴다. */
export function SurfaceCard({
  padding = "md",
  background = "default",
  className,
  ...props
}: SurfaceCardProps) {
  return (
    <div
      className={cn(
        background === "default" && "bg-white dark:bg-zinc-900",
        "rounded-3xl border border-transparent shadow-sm",
        PADDING[padding],
        className
      )}
      {...props}
    />
  );
}
