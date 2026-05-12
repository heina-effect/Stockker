"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type ThemeMode = "light" | "dark" | "system";

const THEME_LABELS: Record<ThemeMode, string> = {
  light: "라이트 모드",
  dark: "다크 모드",
  system: "시스템 설정",
};

const THEME_OPTIONS: { value: ThemeMode; icon: ElementType }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

export function DashboardHeader() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = (theme as ThemeMode) || "system";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/85 backdrop-blur-md">
      <div className="container mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Search className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-foreground">
              Stockker <span className="text-indigo-600 font-normal">Research</span>
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="flex h-9 items-center gap-1 rounded-full border border-border bg-muted/70 p-1"
            aria-label="화면 표시 모드"
            role="group"
          >
            {mounted ? (
              THEME_OPTIONS.map(({ value, icon: Icon }) => {
                const selected = currentTheme === value;
                return (
                  <Button
                    key={value}
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(value)}
                    title={THEME_LABELS[value]}
                    aria-label={THEME_LABELS[value]}
                    aria-pressed={selected}
                    className={`size-7 rounded-full transition-colors ${
                      selected
                        ? "bg-card text-foreground shadow-sm hover:bg-card"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                );
              })
            ) : (
              <div className="h-7 w-[92px]" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
