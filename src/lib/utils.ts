import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
  if (num === null || num === undefined) return "0";
  return new Intl.NumberFormat('ko-KR').format(num);
}

export function formatChange(num: number): string {
  if (num === null || num === undefined) return "0.00";
  return num.toFixed(2);
}

export function formatTime(isoString: string): string {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("ko-KR", { 
    hour: "2-digit", 
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}
