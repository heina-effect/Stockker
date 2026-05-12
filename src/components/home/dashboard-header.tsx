"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type ThemeMode = "light" | "dark" | "system";

const THEME_CYCLE: ThemeMode[] = ["light", "dark", "system"];
const THEME_LABELS: Record<ThemeMode, string> = {
  light: "라이트 모드",
  dark: "다크 모드",
  system: "시스템 설정",
};

function ThemeIcon({ theme }: { theme: string | undefined }) {
  if (theme === "dark") return <Moon className="h-[1.2rem] w-[1.2rem]" />;
  if (theme === "system") return <Monitor className="h-[1.2rem] w-[1.2rem]" />;
  return <Sun className="h-[1.2rem] w-[1.2rem]" />;
}

export function DashboardHeader() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function cycleTheme() {
    const current = (theme as ThemeMode) || "system";
    const idx = THEME_CYCLE.indexOf(current);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md">
      <div className="container mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Search className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-zinc-50">
              Stockker <span className="text-indigo-600 font-normal">Research</span>
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleTheme}
              title={THEME_LABELS[(theme as ThemeMode) || "system"]}
              className="rounded-full w-9 h-9 transition-colors"
              aria-label={`현재 테마: ${THEME_LABELS[(theme as ThemeMode) || "system"]}. 클릭하여 변경`}
            >
              <ThemeIcon theme={theme} />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
