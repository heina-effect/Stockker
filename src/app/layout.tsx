import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { MockLiveProvider } from "@/components/dashboard/mock-live-provider";
import { LiveMarketProvider } from "@/components/dashboard/live-market-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stockker - Live Stock Dashboard",
  description: "Real-time stock dashboard baseline using Next.js 15",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-background text-foreground antialiased font-sans`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <MockLiveProvider>
            <LiveMarketProvider>
              <TooltipProvider>
                {children}
                <Toaster />
              </TooltipProvider>
            </LiveMarketProvider>
          </MockLiveProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
