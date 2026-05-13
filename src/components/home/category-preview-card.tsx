import { TrendingUp, Newspaper, Lightbulb, Zap } from "lucide-react";

interface CategoryPreviewCardProps {
  title: string;
  description: string;
  icon: "trending" | "news" | "lightbulb" | "zap";
}

export function CategoryPreviewCard({ title, description, icon }: CategoryPreviewCardProps) {
  const IconComponent = {
    trending: TrendingUp,
    news: Newspaper,
    lightbulb: Lightbulb,
    zap: Zap,
  }[icon];

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] p-6 border border-transparent shadow-sm hover:shadow-md transition-shadow cursor-pointer group flex flex-col h-full">
      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
        <IconComponent className="w-5 h-5" />
      </div>
      <h3 className="font-bold text-lg text-slate-900 dark:text-zinc-50 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed max-w-[90%]">
        {description}
      </p>
      <div className="mt-auto pt-4">
        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 group-hover:underline flex items-center gap-1">
          살펴보기 &rarr;
        </span>
      </div>
    </div>
  );
}
